# Geographic Reference Data & Routing

**Status:** Proposed design (not yet implemented)
**Extends:** [`zones.md`](zones.md) §15–17, [`zone-engine.md`](zone-engine.md) §9, [`fare-engine.md`](fare-engine.md) §12–13, decision [D-035](../decision-log.md), open question [OQ-022](open-questions.md)

This document defines the infrastructure behind `INTRA_STATE` / `INTERSTATE` classification and toll estimation. It adds detail that `zones.md` only outlines: state boundary data, the route module, toll policy, failure handling, quote snapshots and the delivery plan.

## 1. Core Rule

> State boundaries tell you **where** a route crosses. The routing provider tells you **which route** is taken and estimates tolls. Neither becomes a Cabzon operational Zone.

Two independent pieces of infrastructure:

| Piece | Answers | Owner |
| --- | --- | --- |
| State/UT boundary reference data | Which state is a point / route segment in? → `INTRA_STATE` vs `INTERSTATE` | `geographic-reference` module |
| Route + toll provider | Route geometry, distance, duration, estimated toll | `route` module |

`ZoneType` stays `'CITY' | 'EXCLUSION'`. **Never add `'STATE'`. Never create toll zones.**

## 2. Dependency Direction

```text
Geography (cities, exclusions, state reference)
        |
      Route
        |
 Service Classification   (CITY/OUTSTATION + INTRA/INTERSTATE)
        |
     Pricing
        |
      Quote   (freezes everything used)
```

| Responsibility | Module |
| --- | --- |
| City / exclusion polygons, pickup & destination city, buffer classification | Geography |
| State polygons | Geographic Reference |
| Distance, duration, polyline, toll estimate | Route |
| State segmentation of a route | Route + StateBoundaryResolver |
| CITY/OUTSTATION, INTRA/INTERSTATE | Service Classification |
| Fare, and how the toll enters it | Pricing |
| Driver search / notification | Dispatch |

## 3. State Boundary Reference Data

Reference GIS data, not operational data. Admins **do not draw** state boundaries.

```ts
interface StateBoundary {
  id: string;
  stateCode: string;            // "WB"
  stateName: string;
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon;
  version: number;
  status: 'ACTIVE' | 'INACTIVE';
  source: string;               // e.g. INDIA_STATE_BOUNDARY_DATASET
  sourceVersion: string | null; // e.g. "2026-01"
  createdAt: Date;
  updatedAt: Date;
}
```

`source` and `sourceVersion` are stored because boundaries change. A 2026 quote must not be re-classified differently in 2028 against a newer dataset; the quote keeps the version it used.

### Lifecycle

```text
GIS dataset -> import script -> geometry validation -> state_boundaries collection -> 2dsphere index -> StateBoundaryResolver
```

- Admin console is **read-only**: `GET /admin/reference/states`, `GET /admin/reference/states/:stateCode`, optionally a boundary-status endpoint. No `PATCH`.
- Any future edit workflow is a separate privileged infrastructure operation.

### Storage

Collection `state_boundaries`:

```text
{ stateCode, stateName, geometry: {type:"MultiPolygon", coordinates}, version, status, source, sourceVersion, createdAt, updatedAt }
```

Indexes:

```js
db.state_boundaries.createIndex({ geometry: '2dsphere' });
db.state_boundaries.createIndex({ stateCode: 1, status: 1 });
```

### Validation (import pipeline, not zone validation)

- Valid Polygon/MultiPolygon, valid coordinates, no self-intersection.
- Valid, unique `stateCode`; one ACTIVE boundary per state.
- Check the dataset for impossible gaps/overlaps.

### Repository port

```ts
interface StateBoundaryRepository {
  findContainingPoint(point: GeoPoint): Promise<StateBoundary | null>;
  findIntersectingStates(geometry: GeoJsonLineString): Promise<StateBoundary[]>;
  getActiveByCode(stateCode: string): Promise<StateBoundary | null>;
}
```

Implementations: `MemoryStateBoundaryRepository` (tests: classification must not need Mongo) and `MongoStateBoundaryRepository`.

`ResolveStateForPointUseCase`: `{latitude, longitude}` → `{stateCode, stateName, boundaryVersion}` or `null`. Never guess when nothing matches.

## 4. Interstate Is Decided by the Route, Not Endpoints

Do **not** implement `pickupState !== dropState ? INTERSTATE : INTRA_STATE` as the authoritative rule. A route can cross WB → JH → BR regardless of what the endpoints suggest.

```text
route polyline -> state boundary intersection -> ordered StateSegment[] -> scope
```

```ts
const routeScope = new Set(segments.map((s) => s.stateCode)).size > 1 ? 'INTERSTATE' : 'INTRA_STATE';
```

Zero states resolved is **not** `INTRA_STATE`; it is `CLASSIFICATION_UNAVAILABLE`, and business policy decides the outcome.

### Performance

Do not test a polyline against all ~36 state/UT polygons per quote:

```text
route bounding box -> Mongo $geoIntersects -> candidate states -> precise line/polygon intersection
```

State boundaries are near-static reference data: cache them (process-level or Redis, keys like `state:WB:v1`).

## 5. Route Module

```text
modules/route/
  domain/          RouteResult, TollInfo, StateSegment
  application/     CalculateRoute, ResolveRouteStates
  ports/           RouteProvider, StateBoundaryResolver
  infrastructure/  google/GoogleRoutesProvider
```

```ts
interface RouteProvider {
  calculateRoute(request: RouteRequest): Promise<RouteResult>;
}

interface RouteRequest {
  origin: GeoPoint;
  destination: GeoPoint;
  vehicle: RouteVehicleInfo;
  includeTolls: boolean;
}

interface RouteVehicleInfo {
  category: 'CAB' | 'E_RICKSHAW';
  emissionType: 'GASOLINE' | 'DIESEL' | 'ELECTRIC' | 'HYBRID' | 'UNKNOWN';
}

interface RouteResult {
  provider: string;
  providerRouteId: string | null;
  geometry: string;            // encoded polyline
  distanceM: number;
  durationS: number;
  routeStatus: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
  toll: TollInfo | null;
}
```

Google is one implementation; Mapbox or others can replace it without touching pricing or classification.

### Toll model

```ts
interface TollInfo {
  exists: boolean;
  estimatedAmountPaise: number | null;   // null = toll exists, price unknown
  currency: 'INR';
  provider: string | null;
  isEstimate: boolean;
  commercialVehicleCaveat: boolean;
  tollStatus: 'AVAILABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
}
```

It is an **estimate**, not a guaranteed toll. Do not build a toll-plaza / FASTag rate database for MVP.

## 6. Google Routes Provider Notes

- Request `extraComputations: ["TOLLS"]`; read `travelAdvisory.tollInfo.estimatedPrice`.
- Use a strict field mask: `routes.distanceMeters`, `routes.duration`, `routes.polyline.encodedPolyline`, `routes.travelAdvisory.tollInfo`.
- `travelMode: "DRIVE"`; pass vehicle emission type from `RouteVehicleInfo` rather than hard-coding.
- Google's toll estimate is for **non-commercial** vehicles; commercial tolls may differ. Toll may exist with no price returned.
- Toll-calculating requests bill at a higher rate than plain routes; billing SKU depends on requested features. Track `route_requests_total`, `route_toll_requests_total`, `route_failures_total`, `route_provider_latency`, and check real billing.
- Verify current API shape and pricing against Google's docs at implementation time.

## 7. Toll Policy Belongs to Pricing

Route answers "what does the provider estimate?". Pricing answers "how does Cabzon use it?".

```ts
interface TollPricingPolicy {
  enabled: boolean;
  includeEstimatedTollInRecommendedFare: boolean;
  roundingMode: 'UP' | 'NEAREST' | 'DOWN';
  fallbackWhenUnavailable: 'EXCLUDE' | 'ESTIMATE' | 'BLOCK_QUOTE';
}
```

MVP behaviour:

- Toll estimate present → include it in the recommended fare **and show it**: "Includes estimated toll: ₹180".
- Toll exists, price unavailable → `EXCLUDE` from automatic fare and show "Toll may apply". Do not invent an amount.
- Route/provider failure or timeout → never becomes `toll = ₹0`; use explicit `routeStatus` / `tollStatus`.
- MVP keeps `estimatedToll` only. `actualToll` (receipt/manual verification) is a later, separate financial rule.

This resolves the "show tolls separately" recommendation in OQ-022 for the routing side; permits remain open.

## 8. Classification Flow

1. Validate coordinates.
2. Exclusion check: pickup or drop inside an `EXCLUSION` zone → reject.
3. Resolve pickup city, then destination city.
4. Buffer logic:
   - destination inside origin city → `IN_CITY`;
   - destination inside another active city → `OUTSTATION` (even if within origin's buffer);
   - otherwise if distance to origin boundary ≤ `bufferDistanceM` → `IN_CITY`, else `OUTSTATION`.
5. Calculate route (`RouteProvider`).
6. Resolve state segments from the polyline.
7. Determine `routeScope`.

```ts
interface ServiceClassification {
  serviceType: 'CITY' | 'OUTSTATION';
  routeScope: 'INTRA_STATE' | 'INTERSTATE' | null;
  originCityId: string | null;
  destinationCityId: string | null;
  originCityZoneId: string | null;
  destinationCityZoneId: string | null;
  bufferApplied: boolean;
  effectiveBufferDistanceM: number | null;
  stateSegments: StateSegment[];
  classificationVersion: number;
}
```

## 9. Preview vs Authoritative Route

- **Preview route** while the rider picks locations: debounced, only after both pickup and destination are chosen. Do not call route/toll on every map drag.
- **Authoritative route** at quote creation. A stale map preview must never become financial truth.

## 10. Quote Snapshots

```ts
interface QuoteGeoSnapshot {
  originCityId: string | null;
  destinationCityId: string | null;
  serviceType: 'CITY' | 'OUTSTATION';
  routeScope: 'INTRA_STATE' | 'INTERSTATE' | null;
  stateSegments: StateSegment[];
  cityBoundaryVersion: number | null;
  stateBoundaryVersion: number | null;
  bufferDistanceM: number | null;
  bufferApplied: boolean;
}

interface QuoteRouteSnapshot {
  provider: string;
  providerRouteId: string | null;
  distanceM: number;
  durationS: number;
  toll: TollInfo | null;
  routeGeometry: string;
}
```

A quote freezes geography, route, toll estimate, pricing config version and classification version (consistent with D-034).

**A quote never mutates after negotiation.** If the agreed fare is ₹1,650 and Google later says the toll is ₹240, the agreed fare stays ₹1,650. Any later toll settlement is a separate financial rule.

Toll caching: do not cache toll per city pair; it depends on route, vehicle, passes and provider data. The quote snapshot is the record.

## 11. Tests

- **State point resolution:** WB point → WB, BR point → BR, border point deterministic, outside dataset → `null`.
- **Segmentation:** WB→WB, WB→BR, WB→BR→JH.
- **Classification:** same city; different city; city → outside city within buffer; city → another city inside buffer; outside city → city; outside all cities.
- **Toll:** no toll; toll + amount; toll + no amount; provider failure; provider timeout.
- **Combined:** Siliguri → Patna = `OUTSTATION` + `INTERSTATE` + estimated toll.

## 12. Delivery Plan

| PR | Scope |
| --- | --- |
| 1 | `StateBoundary` domain, repository port, GeoJSON types, validation, tests (no Google) |
| 2 | State boundary import script, validation, Mongo + 2dsphere index |
| 3 | `ResolveStateForPoint`, memory + Mongo repositories |
| 4 | Route abstraction (`RouteProvider`, `RouteResult`, `TollInfo`, `RouteRequest`) with a fake provider |
| 5 | `GoogleRoutesProvider` (distance, duration, polyline, TOLLS, strict field mask) |
| 6 | Route state segmentation → `INTRA_STATE` / `INTERSTATE` |
| 7 | Quote integration and snapshots |

Target module layout: `cities/`, `zones/` (city + exclusion), `geographic-reference/` (state-boundaries), `route/`, `service-classification/`, `pricing/`, `quotes/`, `dispatch/`, `rides/`.

## 13. Locked Decisions

- Zones: `CITY` and `EXCLUSION` only. Cities carry boundary, operational config and `bufferDistanceM`.
- State/UT boundaries are read-only reference GIS data, versioned with source metadata.
- Route module owns polyline, distance, duration and estimated toll behind `RouteProvider`.
- Classification yields `CITY/OUTSTATION` and `INTRA_STATE/INTERSTATE` from the actual route.
- Pricing decides how the estimated toll affects the recommended fare.
- Quote freezes everything used to calculate the offer.
- No state zones, no toll zones, no toll-plaza database for MVP.

## 14. Launch Scope: Serviceable States

Launch states: **WB, BR, SK, AS** (`LAUNCH_STATE_CODES` in `modules/stateBoundary`). Only these boundaries are imported (`pnpm --filter @cabzone/api import:states <geojson>`); every other state is skipped, so points there resolve to `null` and the trip is rejected with `NOT_SERVICEABLE`. `ServiceClassificationUseCase` enforces this first, via an optional `serviceabilityGuard`, before any zone resolution. Adding a state later is an import, not a code change (extend the allowed list).
