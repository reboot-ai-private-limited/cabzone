# Cabzone — Zones & Geographic Configuration Module

**Document:** `docs/LLD/zones-module.md`  
**Status:** Engineering Specification  
**Version:** 2.0

## 1. Purpose

The Zones module is Cabzone's geographic configuration and geographic-facts subsystem.

It answers:
- What operational city does a point belong to?
- What city boundary/configuration applies?
- Is a destination inside the origin city's destination buffer?
- What geographic facts should Pricing, Service Classification, and Dispatch consume?

It does **not**:
- calculate fares;
- select or notify drivers;
- own route calculation;
- own toll calculation;
- silently change the rider's selected service;
- maintain `PICKUP`, `BUFFER`, `EXCLUSION`, `HILL`, `OUTSTATION`, `INTERSTATE`, `DISPATCH`, or `NOTIFICATION` zones.

**Core principle:** Zones store geographic facts and operational boundaries. Other modules make business decisions from those facts.

## 2. Final Geographic Model

Cabzone stores only one geographic zone type:

```text
CITY
```

### CITY

A CITY polygon represents Cabzone's operational geographic/pricing boundary.

It is used for:
- origin-city resolution;
- destination-city resolution;
- city configuration;
- city buffer configuration;
- pricing/service-classification context.

A CITY polygon does **not** mean pickups are restricted to it.

Cabzone supports **multiple active CITY boundaries** — one per operational city (Siliguri, Jalpaiguri, Darjeeling, and so on). Any point that falls inside any active CITY polygon resolves to that city and is treated as `IN_CITY`. There is no separate exclusion or veto layer: geographic classification is driven entirely by CITY membership and the destination buffer.

### Buffer Distance

Buffer is **not a zone** and is not persisted as a polygon.

It is city-level configuration:

```ts
bufferDistanceM: number
```

Conceptually it extends the CITY boundary outward for **destination classification**. The expanded polygon is derived when needed.

## 3. City vs CITY Zone

Keep the operational city identity separate from its boundary geometry.

```ts
interface CityEntity {
  id: string;
  name: string;
  code: string;
  stateCode: string;
  countryCode: string;
  timezone: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
}
```

```ts
interface ZoneEntity {
  id: string;
  cityId: string | null;
  type: 'CITY';
  name: string;
  code: string;
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
```

Each city has one active CITY boundary. Multiple cities may each have their own active CITY boundary at the same time; a point may belong to at most one active CITY (ambiguous overlap is a configuration error — see §7).

## 4. City Operational Configuration

Keep configuration separate from geometry.

```ts
interface CityOperationalConfig {
  id: string;
  cityId: string;
  bufferDistanceM: number;
  maxBufferTripDistanceM: number | null;
  version: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
}
```

`maxBufferTripDistanceM` is an optional safeguard and should not be enabled until explicitly approved.

Global fallback:

```ts
interface GeographicSettings {
  defaultBufferDistanceM: number;
  version: number;
  updatedAt: Date;
}
```

Effective buffer:

```text
city.bufferDistanceM
    ??
global.defaultBufferDistanceM
```

## 5. GeoJSON Contract

Application/API:

```json
{
  "lat": 26.7271,
  "lng": 88.3953
}
```

GeoJSON:

```json
{
  "type": "Point",
  "coordinates": [88.3953, 26.7271]
}
```

Rules:
- API/application uses `{lat, lng}`;
- GeoJSON/MongoDB uses `[lng, lat]`;
- conversion occurs at infrastructure boundaries;
- never mix coordinate ordering inside domain logic.

Supported geometry:
- Polygon
- MultiPolygon

## 6. Geometry Validation

Every CITY geometry must pass validation before activation.

Validate:
1. GeoJSON structure;
2. supported geometry type;
3. coordinate order;
4. latitude/longitude bounds;
5. ring closure;
6. minimum vertices;
7. polygon validity;
8. self-intersection/bow-tie;
9. normalization where applicable;
10. MongoDB 2dsphere compatibility;
11. active CITY overlap;
12. city association/configuration.

Invalid geometry must never become active.

Heavy GIS libraries are not required for MVP unless real requirements justify them.

## 7. Active CITY Overlap

Active operational CITY polygons must not overlap ambiguously.

If a point can belong to multiple active CITY polygons, classification is ambiguous.

Therefore Admin validation must reject ambiguous active CITY overlap.

Do not silently use nearest-city selection to hide invalid overlapping configuration.

## 8. Zone Repository

```ts
interface ZoneRepositoryPort {
  findActiveCitiesContainingPoint(point: GeoPoint): Promise<ZoneEntity[]>;
  findNearestActiveCity(point: GeoPoint): Promise<ZoneEntity | null>;
  findById(id: string): Promise<ZoneEntity | null>;
  save(zone: ZoneEntity): Promise<ZoneEntity>;
  list(filter?: ZoneFilter): Promise<ZoneEntity[]>;
}
```

The repository owns persistence, not service classification or pricing.

## 9. Geographic Resolution

Return geographic facts only:

```ts
interface GeographicContext {
  point: GeoPoint;
  cityZoneId: string | null;
  cityId: string | null;
  nearestCityZoneId: string | null;
  distanceToNearestCityBoundaryM: number | null;
  resolvedAt: Date;
}
```

Resolution:
1. Find active CITY polygons containing the point.
2. Exactly one match => resolve it.
3. No match => find nearest active CITY candidate.
4. Multiple active CITY matches => configuration error.

Nearest city is fallback context, not automatic origin-city assignment.

## 10. Pickup Rules

There is no PICKUP zone and no exclusion veto.

Any map-selected pickup is geographically allowed.

```text
pickup -> geographically allowed
```

Therefore a pickup may be:
- inside CITY;
- outside CITY;
- near CITY;
- rural/outside all CITYs.

The absence of a CITY polygon does not itself make a pickup invalid.

## 11. Origin City

The pickup establishes the origin city when it lies inside a CITY.

```text
pickup -> CITY Siliguri -> originCity = Siliguri
```

If pickup is outside every CITY:

```text
originCity = null
```

Do not invent an origin city solely from nearest-city proximity.

## 12. Destination Classification

Recommended deterministic rules:

### A. Drop inside origin CITY

```text
IN_CITY
bufferApplied = false
```

### B. Drop inside another active CITY

```text
OUTSTATION
bufferApplied = false
```

This prevents an origin city's buffer from swallowing another operational city.

### C. Drop outside all active CITYs

Calculate distance from the drop point to the origin CITY boundary.

```text
distance(dropPoint, originCityBoundary)
    <= effectiveBufferDistance
```

If true:

```text
IN_CITY
bufferApplied = true
```

Otherwise:

```text
OUTSTATION
bufferApplied = false
```

### D. No origin city

If pickup is outside every CITY, the Zones module returns `originCity = null`. The Service Classification module applies the explicit product policy for cityless origins.

## 13. Buffer Semantics

Buffer applies to the **drop**, not the pickup.

It:
- prevents the city boundary from being an unnecessarily hard city/outstation boundary;
- does not make an unserviceable pickup serviceable;
- does not override another active CITY;
- is not stored as a polygon.

Example:

```text
Siliguri CITY
       |
       | boundary
       |
       |------ 10 km ------|
                           |
                         DROP
```

If the drop is outside every other CITY and within the configured boundary distance, it can remain `IN_CITY`.

## 14. Service Classification Output

```ts
interface ZoneClassification {
  serviceType: 'CITY' | 'OUTSTATION';

  routeScope: 'INTRA_STATE' | 'INTERSTATE' | null;

  originCityId: string | null;
  originCityZoneId: string | null;

  destinationCityId: string | null;
  destinationCityZoneId: string | null;

  bufferApplied: boolean;
  effectiveBufferDistanceM: number | null;

  stateSegments: StateSegment[];

  classificationVersion: number;
}
```

Prefer separate `serviceType` and `routeScope`.

Example:

```text
serviceType = OUTSTATION
routeScope  = INTERSTATE
```

## 15. Interstate Detection

Interstate status is derived from the actual route, not merely from city names.

```text
route polyline
      |
      v
state boundary resolver
      |
      v
ordered state segments
```

```ts
interface StateSegment {
  stateCode: string;
  startPosition: number;
  endPosition: number;
  distanceM: number;
}
```

More than one state in the route => `INTERSTATE`.

Exactly one state => `INTRA_STATE`.

The state resolver remains separate from Zones.

## 16. Route Module Boundary

```ts
interface RouteService {
  calculateRoute(
    pickup: GeoPoint,
    drop: GeoPoint
  ): Promise<RouteResult>;
}
```

```ts
interface RouteResult {
  provider: string;
  providerRouteId: string;
  geometry: string;
  distanceM: number;
  durationS: number;
}
```

The routing provider can change without changing the Zone domain.

## 17. Tolls

Tolls are **not zones**.

Do not create `TOLL_ZONE`.

They belong to route/pricing:

```text
Route
 ├── distance
 ├── duration
 ├── geometry
 ├── state segments
 └── tolls
```

```ts
interface TollCharge {
  tollId: string;
  name: string;
  amountPaise: number;
  currency: 'INR';
  vehicleCategory: string;
}
```

A routing/toll provider may supply toll information. Pricing consumes it.

## 18. Dispatch Boundary

Driver notification is not part of Zones.

Zones provides:
- pickup geographic context;
- origin city;
- destination geographic context.

Dispatch decides which eligible drivers receive the request.

```text
Ride
 |
 v
Dispatch
 |
 +-- driver location
 +-- driver status
 +-- vehicle/service eligibility
 +-- geospatial distance
 +-- dispatch policy
 |
 v
candidate drivers
 |
 v
WebSocket / FCM
```

There is no `DISPATCH_ZONE` or `NOTIFICATION_ZONE`.

## 19. Driver Search

MVP can use configurable radius expansion:

```text
3 km -> 5 km -> 8 km -> 12 km
```

```ts
interface DispatchPolicy {
  initialRadiusM: number;
  expansionStepsM: number[];
  maxRadiusM: number;
  candidateLimit: number;
}
```

This belongs to Dispatch.

## 20. Admin Information Architecture

```text
Operations
  |
  +-- Cities
  +-- Zones
  +-- Drivers
  +-- Rides
```

## 21. Admin — Cities

Route:

```text
/cities
```

Features:
- search;
- status filter;
- state filter;
- city code;
- active/inactive;
- boundary status;
- buffer configuration status;
- last updated;
- create;
- open;
- activate/deactivate.

Example:

```text
City          State   Status     Buffer
Siliguri      WB      ACTIVE     10 km
Jalpaiguri    WB      ACTIVE     8 km
Darjeeling    WB      INACTIVE   5 km
```

## 22. Admin — Create City

Route:

```text
/cities/new
```

Steps:
1. Basic details
2. CITY boundary
3. Operational configuration
4. Validation
5. Review
6. Activate

Fields:
- name;
- code;
- state;
- country;
- timezone;
- status;
- buffer distance;
- optional max buffer trip distance.

A city cannot become ACTIVE without a valid CITY boundary.

## 23. Admin — City Detail

Route:

```text
/cities/:cityId
```

Sections:

### Overview
- name;
- code;
- state;
- timezone;
- status;
- created;
- updated.

### Boundary
- map;
- CITY polygon;
- version;
- validation status;
- edit geometry;
- import GeoJSON.

### Buffer
- enabled;
- buffer distance;
- global-default indicator;
- optional route-distance cap.

### Configuration
- operational settings;
- configuration version.

### History
- geometry changes;
- metadata changes;
- activation/deactivation;
- buffer changes.

## 24. Admin — Zones List

Route:

```text
/zones
```

Features:
- search;
- city filter;
- status filter;
- version;
- created/updated;
- open;
- create;
- activate/deactivate.

Type:

```text
CITY
```

## 25. Admin — Create Zone

Route:

```text
/zones/new
```

### Step 1 — Details

```text
Name
Code
City
Description
Status
```

### Step 2 — Geometry

Map editor:
- draw polygon;
- draw multipolygon where supported;
- edit vertices;
- delete vertices;
- undo/redo;
- GeoJSON import;
- fit bounds;
- coordinate display.

### Step 3 — Validate

Show:
```text
✓ GeoJSON valid
✓ Coordinates valid
✓ Ring closed
✓ Geometry valid
✓ No self-intersection
✓ CITY overlap valid
✓ City association valid
```

### Step 4 — Review

Show city, geometry, version, status and validation result.

### Step 5 — Save

Saving creates the initial version.

## 26. Admin — Geometry Editing

Never overwrite historical geometry.

```text
Version 1
   |
   | edit
   v
Version 2
```

Historical versions remain auditable.

## 27. Optimistic Concurrency

Every edit uses `expectedVersion`.

```text
zoneId
expectedVersion
newGeometry
```

If the version is stale:

```text
409 CONFLICT
```

The frontend reloads the latest version rather than silently overwriting another admin's change.

## 28. Admin — Activation / Deactivation

Deactivate operational zones instead of deleting them.

```text
ACTIVE -> INACTIVE
```

Historical rides/audits remain valid.

Do not hard-delete zones referenced by quotes, rides, or audit records.

## 29. Admin Validation API

```http
POST /api/v1/admin/zones/validate
```

Request:

```json
{
  "type": "CITY",
  "cityId": "city_siliguri",
  "geometry": {}
}
```

Response:

```json
{
  "valid": true,
  "violations": [],
  "warnings": []
}
```

This is a dry-run and does not persist or activate geometry.

## 30. Admin API

```text
GET    /api/v1/admin/cities
POST   /api/v1/admin/cities
GET    /api/v1/admin/cities/:cityId
PATCH  /api/v1/admin/cities/:cityId

POST   /api/v1/admin/cities/:cityId/activate
POST   /api/v1/admin/cities/:cityId/deactivate

GET    /api/v1/admin/zones
POST   /api/v1/admin/zones
GET    /api/v1/admin/zones/:zoneId

PATCH  /api/v1/admin/zones/:zoneId
PATCH  /api/v1/admin/zones/:zoneId/geometry

POST   /api/v1/admin/zones/validate

POST   /api/v1/admin/zones/:zoneId/activate
POST   /api/v1/admin/zones/:zoneId/deactivate

GET    /api/v1/admin/zones/:zoneId/history
GET    /api/v1/admin/cities/:cityId/zones
```

Geometry updates must require version checks.

## 31. Runtime Ports

```ts
interface GeographicResolver {
  resolvePoint(point: GeoPoint): Promise<GeographicContext>;
}

interface RideZoneClassifier {
  classify(
    input: RideClassificationInput
  ): Promise<ZoneClassification>;
}
```

Controllers should not contain polygon logic.

## 32. Backend Module Structure

```text
apps/api/src/modules/geography/
  domain/
    entities/
      city.ts
      zone.ts
      city-operational-config.ts
    value-objects/
      geo-point.ts
      geo-json-geometry.ts
    enums/
      zone-type.ts
      zone-status.ts

  application/
    use-cases/
      create-city.ts
      update-city.ts
      activate-city.ts
      deactivate-city.ts
      create-zone.ts
      update-zone.ts
      update-zone-geometry.ts
      activate-zone.ts
      deactivate-zone.ts
      validate-zone.ts
      resolve-geographic-context.ts
      classify-ride-geography.ts

  ports/
    city-repository.ts
    zone-repository.ts
    city-config-repository.ts
    geometry-validator.ts
    audit-repository.ts

  infrastructure/
    mongo/
      city-model.ts
      zone-model.ts
      city-config-model.ts
      mongo-city-repository.ts
      mongo-zone-repository.ts
    geometry/
      geojson-validator.ts
      point-in-polygon.ts
      boundary-distance.ts

  http/
    admin/
      cities-controller.ts
      zones-controller.ts
      zone-validation-controller.ts
    schemas/
      city.schemas.ts
      zone.schemas.ts

  tests/
    city.test.ts
    zone.test.ts
    zone-validation.test.ts
    zone-resolution.test.ts
    classification.test.ts
    versioning.test.ts
```

Routing, state segmentation, pricing and dispatch remain separate modules.

## 33. MongoDB

Use a 2dsphere index on stored geometry:

```js
db.zones.createIndex({
  geometry: "2dsphere"
});
```

Use additional indexes for common filters such as:
- `status`;
- `cityId`.

Keep one geographic source of truth; do not duplicate CITY geometry in multiple collections without a clear reason.

## 34. Geographic Query Strategy

For point resolution:

```text
1. Query active CITY candidates containing point.
2. Exactly one CITY -> resolve.
3. No CITY -> nearest active CITY candidate.
4. Multiple CITY -> configuration error.
```

As city count grows, use indexed spatial queries rather than loading all polygons into application memory.

## 35. Caching

Start without complex caching.

Later cache:
- active cities;
- active city configs;
- geometry versions where justified.

Invalidate on:
- zone activation;
- zone deactivation;
- geometry update;
- city activation/deactivation;
- city configuration update.

Never allow stale cache to alter an already accepted ride.

## 36. Audit Log

Every geographic mutation produces an append-only audit event.

```ts
interface ZoneAuditEvent {
  id: string;
  actorAdminId: string;

  action:
    | 'CREATED'
    | 'UPDATED'
    | 'GEOMETRY_UPDATED'
    | 'ACTIVATED'
    | 'DEACTIVATED';

  zoneId: string;

  previousVersion: number | null;
  newVersion: number | null;

  metadata: Record<string, unknown>;

  createdAt: Date;
}
```

City and CityConfig changes should have equivalent audit events.

## 37. Configuration Freeze

At Quote/Ride creation snapshot:

```text
originCityId
originCityZoneId
destinationCityId
destinationCityZoneId
bufferDistanceM
bufferApplied
zone versions
classification version
```

If route information is part of the quote, also snapshot:
- route provider;
- route version/id;
- distance;
- duration;
- state segments;
- toll estimate.

Admin changes must not modify an existing accepted ride.

## 38. Frontend Architecture

```text
apps/web/src/features/geography/
  cities/
    CitiesScreen.tsx
    CityDetails.tsx
    CreateCity.tsx
    CityBoundaryEditor.tsx
    CityBufferConfig.tsx

  zones/
    ZonesScreen.tsx
    ZoneDetails.tsx
    CreateZone.tsx
    ZoneEditor.tsx
    ZoneMap.tsx
    ZoneInspector.tsx
    ZoneValidation.tsx
    ZoneHistory.tsx

  shared/
    GeoMap.tsx
    GeoJsonImporter.tsx
    GeometryToolbar.tsx
    ValidationBanner.tsx
    VersionConflictDialog.tsx
```

Frontend never calculates authoritative final classification.

## 39. Map UX

Controls:

```text
[ City ]

[ Search location ]

[ Draw polygon ]
[ Edit ]
[ Import GeoJSON ]
[ Undo ]
[ Redo ]
[ Fit ]
```

Legend:

```text
CITY
```

City detail may show a derived buffer overlay for visualization.

The buffer overlay is never persisted as a zone.

## 40. Admin Validation UX

Show clear blocking errors:

```text
❌ CITY overlaps active CITY "Jalpaiguri"
❌ Invalid polygon: self intersection
⚠ Buffer exceeds configured maximum
✓ GeoJSON valid
✓ Coordinate order valid
```

Save/activate is disabled for blocking violations.

## 41. Test Matrix

### Geometry
- valid polygon;
- valid multipolygon;
- closed ring;
- minimum vertices;
- invalid coordinates;
- wrong coordinate order;
- self-intersection;
- malformed GeoJSON.

### CITY
- one active city;
- non-overlapping cities;
- overlapping city rejection;
- point inside city;
- point outside city;
- nearest-city fallback.

### Buffer
- drop inside origin city;
- drop outside origin city within buffer;
- drop outside buffer;
- drop inside another city;
- city override;
- global fallback.

### Versioning
- geometry version increments;
- metadata update behavior;
- stale version returns 409;
- historical versions preserved.

### Multi-city
- Siliguri -> Jalpaiguri;
- Siliguri -> outside all cities;
- pickup outside all cities;
- adjacent-city buffers;
- overlapping-city configuration rejected.

### Integration
- quote uses classification;
- pricing receives correct configuration version;
- ride snapshot is immutable;
- dispatch consumes geographic facts.

## 42. Explicit Non-Goals

```text
No PICKUP zones
No EXCLUSION zones
No BUFFER zone collection
No toll zones
No driver notification zones
No driver dispatch algorithm
No fare calculation
No surge calculation
No routing engine
No state-boundary ownership
No payment logic
No automatic City -> Outstation switching
No GIS microservice
No PostGIS migration
No complex GIS server
```

## 43. End-to-End Example

### Example A — City-fringe destination

```text
Pickup = Siliguri
Drop = 8 km beyond Siliguri
Siliguri buffer = 10 km
Drop is outside every other CITY
```

Result:

```text
originCity = Siliguri
serviceType = CITY
bufferApplied = true
```

### Example B — Another city

```text
Pickup = Siliguri
Drop = Jalpaiguri
```

Result:

```text
originCity = Siliguri
destinationCity = Jalpaiguri
serviceType = OUTSTATION
```

Even if the destination is physically within Siliguri's derived buffer.

### Example C — Pickup outside every CITY

```text
Pickup = outside all CITY polygons
Drop = Siliguri
```

Result:

```text
originCity = null
destinationCity = Siliguri
```

The Service Classification module applies the explicit product policy for cityless origins.

## 44. Final Module Boundaries

```text
                         Cabzone
                           |
        ┌──────────────────┼──────────────────┐
        |                  |                  |
     GEOGRAPHY           ROUTING           DISPATCH
        |                  |                  |
      CITY               route             drivers
      resolution         distance          radius
      buffer             duration          eligibility
                           polyline          notification
                           tolls
                           states
        |                  |
        └──────────┬───────┘
                   |
           SERVICE CLASSIFICATION
                   |
              CITY / OUTSTATION
                   |
             INTRA / INTERSTATE
                   |
                PRICING
                   |
                 QUOTE
                   |
                  RIDE
```

## 45. Core Invariants

1. Only `CITY` is a persisted geographic zone type.
2. Pickup is never geographically restricted; only CITY membership affects classification, not eligibility.
3. Users can select locations outside CITY boundaries.
4. Pickup determines origin city when it lies inside a CITY.
5. Buffer applies to the destination, not the pickup.
6. Buffer is a distance configuration, not a persisted zone.
7. Another active CITY takes precedence over an origin-city buffer.
8. Active CITY overlap is a configuration error.
9. Interstate status comes from route/state segmentation.
10. Tolls belong to routing/pricing, not Zones.
11. Driver notification belongs to Dispatch, not Zones.
12. Zone geometry is versioned and auditable.
13. Quote/Ride snapshots freeze the geographic configuration used.
14. Frontend visualizations are never geographic source of truth.
15. Zones exposes geographic facts; it does not make pricing, dispatch, or payment decisions.

## 46. Implementation Order

### Phase 1 — Core
- City entity
- Zone entity
- CITY geometry
- GeoJSON validation
- 2dsphere indexes

### Phase 2 — Admin
- Cities list/detail
- Create/edit City
- Zones list/detail
- Create/edit Zone
- Map editor
- GeoJSON import
- Validation
- Version conflict
- Audit
- Activation/deactivation

### Phase 3 — Runtime
- Point resolution
- Origin city resolution
- Destination city resolution
- Buffer calculation
- Geographic classification

### Phase 4 — Integration
- Route service
- State segmentation
- Pricing
- Quote snapshot
- Dispatch

### Phase 5 — Scale
- caching
- query optimization
- observability
- geographic performance metrics

Do not create a Geography microservice at this stage. The existing modular Node.js backend is sufficient. Extract only when actual scale or team boundaries justify it.

## 47. Final Mental Model

```text
                   MAP
                    |
             Pickup + Drop
                    |
                    v
               CITY lookup
                    |
             origin city found
                    |
                    v
              ROUTE ENGINE
                    |
          ┌─────────┼─────────┐
          |         |         |
       distance  duration   states
          |                   |
          └─────────┬─────────┘
                    |
                    v
              DROP CLASSIFIER
                    |
       ┌────────────┼────────────┐
       |            |            |
 origin CITY    another CITY   no CITY
       |            |            |
   IN_CITY      OUTSTATION    buffer check
                                  |
                           ┌──────┴──────┐
                         inside        outside
                         buffer        buffer
                           |              |
                        IN_CITY       OUTSTATION
                           |
                           v
                      SERVICE TYPE
                           |
                           v
                        PRICING
                           |
                           v
                         QUOTE
                           |
                           v
                       DISPATCH
```

This is the recommended **Cabzone Zones/Geography engineering baseline**: a single geographic primitive (CITY), explicit module boundaries, multi-city support, destination buffering without buffer polygons, versioned/auditable configuration, and no unnecessary GIS microservice.
