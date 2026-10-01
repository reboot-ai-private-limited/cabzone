# Cabzon — Geography, City Zones, States, State Pricing & Routing

**Status:** Updated implementation specification  
**Scope:** Backend + Admin Web + Geography + States + State Pricing + Routing + Estimated Toll  
**Architecture:** Modular monolith  
**Primary stack:** Node.js / TypeScript / MongoDB

---

## 1. Final Decisions

Cabzon's operational geography is intentionally simple:

- Operational zones are **CITY zones only**.
- There are **no EXCLUSION zones**.
- There are **no PICKUP zones**.
- A city can contain multiple CITY zones.
- Pickup must be inside an active CITY zone.
- State boundaries are reference geography, not operational zones.
- State boundaries are visually displayed in **yellow** in the admin map.
- States are managed from one **States** admin screen.
- State configuration determines whether intrastate and interstate destination service is available.
- State boundaries determine which state contains the destination.
- Unsupported destination states/areas are not serviceable.
- Toll is route data, not zone data.
- Routing provides an **estimated toll**; Pricing decides how that estimate affects the recommended fare.
- Quotes snapshot the geographic, state, route, toll, and pricing versions used to calculate them.

---

# 2. Admin Sidebar

```text
Dashboard

Operations
  KYC
  Drivers
  Rides

Configuration
  Cities
  Zones
  States

System
  Routing

Profile
Logout
```

There is no separate sidebar item for State Boundaries or State Pricing. Both belong inside **States**.

---

# 3. Geographic Model

```text
City
  |
  +-- CITY Zone 1
  +-- CITY Zone 2
  +-- CITY Zone 3

State
  |
  +-- State boundary geometry
  +-- State status
  +-- State pricing/service configuration

Route
  |
  +-- Polyline
  +-- Distance
  +-- Duration
  +-- Estimated toll
```

The important distinction is:

```text
CITY ZONE       = operational service area
STATE BOUNDARY  = geographic reference
STATE PRICING   = business/service rule
ROUTE           = actual journey data
```

---

# 4. City

A City is the business/geographic city entity.

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

Example:

```json
{
  "id": "city_siliguri",
  "name": "Siliguri",
  "code": "SLG",
  "stateCode": "WB",
  "countryCode": "IN",
  "timezone": "Asia/Kolkata",
  "status": "ACTIVE"
}
```

Cities manage identity and city-level configuration. Their service geometry is represented by City Zones.

---

# 5. City Zones

A City Zone is an operational service polygon.

```ts
interface CityZoneEntity {
  id: string;
  cityId: string;
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

A city can have multiple zones:

```text
Siliguri
  ├── CITY-SLG-01
  ├── CITY-SLG-02
  └── CITY-SLG-03
```

All active zones belonging to Siliguri collectively define its operational service area.

---

# 6. Pickup Serviceability

Pickup is serviceable only when it is inside an active CITY zone.

```text
Pickup
  |
  v
Active CITY zone?
  |
  +-- NO  -> NOT SERVICEABLE
  |
  +-- YES -> continue
```

There is no exclusion-zone override.

Do not create a separate pickup polygon type.

---

# 7. City Zone Validation

Before activation, a zone must pass:

- valid GeoJSON
- Polygon or MultiPolygon geometry
- valid coordinates
- non-empty geometry
- no self-intersection
- valid city reference
- city is active
- no ambiguous overlap with another active operational CITY zone

Zones are versioned.

Admin edits use optimistic concurrency/version checks.

---

# 8. State Entity

A State contains the reference boundary plus state-level operational status.

```ts
interface StateEntity {
  id: string;
  stateCode: string;
  name: string;
  countryCode: 'IN';
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon;
  boundaryVersion: number;
  status: 'ACTIVE' | 'INACTIVE';
  source: string;
  sourceVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

Do **not** add `STATE` to the Zone type.

```ts
type ZoneType = 'CITY';
```

State boundaries are reference GIS data.

---

# 9. State Boundary Visualisation

The admin map visually distinguishes the two geographic layers:

```text
CITY zones        -> operational zone styling
STATE boundaries  -> yellow boundary lines
```

The yellow state boundary provides geographic context and is used by the backend for state resolution.

---

# 10. States Admin Screen

The sidebar item is:

```text
Configuration
  States
```

The screen contains:

1. Available state list.
2. State status.
3. State boundary map.
4. Add state.
5. Edit state.
6. Enable/disable state.
7. Intrastate service configuration.
8. Interstate drop-off configuration.
9. State pricing configuration.

Example list:

```text
State           Code   Status     Intrastate   Interstate
----------------------------------------------------------
West Bengal     WB     Active     Enabled      Enabled
Bihar           BR     Active     Enabled      Enabled
Sikkim          SK     Active     Disabled     Enabled
Assam           AS     Disabled   Disabled     Disabled
```

---

# 11. State Detail

Example:

```text
West Bengal
WB

Status: ACTIVE

[ Yellow state boundary map ]

Boundary Version: 3

Serviceability
  Intrastate Outstation: Enabled
  Interstate Drop-off:   Enabled

Pricing
  Intrastate Pricing
  Interstate Pricing

[Edit] [Disable]
```

The state boundary is displayed in yellow.

---

# 12. State Add/Edit/Disable

State records support:

- add
- edit metadata/configuration
- enable
- disable
- boundary versioning
- history

Normal operational admins should not casually redraw official state boundaries. Production boundary geometry should come from a controlled GIS dataset/import process.

Disabling a state does not delete its boundary or historical data.

---

# 13. State Pricing

State Pricing determines the business behavior after the destination state is known.

```ts
interface StatePricingEntity {
  id: string;
  stateId: string;

  intrastate: {
    enabled: boolean;
    pricingConfigId: string | null;
  };

  interstateDropOff: {
    enabled: boolean;
    pricingConfigId: string | null;
  };

  version: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
}
```

The Pricing module owns the actual fare formula. State Pricing associates the relevant pricing configuration with the destination state and controls availability.

---

# 14. Geographic Fact vs Business Rule

State boundary answers:

> Which state contains this destination?

State Pricing answers:

> Does Cabzon support this destination and which pricing configuration applies?

Example:

```text
Destination point
      |
      v
Bihar boundary
      |
      v
Destination state = Bihar
      |
      v
Bihar interstateDropOff.enabled?
      |
      +-- NO  -> NOT SERVICEABLE
      |
      +-- YES -> apply Bihar interstate pricing
```

---

# 15. Service Classification

Cabzon uses two independent dimensions:

```text
Service Type:
  CITY
  OUTSTATION

Route Scope:
  INTRA_STATE
  INTERSTATE
```

Do not make `INTERSTATE` a service type.

---

# 16. In-City Ride

Example:

```text
Pickup: Siliguri CITY Zone 1
Drop:   Siliguri CITY Zone 2
```

Result:

```text
serviceType = CITY
routeScope = null
```

Normal city pricing applies.

---

# 17. Intrastate Outstation

Example:

```text
Pickup: Siliguri, West Bengal
Drop:   Durgapur, West Bengal
```

The drop is outside the origin city but inside the same state.

Result:

```text
serviceType = OUTSTATION
routeScope = INTRA_STATE
```

West Bengal intrastate/outstation configuration must be enabled.

---

# 18. Interstate Outstation

Example:

```text
Pickup: Siliguri, West Bengal
Drop:   Patna, Bihar
```

Result:

```text
serviceType = OUTSTATION
routeScope = INTERSTATE
```

The destination state's interstate drop-off configuration must be enabled.

---

# 19. Unsupported Destination

If the destination state/area is not supported:

```text
Pickup valid
    |
    v
Destination state unsupported
    |
    v
NOT SERVICEABLE
```

Use a structured error:

```ts
{
  code: 'DESTINATION_NOT_SERVICEABLE',
  message: 'Destination is outside the currently supported service area.'
}
```

Do not silently change the service type or destination.

---

# 20. Destination State Resolution

Destination state is resolved from the destination point:

```text
Destination coordinates
        |
        v
State 2dsphere lookup
        |
        v
Destination State
```

Repository port:

```ts
interface StateRepository {
  findContainingPoint(point: GeoPoint): Promise<StateEntity | null>;
  findIntersectingStates(geometry: GeoJsonLineString): Promise<StateEntity[]>;
}
```

If no state is resolved, do not guess.

---

# 21. Route State Segmentation

Destination state and route state are separate concepts.

Destination state:

```text
Destination point -> containing state
```

Route states:

```text
Route polyline
      |
      v
State boundary intersections
      |
      v
State segments
```

```ts
interface StateSegment {
  stateCode: string;
  startPosition: number;
  endPosition: number;
  distanceM: number;
}
```

Example:

```json
[
  { "stateCode": "WB", "distanceM": 78000 },
  { "stateCode": "BR", "distanceM": 332000 }
]
```

---

# 22. Interstate Detection

The authoritative route-scope decision should use the actual route geometry.

```text
Route crosses one state
    -> INTRA_STATE

Route crosses two or more states
    -> INTERSTATE
```

Do not rely only on city names.

If state resolution fails, return an explicit classification failure rather than silently assuming intrastate.

---

# 23. Route Module

Suggested structure:

```text
modules/route/
├── domain/
│   ├── RouteResult.ts
│   ├── TollInfo.ts
│   └── StateSegment.ts
├── application/
│   ├── CalculateRoute.ts
│   └── ResolveRouteStates.ts
├── ports/
│   ├── RouteProvider.ts
│   └── StateBoundaryResolver.ts
└── infrastructure/
    └── google/
        └── GoogleRoutesProvider.ts
```

---

# 24. Route Provider

Keep the routing provider behind an interface.

```ts
interface RouteProvider {
  calculateRoute(request: RouteRequest): Promise<RouteResult>;
}

interface RouteRequest {
  origin: GeoPoint;
  destination: GeoPoint;
  vehicleType: 'CAB' | 'E_RICKSHAW';
  includeTolls: boolean;
}

interface RouteResult {
  provider: string;
  providerRouteId: string | null;
  geometry: string;
  distanceM: number;
  durationS: number;
  toll: TollInfo | null;
}
```

Do not spread Google-specific code throughout the domain/application layers.

---

# 25. Estimated Toll

Toll is route information.

```ts
interface TollInfo {
  exists: boolean;
  estimatedAmountPaise: number | null;
  currency: 'INR';
  provider: string | null;
  isEstimate: boolean;
  commercialVehicleCaveat: boolean;
}
```

Example:

```json
{
  "exists": true,
  "estimatedAmountPaise": 18000,
  "currency": "INR",
  "provider": "google_routes",
  "isEstimate": true,
  "commercialVehicleCaveat": true
}
```

The application should display this as an estimated toll, not a guaranteed final toll.

---

# 26. Google Routes Integration

Google Routes can be used behind `RouteProvider` for:

- route geometry
- distance
- duration
- toll estimate

Conceptually:

```text
Origin
Destination
Vehicle information
       |
       v
Google Routes
       |
       +-- distance
       +-- duration
       +-- polyline
       +-- toll estimate
```

Request toll information explicitly and use a strict field mask for only required response fields.

The provider must remain replaceable.

---

# 27. Toll Responsibility

Route answers:

> What toll does the routing provider estimate?

Pricing answers:

> How should Cabzon include that estimate in the recommended fare?

Example:

```text
Route estimate
  Toll = ₹180
       |
       v
Pricing
  Include estimated toll = YES
       |
       v
Recommended fare
```

Do not calculate fare inside the Route module.

---

# 28. Toll Unavailable

A provider may know that a route has tolls but not return a usable price.

Represent this explicitly:

```json
{
  "exists": true,
  "estimatedAmountPaise": null,
  "isEstimate": true
}
```

Never convert unknown toll into `₹0`.

For MVP, the safe behavior is:

```text
Toll exists but amount unavailable
    -> do not invent amount
    -> pricing follows explicit fallback policy
```

---

# 29. Toll and Negotiated Fare

Example:

```text
Base/distance/time: ₹1,550
Estimated toll:     ₹180
---------------------------
Recommended fare:   ₹1,730
```

Rider proposes:

```text
₹1,600
```

Driver accepts:

```text
Agreed fare = ₹1,600
```

The agreed fare must not silently change because a later routing request returns a different toll estimate.

---

# 30. Quote Snapshot

A quote must freeze the inputs used for the financial decision.

```ts
interface QuoteGeoSnapshot {
  originCityId: string | null;
  originCityZoneId: string | null;

  destinationCityId: string | null;
  destinationCityZoneId: string | null;

  destinationStateCode: string | null;

  serviceType: 'CITY' | 'OUTSTATION';
  routeScope: 'INTRA_STATE' | 'INTERSTATE' | null;

  stateBoundaryVersion: number | null;
  cityZoneVersions: number[];
  statePricingVersion: number | null;
}

interface QuoteRouteSnapshot {
  provider: string;
  providerRouteId: string | null;
  distanceM: number;
  durationS: number;
  routeGeometry: string;
  toll: TollInfo | null;
}
```

Also snapshot the applicable pricing configuration version.

---

# 31. Full Quote Flow

```text
Rider selects pickup
        |
        v
Resolve active CITY zone
        |
        +-- not found -> NOT SERVICEABLE
        |
        v
Resolve origin City
        |
        v
Resolve destination
        |
        +-- inside origin City -> CITY RIDE
        |
        +-- outside origin City
                |
                v
         Resolve destination State
                |
                +-- unsupported -> NOT SERVICEABLE
                |
                v
          State Pricing
                |
          +-----+-----+
          |           |
      same state   different state
          |           |
          v           v
     INTRA_STATE  INTERSTATE
          |           |
          +-----+-----+
                |
                v
            Route API
                |
       +--------+--------+
       |        |        |
    distance duration   toll
                |
                v
       Route State Segments
                |
                v
             Pricing
                |
                v
              Quote
```

---

# 32. Geography Module Structure

```text
modules/geography/
├── domain/
│   ├── City.ts
│   ├── CityZone.ts
│   ├── State.ts
│   └── GeographicContext.ts
├── application/
│   ├── ResolvePickupContext.ts
│   ├── ResolveDestinationContext.ts
│   └── ResolveState.ts
├── ports/
│   ├── CityRepository.ts
│   ├── CityZoneRepository.ts
│   └── StateRepository.ts
└── infrastructure/
    └── mongo/
```

---

# 33. Geographic Context

```ts
interface GeographicContext {
  pickup: {
    cityId: string | null;
    cityZoneId: string | null;
  };

  destination: {
    cityId: string | null;
    cityZoneId: string | null;
    stateCode: string | null;
  };
}
```

This contains facts. It does not calculate fare.

---

# 34. Service Classification Module

Suggested location:

```text
modules/service-classification/
```

It consumes:

- GeographicContext
- RouteResult
- StateSegments
- State Pricing

and produces:

```ts
interface ServiceClassification {
  serviceType: 'CITY' | 'OUTSTATION';
  routeScope: 'INTRA_STATE' | 'INTERSTATE' | null;

  originCityId: string | null;
  originCityZoneId: string | null;

  destinationCityId: string | null;
  destinationCityZoneId: string | null;

  destinationStateCode: string | null;

  classificationVersion: number;
}
```

---

# 35. Pricing Module

Pricing consumes:

```text
ServiceClassification
RouteResult
State Pricing
PricingConfig
```

It calculates:

- base fare
- distance fare
- time fare
- state-specific pricing
- estimated toll treatment
- recommended fare

The frontend must never calculate these values as the source of truth.

---

# 36. Admin — Cities

Purpose:

> Manage city identity and city-level configuration.

List fields:

```text
City
Code
State
Status
Zones
Updated
```

City detail can show its associated CITY zones.

---

# 37. Admin — Zones

Purpose:

> Manage operational CITY polygons.

List:

```text
Zone
City
Type
Status
Version
Updated
```

`Type` is always:

```text
CITY
```

Map layers:

```text
CITY zone       -> operational styling
STATE boundary  -> yellow overlay
```

Actions:

```text
Create
Edit
Activate
Deactivate
View history
Validate
```

---

# 38. Admin — States

Purpose:

> Manage available states, state boundaries, serviceability, and state pricing configuration.

List:

```text
State
Code
Status
Intrastate
Interstate
Boundary Version
Updated
```

Actions:

```text
View
Edit
Enable
Disable
```

State detail contains:

```text
State identity
Status
Yellow boundary map
Boundary version
Intrastate availability
Interstate drop-off availability
Intrastate pricing
Interstate pricing
History
```

---

# 39. Admin — Routing

Keep the Routing screen simple.

Show:

```text
Provider
Status
Last successful request
Request count
Failure count
Average latency
Toll-enabled request count
```

Never expose API secrets.

---

# 40. MongoDB Collections

Recommended collections:

```text
cities
city_zones
states
state_pricing
```

Existing ride/quote/pricing collections remain separate.

---

# 41. MongoDB Indexes

City zones:

```js
db.city_zones.createIndex({ geometry: '2dsphere' });
db.city_zones.createIndex({ cityId: 1, status: 1 });
```

States:

```js
db.states.createIndex({ geometry: '2dsphere' });
db.states.createIndex({ stateCode: 1 }, { unique: true });
db.states.createIndex({ status: 1 });
```

State pricing:

```js
db.state_pricing.createIndex({ stateId: 1, status: 1 });
```

---

# 42. State Boundary Import

Production boundaries should come from a controlled GIS dataset.

```text
GIS dataset
    |
    v
Import script
    |
    v
GeoJSON validation
    |
    v
Geometry validation
    |
    v
State records
    |
    v
MongoDB
    |
    v
2dsphere index
```

Record:

```text
source
sourceVersion
boundaryVersion
import timestamp
```

Do not silently overwrite historical boundary versions.

Implementation (`POST /api/v1/admin/reference/states/import`, SUPER_ADMIN only):

- Everything is read from the file. The code comes from a code property (`stateCode`, `state_code`, `ST_CODE`, `STATE_CODE`, or the last part of an ISO `IN-WB` / HASC `IN.WB` value), else from the state name (`stateName`, `state_name`, `ST_NM`, `NAME_1`, `STATE`, `STATE_UT`, `STNAME`, `NAME`) via the standard table of all Indian states and UTs. Keys are case-insensitive; names are normalised (case, `&` vs `and`, spacing; Orissa/Odisha, Pondicherry/Puducherry).
- The dataset version is the collection's `version` / `datasetVersion` / `sourceVersion` (or the same on its first feature). A value typed in the import dialog overrides it.
- Every state in the file is imported. A state new to the system starts **ACTIVE only if it is a launch state** (WB, BR, SK, AS); any other new state is created **INACTIVE** (listed in `disabledOnImport`) and becomes serviceable only when an admin enables it on the States page. Existing states keep their current status. Features whose code cannot be determined are `rejected` with the name in the reason.
- Re-importing a state bumps its boundary `version`, keeps its status and serviceability flags, and appends an `IMPORTED` entry to `state_boundary_history` holding the replaced geometry.
- `configVersion` is separate from the boundary `version`: every edit/enable/disable bumps it, and optimistic concurrency checks it (`If-Match-Version` header or `expectedVersion` in the body; a stale value returns 409).
- Serviceability flags (`intrastateEnabled`, `interstateDropOffEnabled`) live on the state record for now. Fare rates stay in the pricing module's state pricing.
- Implemented under `/api/v1/admin/reference/states`: `GET /` (`?includeInactive=true`), `GET /:stateCode`, `PATCH /:stateCode`, `POST /:stateCode/activate`, `POST /:stateCode/deactivate`, `GET /:stateCode/history`. Not yet implemented: `POST /admin/states` (states are created by import) and `/:id/pricing`.

---

# 43. Versioning

Version:

- City Zones
- State boundaries
- State Pricing
- Pricing configurations

Quote snapshots retain the versions used at quote time.

Example:

```json
{
  "cityZoneVersion": 4,
  "stateBoundaryVersion": 2,
  "statePricingVersion": 7,
  "pricingConfigVersion": 12
}
```

---

# 44. Optimistic Concurrency

Admin edits should include the expected version.

Example:

```http
PATCH /admin/zones/:id
If-Match-Version: 4
```

If the current version is 5:

```text
409 VERSION_CONFLICT
```

Use the same principle for state pricing and zone/city configuration.

---

# 45. API Endpoints

## Cities

```http
GET    /admin/cities
POST   /admin/cities
GET    /admin/cities/:id
PATCH  /admin/cities/:id
POST   /admin/cities/:id/activate
POST   /admin/cities/:id/deactivate
```

## Zones

```http
GET    /admin/zones
POST   /admin/zones
GET    /admin/zones/:id
PATCH  /admin/zones/:id
POST   /admin/zones/:id/activate
POST   /admin/zones/:id/deactivate
GET    /admin/zones/:id/history
POST   /admin/zones/validate
```

## States

```http
GET    /admin/states
POST   /admin/states
GET    /admin/states/:id
PATCH  /admin/states/:id
POST   /admin/states/:id/activate
POST   /admin/states/:id/deactivate
GET    /admin/states/:id/pricing
PATCH  /admin/states/:id/pricing
GET    /admin/states/:id/history
```

## Routing

```http
GET /admin/routing/health
GET /admin/routing/metrics
```

---

# 46. Error Codes

Use explicit business errors:

```ts
type GeographyErrorCode =
  | 'PICKUP_NOT_SERVICEABLE'
  | 'DESTINATION_NOT_SERVICEABLE'
  | 'DESTINATION_STATE_UNSUPPORTED'
  | 'INTRASTATE_SERVICE_DISABLED'
  | 'INTERSTATE_SERVICE_DISABLED'
  | 'ROUTE_UNAVAILABLE'
  | 'STATE_CLASSIFICATION_FAILED'
  | 'TOLL_UNAVAILABLE';
```

Do not collapse all business failures into a generic 400.

---

# 47. Dispatch Boundary

Dispatch is not a geography-zone concern.

After quote/ride creation, Dispatch uses:

- current driver location
- driver eligibility
- vehicle type
- availability
- wallet status
- ride constraints

Do not create dispatch zones.

---

# 48. Buffer

Do not create a persisted BUFFER zone.

If a city-level buffer remains part of the product configuration, it is a configuration value, not a polygon.

```ts
interface CityOperationalConfig {
  cityId: string;
  bufferDistanceM: number;
  version: number;
  status: 'ACTIVE' | 'INACTIVE';
}
```

It must not be used as a pickup serviceability polygon.

---

# 49. Caching

Good cache candidates:

```text
Active cities
Active city zones
State boundaries
Active state configuration
State pricing
```

State boundaries are especially suitable for process memory/Redis because they change rarely.

Routing/toll responses should not be treated as permanent reference data.

---

# 50. Route Request Optimization

Do not request routes on every map movement.

Bad:

```text
drag -> route
drag -> route
drag -> route
```

Better:

```text
pickup selected
      |
destination selected
      |
debounce
      |
route request
```

The authoritative quote calculation still validates/calculates the route required for the quote.

---

# 51. Route Preview vs Quote Route

Separate:

```text
Route Preview
```

from:

```text
Authoritative Quote Route
```

A preview is UI assistance. The quote route is the financial source used for the quote snapshot.

---

# 52. Test Matrix

## City Zones

```text
point inside zone
point outside zone
multiple zones in one city
multiple cities
inactive zone
invalid geometry
overlap
```

## States

```text
point inside West Bengal
point inside Bihar
boundary-near point
unsupported state
inactive state
```

## Service Classification

```text
same city
different city, same state
different state
unsupported state
```

## Route State Segmentation

```text
WB only
WB -> BR
WB -> BR -> JH
```

## Toll

```text
no toll
toll with estimate
toll without estimate
provider timeout
provider failure
```

## Quote

```text
valid city ride
valid intrastate outstation
valid interstate outstation
unsupported destination
pricing disabled
toll unavailable
```

---

# 53. Implementation Order

## Phase 1 — Cities + City Zones

- City entity
- City repository
- City Zone entity
- GeoJSON validation
- 2dsphere index
- point-in-zone resolution
- multiple zones per city
- Cities admin screen
- Zones admin screen

## Phase 2 — States

- State entity
- controlled boundary dataset
- import pipeline
- geometry validation
- 2dsphere index
- point-to-state resolver
- States list
- State detail
- yellow boundary visualization
- add/edit/enable/disable

## Phase 3 — State Pricing

- StatePricing entity
- intrastate service configuration
- interstate drop-off configuration
- pricing associations
- state pricing UI
- versioning

## Phase 4 — Routing

- RouteProvider interface
- RouteResult
- route geometry
- distance
- duration
- provider integration

## Phase 5 — Estimated Toll

- TollInfo
- provider toll request
- estimated toll
- unavailable toll handling
- Pricing integration
- quote snapshot

## Phase 6 — Route State Classification

- route polyline
- candidate state boundaries
- line/boundary intersection
- state segments
- INTRA_STATE / INTERSTATE

## Phase 7 — Quote Integration

- geography
- destination state serviceability
- route
- toll
- state pricing
- fare pricing
- quote snapshot
- negotiation
- ride creation

---

# 54. Non-Goals

Do not implement:

```text
EXCLUSION zones
PICKUP zones
STATE operational zones
TOLL zones
DISPATCH zones
NOTIFICATION zones
manual toll-plaza database
FASTag management
commercial toll settlement engine
complex GIS editing platform
automatic city -> outstation switching
dynamic surge
```

---

# 55. Final Architecture

```text
                         CABZON
                            |
              +-------------+-------------+
              |                           |
           CITIES                       STATES
              |                           |
        CITY ZONES                Yellow boundaries
              |                           |
              |                    State serviceability
              |                           |
              |                    State Pricing
              |                           |
              +-------------+-------------+
                            |
                       CLASSIFICATION
                            |
                    +-------+-------+
                    |               |
                  CITY          OUTSTATION
                                    |
                         +----------+----------+
                         |                     |
                    INTRA_STATE            INTERSTATE
                         |                     |
                         +----------+----------+
                                    |
                                  ROUTE
                                    |
                       +------------+------------+
                       |            |            |
                    Distance     Duration     Toll Estimate
                       |            |            |
                       +------------+------------+
                                    |
                                  PRICING
                                    |
                                   QUOTE
                                    |
                                NEGOTIATION
                                    |
                                   RIDE
```

---

# 56. Core Invariants

1. Only `CITY` is an operational zone type.
2. Pickup must be inside an active CITY zone.
3. Multiple CITY zones can belong to one city.
4. There are no exclusion zones.
5. State boundaries are reference geography.
6. State boundaries are displayed in yellow in the admin UI.
7. State boundaries determine geographic destination state.
8. State configuration determines whether a destination state is supported.
9. Same-city destination is `CITY` service.
10. Different city in the same state is `OUTSTATION + INTRA_STATE`.
11. Different state is `OUTSTATION + INTERSTATE`.
12. Unsupported destination state/area is `NOT SERVICEABLE`.
13. State Pricing controls state-specific serviceability and pricing.
14. Toll belongs to Route, not Geography.
15. Toll returned by a routing provider is an estimate.
16. Pricing decides how estimated toll affects the recommended fare.
17. Agreed fare must not silently change after negotiation.
18. City zones, state boundaries, state pricing, and fare configurations are versioned.
19. Quotes snapshot the versions used to calculate them.
20. Geography does not calculate money.
21. Routing does not calculate fares.
22. Pricing does not own geographic geometry.
23. Dispatch does not require dispatch-specific zones.
24. State boundary data should be maintained as controlled reference GIS data.

---

# 57. Final Decision Summary

```text
CITY
  |
  +-- multiple CITY ZONES
  |
  +-- pickup serviceability

STATE
  |
  +-- yellow boundary
  +-- destination state detection
  +-- active/inactive
  +-- state service configuration
  +-- state pricing association

ROUTE
  |
  +-- distance
  +-- duration
  +-- polyline
  +-- estimated toll

CLASSIFICATION
  |
  +-- CITY / OUTSTATION
  +-- INTRA_STATE / INTERSTATE

PRICING
  |
  +-- state-specific rules
  +-- toll treatment
  +-- recommended fare

QUOTE
  |
  +-- immutable snapshot
  +-- rider proposal
  +-- driver acceptance
  +-- agreed fare
```

This is the final simplified geography/state/routing architecture for Cabzon: **CITY zones define pickup serviceability, yellow state boundaries identify destination state, States control state-level availability and pricing, Route provides distance/duration/toll, and Pricing turns those inputs into the quote.**
