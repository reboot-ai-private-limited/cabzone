# Cabzon — Geography, City Zones, and Routing

**Status:** Updated implementation specification  
**Scope:** Backend + Admin Web + Geography + Routing + Estimated Toll  
**Architecture:** Modular monolith  
**Primary stack:** Node.js / TypeScript / MongoDB

> **2026-10-01 (D-037):** This document previously specified a stored State entity (admin-managed GeoJSON boundary polygons, a States admin screen, and per-state `StatePricing`). That system is removed. See [`decision-log.md`](../decision-log.md#d-037--supersede-d-035-remove-state-boundarystatepricing-system-adopt-global-outstation-pricing) (D-037, supersedes D-035) and [`open-questions.md`](open-questions.md) OQ-011. This document now reflects the current (post-D-037) design.

---

## 1. Final Decisions

Cabzon's operational geography is intentionally simple:

- Operational zones are **CITY zones only**.
- There are **no EXCLUSION zones**.
- There are **no PICKUP zones**.
- A city can contain multiple CITY zones.
- Pickup must be inside an active CITY zone.
- There is no State entity and no stored state boundary geometry.
- **Every destination state is serviceable.** There is no state-level enable/disable and no intrastate/interstate availability toggle.
- Destination state is a **display-only label**, not a serviceability gate and not a pricing input.
- Pricing is **uniform**: every trip — city, intrastate outstation, or interstate outstation — is priced from the same `PricingConfig` for `(cityZoneId, vehicleCategory)`. There is no per-state rate table.
- Toll is route data, not zone data.
- Routing provides an **estimated toll**; Pricing decides how that estimate affects the recommended fare.
- Quotes snapshot the geographic, route, toll, and pricing versions used to calculate them.

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

System
  Routing

Profile
Logout
```

There is no "States" sidebar item.

---

# 3. Geographic Model

```text
City
  |
  +-- CITY Zone 1
  +-- CITY Zone 2
  +-- CITY Zone 3

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
ROUTE           = actual journey data
```

A city zone's `stateCode` is a plain admin-entered field (see §4) — it identifies which state a city is in for display purposes only. There is no separate state geometry or state-level configuration.

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

Cities manage identity and city-level configuration. Their service geometry is represented by City Zones. `stateCode` is admin-entered at creation — it is never derived from boundary geometry.

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

Pickup is serviceable only when it is inside an active CITY zone. This is the **only** serviceability gate in the system — there is no destination-side gate.

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

# 8. Destination State (Display-Only)

There is no stored state entity and no destination-side serviceability check. Origin and destination state codes exist purely so the quote/ride can **display** `INTRA_STATE` / `INTERSTATE` to the rider and driver — they never gate serviceability and never change the fare.

Resolution order, cheapest first:

```text
Origin state
  = pickup's city zone's own stateCode (admin-entered, always known —
    pickup must already be inside an active city zone)

Destination state
  = drop's city zone's own stateCode, if drop is inside a known city zone
  = otherwise: DestinationStateResolverPort.resolve(dropPoint)   (Google Geocoding, see §15)
  = otherwise: null ("unknown")
```

Port:

```ts
interface DestinationStateResolverPort {
  resolve(point: GeoPoint): Promise<string | null>;
}
```

A resolution failure (timeout, quota, no match, no API key configured) returns `null`. It is never treated as an error and never blocks a ride — `routeScope` and `destinationStateCode` simply show as unknown.

---

# 9. Service Classification

Cabzon uses two independent dimensions:

```text
Service Type:
  CITY
  OUTSTATION

Route Scope (display-only):
  INTRA_STATE
  INTERSTATE
```

Do not make `INTERSTATE` a service type. `routeScope` is `null` for CITY trips.

---

# 10. In-City Ride

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

# 11. Intrastate Outstation

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

Priced identically to any other outstation trip (§18) — same state, different state, doesn't matter.

---

# 12. Interstate Outstation

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

Priced identically to an intrastate outstation trip of the same distance (§18). The destination state does not need to be "enabled" — every state is serviceable.

---

# 13. Route Module

Suggested structure:

```text
modules/routing/
├── domain/
│   ├── route.entity.ts        # RouteRequest, RouteResult
│   ├── routing.port.ts        # RouteProviderPort, RouteCachePort
│   └── stateResolver.port.ts  # DestinationStateResolverPort
├── application/
│   ├── getRoute.usecase.ts
│   └── resolveDestinationState.usecase.ts
└── infrastructure/
    ├── googleRoutes.provider.ts
    ├── googleGeocoding.provider.ts   # GoogleGeocodingProvider, NullDestinationStateResolver
    ├── haversine.provider.ts
    └── ttlRouteCache.ts
```

---

# 14. Route Provider

Keep the routing provider behind an interface.

```ts
interface RouteProviderPort {
  readonly name: string;
  calculateRoute(req: RouteRequest): Promise<RouteResult>;
}

interface RouteRequest {
  origin: GeoPoint;
  destination: GeoPoint;
  vehicleCategory: VehicleCategory;
}

interface RouteResult {
  provider: string;
  distanceM: number;
  durationS: number;
  polyline: string | null;
}
```

Do not spread Google-specific code throughout the domain/application layers.

---

# 15. Destination State Resolver (Google Geocoding)

Same pattern as the Route Provider: a small port, a Google-backed implementation, and a no-op fallback.

```ts
class GoogleGeocodingProvider implements DestinationStateResolverPort {
  resolve(point: GeoPoint): Promise<string | null>;
}

class NullDestinationStateResolver implements DestinationStateResolverPort {
  resolve(): Promise<null>;
}
```

- Used only for a drop point outside every known city zone (§8) — the common case, a drop inside a known city zone, never needs a network call.
- Reverse-geocodes the point, reads the `administrative_area_level_1` address component, and normalizes it against a static Indian states/UTs name→code table.
- Reuses the same `GOOGLE_ROUTES_API_KEY` as the Route Provider (no separate key). If unset, `NullDestinationStateResolver` is used and destination state always resolves to `null`.
- Never throws. Timeout, quota, malformed response, or no match all resolve to `null`.

---

# 16. Estimated Toll

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

# 17. Google Routes Integration

Google Routes can be used behind `RouteProviderPort` for:

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

# 18. Toll Responsibility (Decided — D-045)

Route answers:

> What toll does the routing provider estimate?

Pricing answers (per [`decision-log.md`](../decision-log.md#d-045--highway-toll--interstate-permit-quoteride-treatment), D-045):

> Keep `suggestedFarePaise`, negotiation bounds, `agreedFarePaise`, and commission strictly on the ride fare (`base + distance + buffer`), and freeze `TollInfo` as a **separate non-commissioned disclosure line** payable by the rider at actuals.

Example:

```text
Route estimate
  Toll = ₹180 (isEstimate = true)
       |
       v
Pricing / Quote Snapshot
  suggestedFarePaise = ₹1,550 (ride fare only; negotiation & commission base)
  tollSnapshot       = ₹180 estimated toll (separate disclosure, paid at actuals, 0% commission)
```

Do not calculate fare inside the Route module.

---

# 19. Toll Unavailable

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

# 20. Toll and Negotiated Fare (Decided — D-045)

Per Decision D-045, tolls and interstate permits remain separate from the negotiated ride fare:

```text
Recommended ride fare (negotiable & commissionable): ₹1,550
Estimated highway toll (separate disclosure):        ₹180 (payable at actuals)
```

Rider proposes ride fare:

```text
₹1,500
```

Driver accepts:

```text
Agreed ride fare = ₹1,500 (tolls/permits payable separately at actuals)
```

The agreed ride fare and frozen `tollSnapshot` must never silently mutate if a later routing request returns a different toll estimate.

---

# 21. Quote Snapshot

A quote must freeze the inputs used for the financial decision.

```ts
interface QuoteGeoSnapshot {
  originCityId: string | null;
  originCityZoneId: string | null;

  destinationCityId: string | null;
  destinationCityZoneId: string | null;

  /** Display-only — never affects pricing or serviceability. */
  destinationStateCode: string | null;

  serviceType: 'CITY' | 'OUTSTATION';
  routeScope: 'INTRA_STATE' | 'INTERSTATE' | null;

  cityZoneVersions: number[];
}

interface QuoteRouteSnapshot {
  provider: string;
  distanceM: number;
  durationS: number;
  routeGeometry: string;
  toll: TollInfo | null;
}
```

Also snapshot the applicable pricing configuration version.

---

# 22. Full Quote Flow

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
         Resolve destination State (display-only, §8)
                |
                v
          INTRA_STATE / INTERSTATE label
                |
                v
            Route API
                |
       +--------+--------+
       |        |        |
    distance duration   toll
                |
                v
             Pricing (same config regardless of route scope)
                |
                v
              Quote
```

---

# 23. Geography Module Structure

```text
modules/zone/
├── domain/
│   ├── zone.entity.ts          # CityEntity / CityZoneEntity (type: 'CITY')
│   └── ...
├── application/
│   ├── resolveZones.usecase.ts
│   └── serviceClassification.usecase.ts
└── infrastructure/
    └── mongo/
```

There is no `State.ts` entity and no `StateRepository` port — see §8.

---

# 24. Geographic Context

```ts
interface GeographicContext {
  pickup: {
    cityId: string | null;
    cityZoneId: string | null;
  };

  destination: {
    cityId: string | null;
    cityZoneId: string | null;
    /** Display-only. */
    stateCode: string | null;
  };
}
```

This contains facts. It does not calculate fare.

---

# 25. Service Classification Module

Suggested location:

```text
modules/zone/application/serviceClassification.usecase.ts
```

It consumes:

- GeographicContext
- `DestinationStateResolverPort` (only when the drop is outside every known city zone)

and produces:

```ts
interface ServiceClassification {
  serviceType: 'CITY' | 'OUTSTATION';
  /** Display-only. */
  routeScope: 'INTRA_STATE' | 'INTERSTATE' | null;

  originCityId: string | null;
  originCityZoneId: string | null;

  destinationCityId: string | null;
  destinationCityZoneId: string | null;

  /** Display-only. */
  destinationStateCode: string | null;

  classificationVersion: number;
}
```

---

# 26. Pricing Module

Pricing consumes:

```text
ServiceClassification
RouteResult
PricingConfig
```

It calculates:

- base fare
- distance fare
- time fare
- estimated toll treatment
- recommended fare

`routeScope`/`destinationStateCode` from `ServiceClassification` are not inputs to the fare formula — the same `PricingConfig` for `(cityZoneId, vehicleCategory)` applies regardless of route scope.

The frontend must never calculate these values as the source of truth.

---

# 27. Admin — Cities

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

# 28. Admin — Zones

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

# 29. Admin — Routing

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

# 30. MongoDB Collections

Recommended collections:

```text
cities
city_zones
```

Existing ride/quote/pricing collections remain separate. There is no `states` or `state_pricing` collection.

---

# 31. MongoDB Indexes

City zones:

```js
db.city_zones.createIndex({ geometry: '2dsphere' });
db.city_zones.createIndex({ cityId: 1, status: 1 });
```

---

# 32. Versioning

Version:

- City Zones
- Pricing configurations

Quote snapshots retain the versions used at quote time.

Example:

```json
{
  "cityZoneVersion": 4,
  "pricingConfigVersion": 12
}
```

---

# 33. Optimistic Concurrency

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

Use the same principle for zone/city configuration.

---

# 34. API Endpoints

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

## Routing

```http
GET /admin/routing/health
GET /admin/routing/metrics
```

There are no `/admin/states` endpoints.

---

# 35. Error Codes

Use explicit business errors:

```ts
type GeographyErrorCode =
  | 'PICKUP_NOT_SERVICEABLE'
  | 'ROUTE_UNAVAILABLE'
  | 'TOLL_UNAVAILABLE';
```

`DESTINATION_NOT_SERVICEABLE`, `DESTINATION_STATE_UNSUPPORTED`, `INTRASTATE_SERVICE_DISABLED`, `INTERSTATE_SERVICE_DISABLED`, and `STATE_CLASSIFICATION_FAILED` no longer exist — every destination state is serviceable and destination-state resolution never fails loudly (§8).

Do not collapse all business failures into a generic 400.

---

# 36. Dispatch Boundary

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

# 37. Buffer

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

# 38. Caching

Good cache candidates:

```text
Active cities
Active city zones
Destination state resolutions (keyed by rounded lat/lng — rarely changes)
```

Routing/toll responses should not be treated as permanent reference data.

---

# 39. Route Request Optimization

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

# 40. Route Preview vs Quote Route

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

# 41. Test Matrix

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

## Service Classification

```text
same city
different city, same state (INTRA_STATE label)
different state (INTERSTATE label)
drop outside every known city zone (Google Geocoding fallback, including failure -> null)
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
same fare for equal-distance intrastate vs interstate trips
toll unavailable
```

---

# 42. Implementation Order

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

## Phase 2 — Routing

- RouteProviderPort interface
- RouteResult
- route geometry
- distance
- duration
- provider integration

## Phase 3 — Estimated Toll

- TollInfo
- provider toll request
- estimated toll
- unavailable toll handling
- Pricing integration
- quote snapshot

## Phase 4 — Destination State Label

- DestinationStateResolverPort interface
- Google Geocoding provider + null fallback
- city-zone-first resolution with Google fallback
- routeScope display label (INTRA_STATE / INTERSTATE)

## Phase 5 — Quote Integration

- geography
- route
- toll
- fare pricing (uniform per city zone/vehicle category)
- quote snapshot
- negotiation
- ride creation

---

# 43. Non-Goals

Do not implement:

```text
EXCLUSION zones
PICKUP zones
STATE operational zones
STATE boundary storage/import/admin screen
Per-state pricing
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

# 44. Final Architecture

```text
                         CABZON
                            |
                         CITIES
                            |
                       CITY ZONES
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
                     (label only)           (label only)
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
                             (uniform config)
                                    |
                                   QUOTE
                                    |
                                NEGOTIATION
                                    |
                                   RIDE
```

---

# 45. Core Invariants

1. Only `CITY` is an operational zone type.
2. Pickup must be inside an active CITY zone — the only serviceability gate.
3. Multiple CITY zones can belong to one city.
4. There are no exclusion zones.
5. There is no stored state entity or state boundary geometry.
6. Every destination state is serviceable.
7. Destination state is a display-only label (`routeScope`, `destinationStateCode`), never a pricing input or serviceability gate.
8. Same-city destination is `CITY` service.
9. Different city, any state, is `OUTSTATION` — priced identically regardless of `routeScope`.
10. Toll belongs to Route, not Geography.
11. Toll returned by a routing provider is an estimate.
12. Pricing decides how estimated toll affects the recommended fare.
13. Agreed fare must not silently change after negotiation.
14. City zones and fare configurations are versioned.
15. Quotes snapshot the versions used to calculate them.
16. Geography does not calculate money.
17. Routing does not calculate fares.
18. Pricing does not own geographic geometry.
19. Dispatch does not require dispatch-specific zones.
20. A destination-state resolution failure degrades to "unknown," never to an error or a blocked ride.

---

# 46. Final Decision Summary

```text
CITY
  |
  +-- multiple CITY ZONES
  |
  +-- pickup serviceability (only gate)

ROUTE
  |
  +-- distance
  +-- duration
  +-- polyline
  +-- estimated toll

CLASSIFICATION
  |
  +-- CITY / OUTSTATION
  +-- INTRA_STATE / INTERSTATE (display label only)

PRICING
  |
  +-- uniform config per (cityZone, vehicleCategory)
  +-- toll treatment
  +-- recommended fare

QUOTE
  |
  +-- immutable snapshot
  +-- rider proposal
  +-- driver acceptance
  +-- agreed fare
```

This is the current simplified geography/routing architecture for Cabzon: **CITY zones define pickup serviceability, destination state is a display-only label (sourced from city-zone data or Google Geocoding), Route provides distance/duration/toll, and Pricing — uniform per city zone and vehicle category — turns those inputs into the quote.**
