# Routing, State Pricing, Quote & Ride API — Implementation Plan for an AI Agent

Follow-on to `docs/LLD/states-and-serviceability-implementation-plan.md` (already implemented). Read
that first, then `docs/LLD/geo-reference-and-routing.md`, `docs/engineering/coding-standards.md`,
`docs/engineering/module-anatomy.md`, `docs/engineering/adding-a-module.md`.

## 0. Decisions (already made — do not reopen)

1. **CITY = ZONE.** There is no separate City entity or Cities module. A city is a `ZoneEntity` with
   `zoneType: 'CITY'`; its name is the zone name; pricing stays keyed by `cityZoneId`. Do **not**
   build a Cities module or a Cities nav item. Update the LLD (§4–§5, §36, §45, phase 1) to say so.
2. **Distance and duration come from a map API** (Google Routes), never from haversine in
   production. Haversine survives only as a dev/test provider and is never silently used as a
   production fallback.
3. **Tolls are out of scope.** Leave the `RouteResult` shape extensible (`toll` is not added now).
4. **No persisted quotes.** Quotes stay signed stateless tokens. Do not put the polyline in the token.

### Assumptions to confirm before coding (defaults given; change only if the owner says so)
| # | Question | Default used in this plan |
|---|----------|---------------------------|
| A | Interstate fare basis | Per-state-segment: each traversed state's rate applies to the km driven in that state |
| B | State with no active state pricing | Falls back to the city config's `ratePerKmPaise` |
| C | Base/minimum fare for interstate | Base from destination state pricing if present, else city config; minimum = max(city, destination state) |
| D | Included distance | Applied to the start of the route (deducted from segments in order) |
| E | Routing failure | Quote fails with `ROUTE_UNAVAILABLE` (503). No haversine fallback |
| F | Traffic-aware routing | Off (`TRAFFIC_UNAWARE`, cheaper); flag `ROUTING_TRAFFIC_AWARE=false` |

## 1. Coding rules (follow exactly)

### General
1. Match surrounding code: naming, comment density, idiom. Comments say **why**, never what.
2. Smallest change that meets the spec. No unrelated refactors. Do not touch files you have no reason to.
3. Additive and backward compatible: new DTO/contract fields are optional (`?: T | undefined`);
   Mongo mappers tolerate missing fields (`doc.x ?? default`).
4. Never silently overwrite data; replaced data goes to history first.
5. **Money is integer paise; distance is metres; duration is seconds.** Round only at the last step
   (`Math.round`). No floats in stored values.
6. New dependency only when unavoidable; state why in the PR. (`polygon-clipping` was the only one so
   far.) Prefer built-in `fetch`; do **not** add an HTTP client or the Google SDK.
7. Run typecheck, lint and tests after every step. Never continue on red.
8. Do not commit unless asked. If asked, use the attribution line from the session's system reminder.

### Backend (`apps/api`)
- Clean architecture per module: `domain` (entities, ports) → `application/useCases` →
  `infrastructure` → `interface` (controller, routes, validation) → `<module>.container.ts`.
  Dependencies point inward. Use cases depend on **ports**, never on Mongo/`fetch`.
- Every repository port has a **Mongo and a Memory implementation**; tests use Memory. Both must
  implement every new port method.
- Mongo documents are `snake_case`; entities `camelCase`; mapping lives in the repository `toEntity`.
- Relative imports use the `.js` extension (ESM). Cross-module access only through the module's
  `*.public.ts` / `index.ts`. A module must not import another module's internals; declare a small
  structural interface in the consumer (see `GuardedState`, `QuoteStateVerifier`).
- Errors: `AppError.badRequest / notFound / conflict / forbidden`. Business codes are a message
  prefix (`'ROUTE_UNAVAILABLE: …'`). For 503 use `new AppError({ statusCode: 503, code, message })`;
  check the `FaultCode` union in `packages/contracts` and add a code there only if none fits.
- Controllers: `asyncHandler`, validate with `zod`, respond with `sendSuccess(req, res, data, msg, status)`.
- Register literal Express paths before parameterised ones.
- IDs from `newUuid()` (`shared/ids.js`). Config only via `src/config/env.ts`; never `process.env` elsewhere.
- **Authorisation is explicit on every route** (see §7). A route without `authenticate` must be a
  deliberate, commented decision.

### External HTTP (Google Routes) — mandatory rules
- Inject `fetchFn` (default global `fetch`) so tests never touch the network.
- Timeout with `AbortController` (`ROUTING_TIMEOUT_MS`, default 4000). Retry **once** on a network
  error / timeout / 5xx; never retry 4xx.
- Strict field mask; request only fields you use.
- **Never log the API key or full request URL/headers.** Log provider, status, latency, requestId.
- The key is a **server** key, separate from the browser Maps key used by the web app; restrict it by
  API (Routes only) and IP in Google Cloud. `.env.example` gets a placeholder only — never a real key.
- Map every failure to one `ROUTE_UNAVAILABLE` `AppError`; keep the cause in `cause`, not in the message.

### Frontend (`apps/web`)
- TanStack Query via `authedQueryOptions` / `useApiMutation`; keys in `lib/query/keys.ts`; API calls
  only through `lib/api/endpoints/*.ts` (`request()` has no custom header option → send versions as
  `expectedVersion` in the body).
- UI only from `@cabzone/design-system`; Tailwind tokens, no hard-coded colours.
- Labels with text on every control (`<input id>` + `<label htmlFor>`). Unique keys; when items can
  repeat use `${code}-${index}` with a scoped `eslint-disable-next-line react/no-array-index-key`.
- A flex parent turns inline children into columns; wrap running text in one `<span>`.
- **The frontend never computes fares or distances as a source of truth.** Verify
  `features/pricing/components/FareSimulatorSection.tsx`; if it computes client-side, switch it to the
  server quote endpoint.

### Testing
- Vitest + supertest; unit tests use Memory repos and stub other use cases with `as never`.
- Provider tests use a fake `fetchFn` with recorded JSON fixtures (success, 4xx, 5xx, timeout, empty routes).
- Anything about atomicity or geo indexes needs a real-Mongo test in `test/integration/`
  (`mongodb-memory-server`; copy the binary-lookup block from `ride-lifecycle-mongo.test.ts`).
  Run with `npx vitest run --config vitest.integration.config.ts`.
- Update an existing assertion only when intended behaviour changed, and say so.
- Every new endpoint: happy path, 401, 403 (wrong role), 400 (bad body), 404, 409 (stale version).

## 2. Environment gotchas (Windows)
- **No Python.** Do not write Python patch scripts.
- Multi-line `node -e` / heredoc edits with backticks or `$` break in this shell. Use the Edit/Write
  tools; if scripting, write a `.js` file first.
- **Files may use CRLF**; scripted `\n` replacements silently match nothing. Verify with `grep -c`.
- Never paste secrets into commands or output. `.env` is gitignored and holds live credentials —
  do **not** point tests or scripts at it; use `mongodb-memory-server`.
- Commands: `cd apps/api && npx tsc --noEmit && npx vitest run`; integration as above;
  `cd apps/web && npx tsc --noEmit && npx eslint <paths>`; `graphify update .` from the repo root.

---

## 3. Phase 1 — Routing module (api)

New module `apps/api/src/modules/routing/`:
```
routing/
├── domain/        route.entity.ts (RouteRequest, RouteResult), routing.port.ts (RouteProviderPort, RouteCachePort)
├── application/   getRoute.usecase.ts
├── infrastructure/ googleRoutes.provider.ts, haversine.provider.ts, ttlRouteCache.ts
├── routing.container.ts
├── routing.public.ts
└── index.ts
```
1. **Domain.**
   ```ts
   interface RouteRequest { origin: GeoPoint; destination: GeoPoint; vehicleCategory: VehicleCategory }
   interface RouteResult {
     provider: string;          // 'GOOGLE_ROUTES' | 'HAVERSINE_ESTIMATE'
     distanceM: number;         // integer metres
     durationS: number;         // integer seconds
     polyline: string | null;   // encoded, kept OUT of quote tokens
   }
   interface RouteProviderPort { calculateRoute(req: RouteRequest): Promise<RouteResult> }
   interface RouteCachePort { get(key: string): RouteResult | null; set(key: string, v: RouteResult): void }
   ```
2. **Google adapter** (`googleRoutes.provider.ts`).
   - `POST https://routes.googleapis.com/directions/v2:computeRoutes`
   - Headers: `Content-Type: application/json`, `X-Goog-Api-Key`, and
     `X-Goog-FieldMask: routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline`.
   - Body: `{ origin: { location: { latLng: { latitude, longitude } } }, destination: {…},
     travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' (or 'TRAFFIC_AWARE'), units: 'METRIC' }`.
   - Response `duration` is a string like `"1234s"` → parse to integer seconds. `distanceMeters` is an integer.
   - No `routes[0]` → `ROUTE_UNAVAILABLE`. Validate numbers are finite and `distanceM > 0`.
   - Vehicle mapping: `CAB` → `DRIVE`; `E_RICKSHAW`/`MOTO` → `DRIVE` (no special mode now).
3. **Haversine provider** is for `NODE_ENV !== 'production'` and tests only: distance =
   `haversineDistanceM × 1.3` (road factor), duration = distance / 8.33. `provider: 'HAVERSINE_ESTIMATE'`.
   The container must **refuse to construct it in production**.
4. **Cache** (`ttlRouteCache.ts`): in-memory `Map` with TTL (`ROUTING_CACHE_TTL_S`, default 600) and a
   max size (evict oldest). Key = origin/destination rounded to 5 decimals + vehicle category. Cache
   only successes.
5. **`GetRouteUseCase`**: cache lookup → provider → cache set. Records simple counters
   (requests, failures, cache hits, total latency) in memory for a later admin health endpoint.
6. **Config** in `src/config/env.ts`: `ROUTING_PROVIDER` (`google|haversine`, default `google` in
   production), `GOOGLE_ROUTES_API_KEY` (required when provider is `google`, validated at startup),
   `ROUTING_TIMEOUT_MS`, `ROUTING_CACHE_TTL_S`, `ROUTING_TRAFFIC_AWARE`. Add placeholders to
   `.env.example`, `.env.stage.example`, `.env.prod.example`.
7. **Wire** `routing` into `container.ts` (`AppContainers.routing`), overridable for tests.
8. **Tests:** provider with fake `fetchFn` (success, 4xx no-retry, 5xx one retry, timeout, no routes,
   malformed duration); cache TTL and eviction; container refuses haversine in production.

## 4. Phase 2 — Route state segmentation (geo + stateBoundary)

1. **`packages/geo/src/polyline.ts`:** `decodePolyline(encoded: string, precision = 5): Position[]`
   (standard Google algorithm, returns `[lng, lat]`). Tests with a known encoded sample and a
   round-trip.
2. **`packages/geo/src/route-segments.ts`:** pure
   `segmentRouteByStates(points: Position[], regions: { code: string; geometry: GeoJsonGeometry }[]):
   { stateCode: string; distanceM: number }[]`.
   - For each consecutive pair, attribute its haversine length to the state containing the segment's
     midpoint (`isPointInGeometry`), using a bounding-box pre-filter per region. Densify segments
     longer than ~2 km before classifying so a long straight segment across a border is split.
   - Merge adjacent pieces with the same state; points inside no region attribute to `'UNKNOWN'`.
   - Result distances must sum to the route length (test this).
3. **`stateBoundary`: `ResolveRouteStatesUseCase`** — loads active boundaries through a small
   `ActiveBoundaryCache` (in-process, TTL 60 s, **invalidated by import / update / activate /
   deactivate** in the same process), decodes the polyline, calls `segmentRouteByStates`, returns
   `RouteStateSegmentDto[]`. Expose via the container.
4. **Tests:** WB→BR→WB polyline across two squares; route fully in one state; route leaving all
   states (`UNKNOWN`); cache invalidation after a state is disabled; distances sum.

## 5. Phase 3 — State pricing made real and secure (pricing)

1. **Validate state.** `CreateStatePricingUseCase` requires the state to exist and be ACTIVE
   (inject a small structural `StateLookup { getActive(code): Promise<unknown | null> }`;
   implement it from the stateBoundary container). Unknown/inactive → 400 `STATE_NOT_FOUND`.
2. **Atomic versioning.** Add to `StatePricingRepositoryPort`:
   `createNewVersionAtomically(next: StatePricingEntity): Promise<StatePricingEntity>` — in Mongo,
   retire the current ACTIVE record and insert the new one in a **transaction** (rs0 is available)
   and add a **partial unique index** `{ state_code: 1 }` where `status = 'ACTIVE'`. Memory repo
   mirrors it. Remove the read-then-write in the use case.
3. **Audit.** Add `createdByAdminId: string` to `StatePricingEntity` (+ model, DTO, mapper with
   default). Pass the authenticated admin from the controller.
4. **Endpoints** (`/api/v1/admin/pricing/states`, **SUPER_ADMIN only** for writes; reads any admin):
   `GET /`, `POST /` (new version = edit), `POST /:id/retire`. Retire needs `expectedVersion`.
5. **Web.** `StatePricingTable`: add Edit (opens the dialog pre-filled; saves a new version) and
   Retire actions, show version and creator; the code field becomes a select of active states from
   `useAllStates`. Hide write buttons for non-SUPER_ADMIN if the client knows the role, but the API is
   the real gate.
6. **Fare function** — new pure function in `pricing/domain/pricingConfig.entity.ts` (or a sibling
   `fare.ts`), no I/O:
   ```ts
   calculateFare({ config, distanceM, routeScope, segments, stateRates, isBufferFallback })
   ```
   - `CITY` or `INTRA_STATE`: existing `calculateBaseFareEstimate` on the routed `distanceM`.
   - `INTERSTATE` (assumptions A–D): `base = destinationState?.baseFarePaise ?? config.baseFarePaise`;
     deduct `config.includedDistanceM` from the start of the segment list; distance fare =
     Σ `round(km × rate(segment.state))` where `rate = stateRates[state]?.ratePerKmPaise ??
     config.ratePerKmPaise`; `subtotal = base + distance fare`;
     `minimum = max(config.minimumFarePaise, destinationState?.minimumFarePaise ?? 0)`;
     `fare = max(minimum, subtotal)`.
   - Return `{ farePaise, appliedSegments: { stateCode, distanceM, ratePerKmPaise }[] }`.
   - Tests: table-driven, incl. B (missing state rate), D (included distance spanning a border),
     rounding, minimum-fare floor.

## 6. Phase 4 — Quote integration (pricing + rides)

`CreateQuoteUseCase` new order (never call the paid API for a trip that cannot be served):
1. `classification = classify({pickup, drop, vehicleCategory, requestedService})` — no segments;
   this runs the state guard and the serviceability flags, so unserviceable trips fail before any route call.
2. `route = routing.getRoute(...)`.
3. `segments = resolveRouteStates(route.polyline)`.
4. If `segments` cover more than one state but `classification.routeScope !== 'INTERSTATE'`,
   re-run `classify` with `routeStateSegments` (the route crosses a state the endpoints don't).
5. Load city config, then state rates for every state in `segments`; compute `calculateFare`.
6. Bounds via `calculateNegotiationBounds` as today.

Contract and token changes (all optional fields):
- `QuoteDto` / `QuoteTokenPayload`: **replace** the heuristic `estimatedDurationSeconds` with
  `route.durationS`; add `routeProvider`, `stateSegments` (`stateCode, distanceM, ratePerKmPaise`),
  `statePricingVersions: Record<string, number>`. Do **not** add the polyline. Keep the token small
  (cap segments at 8; merge the tail into the last).
- `createRide`: copy `routeProvider`, distance, duration and `stateSegments` into `routeSnapshot`
  / `zoneSnapshot`; extend the stale-quote check to also compare current state pricing versions
  (`PRICING_VERSION_MISMATCH`, 409).
- Remove the `HAVERSINE_ESTIMATE` literal in `createRide`; use `quote.routeProvider`.
- Tests: quote for CITY, INTRA_STATE, INTERSTATE (two states), route crossing an extra state,
  unserviceable trip **does not call the provider** (assert the fake was not invoked), routing failure →
  503, disabled interstate flag → `INTERSTATE_SERVICE_DISABLED`, state pricing bumped → ride 409.

## 7. Phase 5 — Ride HTTP API and authorisation (api)

The rides use cases exist but have **no controllers/routes and are not mounted**.
1. `rides/interface/`: `rides.controller.ts`, `rides.routes.ts`, `rides.swagger.ts` (follow
   `zone.swagger.ts`), reuse `rides.validation.ts` schemas.
2. Endpoints (rider = role `RIDER`; driver = `DRIVER`):
   - `POST /v1/rides` (rider) → `CreateRideUseCase`
   - `GET /v1/rides/:id` (participant or admin)
   - `POST /v1/rides/:id/cancel` (rider/driver, per `CancelRideUseCase` rules)
   - `POST /v1/rides/:id/accept`, `/en-route`, `/arrived`, `/start`, `/complete` (driver)
   Ownership checks belong in the use case/controller: a rider can only read/cancel their own ride;
   a driver only rides they accepted.
3. `rides.container.ts`: build repositories and use cases; pass
   `quoteStateVerifier: stateBoundary.verifyQuoteStateUseCase`; mount in `container.ts` / `routes.ts`.
4. **Quote endpoint security:** `POST /v1/pricing/quotes` gets `authenticate` + `requireRole('RIDER')`
   and a per-user rate limit (each call can cost a paid API request). If `express-rate-limit` is not
   already a dependency, implement a small in-memory limiter behind an interface rather than adding one.
5. **Pricing admin authorisation:**
   - State pricing writes → `SUPER_ADMIN`.
   - City pricing config writes → `SUPER_ADMIN`, or `CITY_ADMIN` **only for their zones** using
     `requireZoneAccess`. Its extractor is synchronous today; extend `ZoneIdExtractor` to
     `string | undefined | Promise<string | undefined>` and, for `:id` routes, look the config up to
     get `cityZoneId`. Keep the change backward compatible.
6. Tests: 401/403/404/409 per endpoint; a rider cannot read another rider's ride; a CITY_ADMIN cannot
   edit another city's pricing; full HTTP flow quote → ride with fake routing.

## 8. Phase 6 — Zone integrity and audit (zone, stateBoundary)

1. **Zone inside state.** `ValidateZoneUseCase`: a CITY zone must lie within one ACTIVE state
   (all vertices inside that state's boundary). New violation `Z-STATE-OUTSIDE` (ERROR) in
   `packages/geo` `Z_CODES`. Derive/verify `zone.stateCode` from the geometry instead of trusting input.
   Inject a structural `StateLocator` so the zone module does not import `stateBoundary`.
2. **State history actor.** Add `actorId: string | null` to `StateBoundaryHistoryEntry` (+ model,
   mapper default null); thread the admin id from controllers into `ManageStateUseCase` and the
   importer. Show "by <admin>" in `StateHistoryDialog`.
3. Tests: zone straddling a border rejected; zone in a disabled state rejected; history carries the actor.

## 9. Phase 7 — Routing admin, docs, cleanup

1. `GET /v1/admin/routing/health` and `/metrics` (SUPER_ADMIN): provider name, configured yes/no
   (never the key), counters from Phase 1. Optional "Routing" screen under System in the sidebar.
2. Update `docs/LLD/geo-reference-and-routing.md`: CITY = ZONE; routing implemented; fare formula and
   assumptions A–F; ride endpoints; error codes (`ROUTE_UNAVAILABLE`, `STATE_NOT_FOUND`).
3. Update the swagger for every new endpoint; run `graphify update .`.

## 10. Definition of done
- `cd apps/api && npx tsc --noEmit && npx vitest run` green; integration suite green;
  `cd apps/web && npx tsc --noEmit` and `npx eslint` on touched paths clean.
- A quote's distance and duration come from the routing provider; production refuses the haversine provider.
- An unserviceable trip never triggers a route request.
- An interstate quote is priced per state segment; missing state rates fall back to the city rate.
- At most one ACTIVE state pricing per state (enforced by a unique partial index, tested on real Mongo).
- Every new route has explicit authentication and role checks, each with a 401/403 test.
- No secret appears in code, logs, tests, docs or `.env.example`.

## 11. Known limitations (do not "fix" unless asked)
- No tolls; no persisted quotes; no polyline in quote tokens; no traffic-aware pricing by default.
- Route-state attribution is by segment midpoint (error ≤ one densified segment ≈ 2 km at a border).
- Route/boundary cache is per process (TTL-based); multi-instance deployments see changes within the TTL.
- Interstate rate policy is assumptions A–D until the owner confirms otherwise.
