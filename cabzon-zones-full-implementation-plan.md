# Cabzonee Zones Tab & Backend — Full Implementation Plan

## 1. Objective

Implement the complete Cabzonee Zones system as a vertical slice:

```text
Domain → Geometry/Validation → Repository → Admin API
→ Audit/Versioning → Zone Resolution → Admin Web → Runtime Integration
```

The Zones system is the operational control plane for Cabzonee's geographic coverage.

It manages:

- `CITY` boundaries
- `PICKUP` coverage
- `EXCLUSION` areas

Backend zone resolution remains authoritative.

---

## 2. Architecture

```text
                         ADMIN WEB
                            │
                            ▼
                    ┌───────────────┐
                    │ Zones Screen  │
                    └───────┬───────┘
                            │
                  REST API / JSON
                            │
                            ▼
                 ┌────────────────────┐
                 │ Zone HTTP Layer    │
                 │ auth + validation  │
                 └─────────┬──────────┘
                           │
                           ▼
                 ┌────────────────────┐
                 │ Zone Use Cases     │
                 │                    │
                 │ CreateZone         │
                 │ UpdateMetadata     │
                 │ UpdateGeometry     │
                 │ ResolveZones       │
                 │ ValidateZone       │
                 │ DeactivateZone     │
                 │ ListZones          │
                 └─────────┬──────────┘
                           │
                           ▼
                 ┌────────────────────┐
                 │ ZoneRepositoryPort │
                 └─────────┬──────────┘
                           │
                           ▼
                 ┌────────────────────┐
                 │ MongoZoneRepository│
                 └─────────┬──────────┘
                           │
                           ▼
                       MongoDB
                    ┌────────────┐
                    │ zones      │
                    │ zone_audit │
                    └────────────┘
```

Runtime:

```text
Rider pickup/drop
       │
       ▼
ResolveZones
       │
       ├── CITY
       ├── PICKUP
       ├── EXCLUSION
       ├── nearestCity
       └── isWithinBuffer
       │
       ▼
ServiceClassification
       │
       ▼
Pricing
       │
       ▼
Quote
```

**Core rule:** Zones describes geographic facts. It does not calculate fares, determine dispatch winners, or perform service classification.

---

# 3. Zone Types

Cabzonee has exactly three zone types:

```ts
export const ZONE_TYPES = [
  'CITY',
  'PICKUP',
  'EXCLUSION',
] as const;

export type ZoneType = (typeof ZONE_TYPES)[number];
```

### CITY

Defines the geographic city boundary.

Responsibilities:

- city classification input
- nearest-city lookup
- buffer calculation
- geographic provenance

### PICKUP

Defines active Cabzonee pickup/service coverage.

Responsibilities:

- pickup serviceability
- dispatch eligibility input

### EXCLUSION

Defines an explicit unavailable area.

Rules:

```text
Pickup inside EXCLUSION
    → PICKUP_IN_EXCLUSION_ZONE

Drop inside EXCLUSION
    → DROP_IN_EXCLUSION_ZONE

Driver inside EXCLUSION
    → excluded from dispatch broadcast
```

### No HILL zone

Do not create `HILL`, `MOUNTAIN`, or `TERRAIN` zones. Terrain is handled by routing distance/duration and driver acceptance.

---

# 4. GeoJSON Contract

GeoJSON and MongoDB use:

```text
[lng, lat]
```

not `[lat, lng]`.

Example:

```json
{
  "type": "Polygon",
  "coordinates": [
    [
      [88.3901, 26.7201],
      [88.4001, 26.7201],
      [88.4001, 26.7301],
      [88.3901, 26.7301],
      [88.3901, 26.7201]
    ]
  ]
}
```

Recommended package:

```text
packages/geo/
└── src/
    ├── coords.ts
    ├── polygon.ts
    ├── validation.ts
    ├── point-in-polygon.ts
    └── index.ts
```

Functions:

```ts
toPosition({ lat, lng }) -> [lng, lat]
fromPosition([lng, lat]) -> { lat, lng }
toGeoJsonPoint({ lat, lng }) -> GeoJSON Point
```

Do not scatter coordinate conversion throughout the application.

---

# 5. Database Design

Collection:

```text
zones
```

Suggested document:

```ts
interface ZoneDocument {
  _id: string;

  type: 'CITY' | 'PICKUP' | 'EXCLUSION';

  name: string;
  code: string;

  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };

  status: 'ACTIVE' | 'INACTIVE';

  version: number;

  supersedesZoneId: string | null;
  supersededByZoneId: string | null;

  createdBy: string;
  updatedBy: string;

  createdAt: Date;
  updatedAt: Date;
}
```

Optional metadata can be added later:

```ts
description?: string;
metadata?: Record<string, unknown>;
```

---

# 6. MongoDB Indexes

Required:

```js
{ geometry: "2dsphere" }
```

Additional useful indexes:

```text
type + status
code + version
status + type
createdAt
```

Potential compound indexes:

```js
{ type: 1, status: 1 }
{ code: 1, version: -1 }
```

Verify the `2dsphere` index during API startup.

---

# 7. Backend Folder Structure

```text
apps/api/src/modules/zones/

├── domain/
│   ├── entities/
│   │   └── zone.entity.ts
│   ├── value-objects/
│   │   ├── zone-type.ts
│   │   ├── zone-status.ts
│   │   └── geo-point.ts
│   └── errors/
│       ├── zone.errors.ts
│       └── geometry.errors.ts
│
├── application/
│   ├── create-zone.usecase.ts
│   ├── update-zone-metadata.usecase.ts
│   ├── update-zone-geometry.usecase.ts
│   ├── validate-zone.usecase.ts
│   ├── resolve-zones.usecase.ts
│   ├── list-zones.usecase.ts
│   ├── get-zone.usecase.ts
│   ├── deactivate-zone.usecase.ts
│   └── get-zone-history.usecase.ts
│
├── infrastructure/
│   ├── persistence/
│   │   ├── mongo-zone.repository.ts
│   │   ├── zone.model.ts
│   │   └── zone.mapper.ts
│   └── audit/
│       ├── zone-audit.model.ts
│       └── mongo-zone-audit.repository.ts
│
├── interface/
│   └── http/
│       ├── zones.routes.ts
│       ├── zones.controller.ts
│       ├── zones.schemas.ts
│       └── zones.presenter.ts
│
└── zones.public.ts
```

---

# 8. Shared Contracts

Recommended:

```text
packages/contracts/src/zones/
```

Contracts:

```text
ZoneDto
CreateZoneRequest
UpdateZoneMetadataRequest
UpdateZoneGeometryRequest
ValidateZoneRequest
ZoneListQuery
ZoneAuditDto
ZoneValidationResult
```

Example:

```ts
export interface ZoneDto {
  id: string;
  type: ZoneType;
  name: string;
  code: string;
  geometry: GeoJsonPolygon;
  status: ZoneStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}
```

Use Zod for request validation.

---

# 9. Zone Repository

```ts
export interface ZoneRepositoryPort {
  findActiveExclusionsContainingPoint(
    point: GeoPoint
  ): Promise<ZoneEntity[]>;

  findActiveCitiesContainingPoint(
    point: GeoPoint
  ): Promise<ZoneEntity[]>;

  findActivePickupsContainingPoint(
    point: GeoPoint
  ): Promise<ZoneEntity[]>;

  findNearestActiveCity(
    point: GeoPoint
  ): Promise<ZoneEntity | null>;

  findById(
    id: string
  ): Promise<ZoneEntity | null>;

  save(
    zone: ZoneEntity
  ): Promise<ZoneEntity>;

  list(
    filter?: ZoneFilter
  ): Promise<ZoneEntity[]>;
}
```

Implement:

```text
MemoryZoneRepository
MongoZoneRepository
```

---

# 10. Geometry Validation Engine

Create:

```ts
validateZone(input)
```

Output:

```ts
interface ZoneValidationResult {
  valid: boolean;
  violations: ZoneViolation[];
}
```

Violation:

```ts
interface ZoneViolation {
  code: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
  offendingZoneId?: string;
  offendingGeometry?: GeoJsonGeometry;
}
```

---

# 11. Cabzonee Validation Rules

### Z-001 — Invalid Geometry

Polygon/MultiPolygon must be structurally valid.

### Z-002 — Ring Closure

First coordinate must equal the last coordinate.

Valid:

```text
[A, B, C, A]
```

Invalid:

```text
[A, B, C]
```

### Z-003 — Minimum Polygon Structure

At least three distinct vertices.

### Z-004 — Coordinate Validity

```text
longitude: -180 → 180
latitude:   -90 → 90
```

### Z-005 — Self Intersection

Reject bow-tie/self-intersecting polygons.

### Z-006 — Supported Geometry

Support:

```text
Polygon
MultiPolygon
```

Reject unsupported geometry types.

### Z-007 — Same-Type Conflicts

Detect conflicting active zones of the same operational type where overlap creates ambiguity.

### Z-008 — Conflicting CITY configuration

Two active CITY zones containing the same operational point should be treated as a configuration fault.

### Z-009 — EXCLUSION precedence

EXCLUSION may overlap CITY/PICKUP.

For serviceability:

```text
EXCLUSION > PICKUP
EXCLUSION > CITY
```

---

# 12. Do Not Add Arbitrary Area Limits

Do not initially enforce arbitrary rules such as:

```text
minimum 1 hectare
maximum 100,000 km²
```

unless Cabzonee has an explicit business requirement for them.

---

# 13. Create Zone API

```http
POST /api/v1/admin/zones
```

Request:

```json
{
  "type": "PICKUP",
  "name": "Siliguri West",
  "code": "SLG_WEST",
  "geometry": {
    "type": "Polygon",
    "coordinates": []
  }
}
```

Pipeline:

```text
HTTP
 ↓
Authentication
 ↓
Authorization
 ↓
Zod validation
 ↓
Coordinate validation
 ↓
Geometry normalization
 ↓
Geometry validation
 ↓
Conflict validation
 ↓
Repository save
 ↓
Audit
 ↓
Response
```

Response:

```http
201 Created
```

---

# 14. Zone Validation API

```http
POST /api/v1/admin/zones/validate
```

Request:

```json
{
  "type": "PICKUP",
  "geometry": {
    "type": "Polygon",
    "coordinates": []
  },
  "excludeZoneId": null
}
```

Response:

```json
{
  "valid": false,
  "violations": [
    {
      "code": "ZONE_OVERLAP",
      "severity": "ERROR",
      "message": "Polygon overlaps active pickup zone SLG_WEST",
      "offendingZoneId": "..."
    }
  ]
}
```

This is a dry-run and must not mutate the database.

---

# 15. Update Geometry API

```http
PATCH /api/v1/admin/zones/:id/geometry
```

Request:

```json
{
  "expectedVersion": 3,
  "geometry": {}
}
```

Optimistic concurrency:

```text
Admin A opened v3
Admin B opened v3

Admin B saves
→ v4

Admin A tries to save v3
→ 409 ZONE_VERSION_CONFLICT
```

Never silently overwrite the newer version.

---

# 16. Geometry Versioning

Do not simply overwrite active geometry.

Use:

```text
zone v1
  ↓
zone v2
  ↓
zone v3
```

Geometry update:

```text
old version → INACTIVE
new version → ACTIVE
```

Version transition and audit entry should happen in one transaction.

---

# 17. Metadata Updates

Metadata such as:

```text
name
description
display metadata
```

can be updated without creating a geometry version.

For behavior-changing fields such as `type`, avoid in-place mutation.

Prefer:

```text
deactivate old zone
create new zone
```

---

# 18. Activation / Deactivation

```http
POST /api/v1/admin/zones/:id/activate
POST /api/v1/admin/zones/:id/deactivate
```

Do not physically destroy zone data.

---

# 19. Hard Delete

Do not implement hard deletion in the first MVP.

Historical zone configuration can matter for:

- audits
- debugging
- ride reconstruction
- incident investigation

Use:

```text
INACTIVE
SUPERSEDED
```

instead.

---

# 20. Audit Log

Collection:

```text
zone_audit_logs
```

Model:

```ts
interface ZoneAuditLog {
  id: string;

  zoneId: string;

  action:
    | 'CREATE'
    | 'UPDATE_METADATA'
    | 'UPDATE_GEOMETRY'
    | 'ACTIVATE'
    | 'DEACTIVATE';

  actorId: string;

  before: unknown | null;
  after: unknown | null;

  reason?: string;

  createdAt: Date;
}
```

Geometry updates should record:

```text
before.geometry
after.geometry
```

---

# 21. Admin Zones API Surface

```text
GET    /api/v1/admin/zones
GET    /api/v1/admin/zones/:id

POST   /api/v1/admin/zones
POST   /api/v1/admin/zones/validate

PATCH  /api/v1/admin/zones/:id
PATCH  /api/v1/admin/zones/:id/geometry

POST   /api/v1/admin/zones/:id/activate
POST   /api/v1/admin/zones/:id/deactivate

GET    /api/v1/admin/zones/:id/history
```

Later:

```text
GET /api/v1/admin/zones/:id/dependents
```

---

# 22. List API

Example:

```http
GET /api/v1/admin/zones?type=PICKUP&status=ACTIVE&search=siliguri
```

Response:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3
  }
}
```

The list endpoint should return lightweight metadata. Do not return full historical geometry for every row.

---

# 23. Zone Resolution Backend

`ResolveZonesUseCase` is responsible for geographic facts only.

```text
pickup point
    │
    ├── active EXCLUSION?
    │       └── pickupExclusion
    │
    ├── CITY?
    │       └── city
    │
    ├── PICKUP?
    │       └── pickupCoverage
    │
    └── nearest CITY
            │
            └── isWithinBuffer
```

Return:

```ts
interface ResolvedZones {
  pickupExclusion: ZoneDto | null;
  dropExclusion: ZoneDto | null;
  city: ZoneDto | null;
  pickupCoverage: ZoneDto | null;
  nearestCity: ZoneDto | null;
  isWithinBuffer: boolean;
}
```

---

# 24. EXCLUSION Must Be Checked First

Pickup:

```text
Resolve pickup
      ↓
EXCLUSION?
      ↓
YES
      ↓
422 PICKUP_IN_EXCLUSION_ZONE
```

Drop:

```text
Resolve drop
      ↓
EXCLUSION?
      ↓
YES
      ↓
422 DROP_IN_EXCLUSION_ZONE
```

This prevents a pickup zone from accidentally overriding an exclusion.

---

# 25. Buffer

Do not store:

```text
BUFFER
```

as a zone type.

Use:

```ts
nearestCity
isWithinBuffer
```

as derived information.

---

# 26. Service Classification Boundary

Keep:

```text
ResolveZones
```

separate from:

```text
ServiceClassification
```

Example:

```text
Pickup
  ↓
ResolveZones
  ↓
city = Siliguri
pickupCoverage = Siliguri West
exclusion = null
  ↓
route state segments
  ↓
ServiceClassification
  ↓
IN_CITY / OUTSTATION / INTERSTATE
```

Zones must not directly decide that a ride is outstation.

---

# 27. Admin Frontend Structure

```text
apps/web/src/features/zones/

├── components/
│   ├── ZonesScreen.tsx
│   ├── ZonesToolbar.tsx
│   ├── ZonesTable.tsx
│   ├── ZoneMap.tsx
│   ├── ZoneInspector.tsx
│   ├── ZoneDetails.tsx
│   ├── ZoneForm.tsx
│   ├── ZoneViolations.tsx
│   ├── ZoneHistory.tsx
│   ├── GeoJsonImportDialog.tsx
│   ├── DeactivateZoneDialog.tsx
│   └── ZoneStatusBadge.tsx
│
├── hooks/
│   ├── useZones.ts
│   ├── useZone.ts
│   ├── useZoneValidation.ts
│   ├── useZoneMutations.ts
│   └── useZoneHistory.ts
│
├── lib/
│   ├── geojson.ts
│   ├── coordinates.ts
│   └── map.ts
│
└── types/
    └── zones.ts
```

---

# 28. Zones Page

URL:

```text
/zones
```

Map view:

```text
/zones?view=map
```

List view:

```text
/zones?view=list
```

Selected zone:

```text
/zones?view=map&zone=<id>
```

URL state should contain only:

- current view
- selected zone

Ephemeral form/draft state stays in React state.

---

# 29. Zones Screen Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Zones                                      [+ Create Zone]    │
├──────────────┬───────────────────────────────────────────────┤
│              │                                               │
│ CITY         │                  MAP                          │
│ 12           │                                               │
│              │                                               │
│ PICKUP       │                                               │
│ 8            │                                               │
│              │                                               │
│ EXCLUSION    │                                               │
│ 5            │                                               │
├──────────────┴───────────────────────────────────────────────┤
│ Zone inspector / selected zone details                       │
└──────────────────────────────────────────────────────────────┘
```

Keep the interface operational and simple.

---

# 30. Zone List

Columns:

```text
Name
Code
Type
Status
Version
Updated
Updated By
Actions
```

Filters:

```text
Type:
All
CITY
PICKUP
EXCLUSION

Status:
Active
Inactive

Search:
Name / code
```

---

# 31. Zone Details

```text
Siliguri West

Type
PICKUP

Code
SLG_WEST

Status
ACTIVE

Version
3

Created
...

Updated
...

Updated by
Admin

[Edit Geometry]
[Edit Details]
[History]
[Deactivate]
```

---

# 32. Map Viewer

The map should visually distinguish:

```text
CITY
PICKUP
EXCLUSION
```

Use:

- fill
- border
- label
- selected state

Do not rely only on color.

---

# 33. Create Zone UX

```text
+ Create Zone
```

Form:

```text
Type       [ PICKUP ▼ ]

Name       [________________]

Code       [________________]

Geometry
[ Draw on Map ]
[ Import GeoJSON ]
```

Then:

```text
Validate
```

Then:

```text
Save Zone
```

---

# 34. Polygon Editor

If interactive editing is implemented:

```ts
interface ZoneMapProps {
  zones: ZoneDto[];
  selectedZoneId?: string;
  editing?: boolean;
  draftGeometry?: GeoJsonPolygon | null;

  onSelectZone(id: string): void;
  onDraftChange(geometry: GeoJsonPolygon): void;
  onFinishDrawing(): void;
}
```

The map must not persist data directly.

Correct flow:

```text
Map
 ↓
draft geometry
 ↓
validation
 ↓
save
 ↓
API
```

---

# 35. GeoJSON Import

Support:

```text
Polygon
MultiPolygon
```

Normalize:

```text
Geometry
Feature
FeatureCollection
```

Flow:

```text
parse
 ↓
normalize
 ↓
coordinate validation
 ↓
local validation
 ↓
server validation
 ↓
preview
 ↓
save
```

Imported GeoJSON must never bypass backend validation.

---

# 36. Dual Validation

```text
                Draft polygon
                     │
             ┌───────┴────────┐
             ▼                ▼
       Local validation   API validation
             │                │
        immediate          debounced
             │                │
             └───────┬────────┘
                     ▼
                 Save allowed?
```

Local validation:

```text
geometry structure
ring closure
self intersection
coordinate validity
```

Server validation:

```text
database conflicts
existing zones
business rules
concurrency
```

---

# 37. Validation UI

Show actionable errors:

```text
❌ Zone overlaps "Siliguri West"
```

Optionally:

```text
[View conflicting zone]
```

The backend can return offending geometry so the map can render the conflict.

---

# 38. Deactivation UX

```text
Deactivate "Siliguri West"?

This will stop this zone from being used for
new serviceability and zone resolution.

Current status:
ACTIVE

[Cancel] [Deactivate]
```

Dependent resource checks can be added later.

---

# 39. Zone History UI

```text
History

v3   Sep 26
     Geometry updated
     By: Admin A

v2   Sep 24
     Geometry updated
     By: Admin B

v1   Sep 20
     Zone created
     By: Admin A
```

Historical versions should be inspectable on the map.

---

# 40. Admin Permissions

Use existing Cabzonee authentication.

```text
authenticate
    ↓
requireRole(ADMIN)
    ↓
zone operation
```

Do not create a second authentication system.

---

# 41. Backend Error Codes

Define machine-readable codes:

```text
ZONE_NOT_FOUND

ZONE_ALREADY_ACTIVE
ZONE_ALREADY_INACTIVE

ZONE_INVALID_GEOMETRY
ZONE_SELF_INTERSECTION
ZONE_OVERLAP
ZONE_CONFLICT

ZONE_VERSION_CONFLICT

ZONE_TYPE_INVALID

PICKUP_IN_EXCLUSION_ZONE
DROP_IN_EXCLUSION_ZONE

INVALID_COORDINATES
COORDINATES_APPEAR_SWAPPED
```

Frontend should branch on error codes rather than parsing messages.

---

# 42. Transactions

Geometry version update must be transactional:

```text
BEGIN TRANSACTION

old v3 → inactive

create v4 → active

audit log → UPDATE_GEOMETRY

COMMIT
```

On failure:

```text
ROLLBACK
```

Never allow an old version to become inactive while the replacement is missing.

---

# 43. Runtime Zone Filtering

Only `ACTIVE` zones participate in current resolution:

```text
findActiveCitiesContainingPoint()
findActivePickupsContainingPoint()
findActiveExclusionsContainingPoint()
```

Inactive/superseded zones are only for:

- history
- audit
- debugging
- reconstruction

---

# 44. Testing Strategy

## Domain tests

```text
valid polygon
invalid polygon
closed ring
open ring
self intersection
invalid coordinates
Polygon
MultiPolygon
```

## Zone resolution tests

```text
inside city
outside city
inside pickup
outside pickup
inside exclusion
pickup + exclusion
drop + exclusion
near city
far from city
boundary point
```

## Repository tests

```text
2dsphere lookup
active-only filtering
nearest city
multiple zones
```

## API tests

```text
POST create
POST validate
PATCH metadata
PATCH geometry
GET list
GET detail
GET history
activate
deactivate
```

## Security tests

```text
unauthenticated → 401
non-admin → 403
admin → allowed
```

## Concurrency tests

```text
version 3
 ↓
admin A updates → v4
 ↓
admin B updates using v3
 ↓
409 ZONE_VERSION_CONFLICT
```

---

# 45. Critical Geographic Tests

### Boundary

Test a point exactly on a polygon edge.

Define and consistently apply the boundary behavior.

### Coordinate reversal

Ensure:

```text
[26.72, 88.39]
```

cannot silently be treated as:

```text
[88.39, 26.72]
```

### MultiPolygon

Test multiple disconnected regions.

### Exclusion inside pickup

```text
PICKUP
████████████

EXCLUSION
    ███
```

Point inside exclusion must be unavailable.

### Overlapping CITY

Must produce a configuration error rather than arbitrary selection.

---

# 46. React Query Strategy

Recommended keys:

```ts
['zones', filters]
['zone', zoneId]
['zone-history', zoneId]
```

After create:

```ts
invalidateQueries({
  queryKey: ['zones']
});
```

After geometry update:

```ts
invalidateQueries({
  queryKey: ['zones']
});

invalidateQueries({
  queryKey: ['zone', zoneId]
});
```

---

# 47. Frontend States

Every Zones screen must handle:

```text
Loading
Empty
Error
Success
```

Example:

```text
No zones found.

Try changing your filters.
```

---

# 48. Implementation Phases

## Phase 0 — Architecture Lock

Finalize:

```text
ZONE_TYPES
GeoJSON format
ACTIVE/INACTIVE semantics
version semantics
audit semantics
API error codes
```

Deliverable:

```text
Zone architecture document
```

## Phase 1 — Shared Geometry Package

Build:

```text
packages/geo
```

Implement:

```text
GeoPoint
GeoJSON types
coordinate conversion
ring validation
polygon validation
self-intersection
point-in-polygon
geometry normalization
```

Target 20–30+ tests.

## Phase 2 — Zone Domain

Implement:

```text
ZoneEntity
ZoneType
ZoneStatus
Zone errors
Zone invariants
```

No Mongo dependency.

## Phase 3 — Repository

Implement:

```text
ZoneRepositoryPort
MemoryZoneRepository
MongoZoneRepository
```

Add:

```text
2dsphere
indexes
mappers
```

## Phase 4 — Validation Engine

Implement:

```text
ValidateZoneUseCase
```

Input:

```text
new geometry
zone type
existing active zones
optional current zone ID
```

Output:

```text
valid
violations
```

## Phase 5 — Zone CRUD API

Implement:

```text
GET list
GET detail
POST create
PATCH metadata
```

Add API tests.

## Phase 6 — Geometry Versioning

Implement:

```text
PATCH geometry
expectedVersion
transaction
supersession
audit
```

Add concurrency tests.

## Phase 7 — Deactivation + History

Implement:

```text
activate
deactivate
history
```

## Phase 8 — Zone Resolution

Finish:

```text
ResolveZonesUseCase
```

with:

```text
CITY
PICKUP
EXCLUSION
nearestCity
buffer
```

Then integrate with:

```text
ServiceClassificationUseCase
```

## Phase 9 — Admin Shell

Build:

```text
/zones
```

with:

```text
toolbar
filters
table
selected zone
```

Start with CRUD before map editing.

## Phase 10 — Zone Details

Implement:

```text
ZoneInspector
ZoneDetails
ZoneHistory
```

Admin can:

```text
list
open
inspect
deactivate
view history
```

## Phase 11 — Map Viewer

Add Google Maps and render:

```text
CITY
PICKUP
EXCLUSION
```

## Phase 12 — GeoJSON Import

Implement:

```text
Import
 ↓
parse
 ↓
normalize
 ↓
validate
 ↓
preview
 ↓
server validate
 ↓
save
```

## Phase 13 — Interactive Drawing

Implement:

```text
Draw polygon
Drag vertices
Close polygon
Delete vertex
Cancel
Reset
```

All edits remain draft state until save.

## Phase 14 — Live Validation

Implement:

```text
local validation
+
debounced API validation
```

Example:

```text
Admin moves vertex
       ↓
local validation
       ↓
UI feedback
       ↓
400ms debounce
       ↓
POST /zones/validate
       ↓
server validation
       ↓
violations
```

## Phase 15 — UX Hardening

Add:

```text
violations
offending geometry
confirmation dialogs
toasts
loading states
error states
empty states
keyboard accessibility
```

---

# 49. Do Not Build Yet

Avoid these in the first implementation:

```text
❌ heatmap
❌ coverage analytics
❌ automatic zone generation
❌ AI zone drawing
❌ complex polygon subtraction
❌ arbitrary polygon splitting
❌ hard deletion
❌ terrain/HILL zones
❌ pickup-specific pricing fields
❌ dispatch map
❌ driver heatmaps
❌ sophisticated dependency graph
❌ zone simulation engine
```

---

# 50. Final MVP Zones Screen

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Zones                                      [+ Create Zone]           │
├───────────┬──────────────────────────────────────────────────────────┤
│           │                                                          │
│ Type      │                     MAP                                  │
│           │                                                          │
│ CITY      │       ┌───────────────────────┐                          │
│ 12        │       │                       │                          │
│           │       │       CITY            │                          │
│ PICKUP    │       │    ┌─────────────┐    │                          │
│ 8         │       │    │   PICKUP    │    │                          │
│           │       │    │             │    │                          │
│ EXCLUSION │       │    │   ██████    │    │                          │
│ 5         │       │    └─────────────┘    │                          │
│           │       │                       │                          │
│           │       └───────────────────────┘                          │
├───────────┴──────────────────────────────────────────────────────────┤
│ Siliguri West                                                       │
│ PICKUP · ACTIVE · v3                                                │
│                                                                      │
│ [Edit Geometry] [Edit Details] [History] [Deactivate]               │
└──────────────────────────────────────────────────────────────────────┘
```

---

# 51. End-to-End Flow

```text
                    ADMIN
                      │
                      ▼
                 /zones
                      │
              Create / Edit
                      │
                      ▼
               ZoneMap / GeoJSON
                      │
                      ▼
               Local Validation
                      │
                      ▼
              POST /zones/validate
                      │
                      ▼
              Backend Validation
                      │
                 ┌────┴────┐
                 │         │
               invalid    valid
                 │         │
                 ▼         ▼
             violations   Save
                           │
                           ▼
                    Mongo Transaction
                           │
                 ┌─────────┴──────────┐
                 │                    │
              zones              zone_audit
                 │                    │
                 └─────────┬──────────┘
                           ▼
                     Active version
                           │
                           ▼
                    Runtime resolver
                           │
                           ▼
                    ResolveZones
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
        CITY             PICKUP         EXCLUSION
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                 Service Classification
                           │
                           ▼
                       Pricing
                           │
                           ▼
                         Quote
```

---

# 52. Recommended PR Breakdown

Do not implement the entire Zones system in one giant PR.

### PR 1

```text
feat(zone): harden zone domain and geometry engine
```

Includes:

- shared geometry utilities
- domain model
- geometry validation
- zone invariants
- tests

### PR 2

```text
feat(zone): implement zone admin API and persistence
```

Includes:

- Mongo model
- repository
- CRUD API
- validation endpoint
- versioning
- audit
- activation/deactivation
- tests

### PR 3

```text
feat(zone): implement zone resolution and runtime integration
```

Includes:

- ResolveZonesUseCase
- exclusion veto
- nearest city
- buffer derivation
- ServiceClassification integration
- runtime tests

### PR 4

```text
feat(web): implement admin zones management
```

Includes:

- zones screen
- list
- details
- map viewer
- create form
- GeoJSON import
- validation
- geometry editor
- history
- deactivate flow
- UX hardening

---

# 53. Implementation Principle

The target is not simply:

```text
"Admin can draw polygons."
```

The target is:

```text
Admin changes geographic configuration
        ↓
Backend validates it
        ↓
Versioned configuration is persisted
        ↓
Change is audited
        ↓
Runtime zone resolution uses only active configuration
        ↓
Service classification consumes geographic facts
        ↓
Pricing consumes classification
        ↓
Quote consumes pricing
```

This is the complete Cabzonee Zones system.
