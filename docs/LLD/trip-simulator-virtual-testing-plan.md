# Trip Simulator — Virtual Pickup/Drop/Pricing Testing UI

**Status:** Proposed implementation plan
**Audience:** Any coding agent implementing this (fresh context — read this whole document before touching code)
**Scope:** Admin web app (`apps/web`) only. No *new endpoint* is needed — but read the note below
before assuming zero backend changes are required.
**Depends on:** `docs/LLD/outstation-pricing-tier-plan.md` — a separate backend plan that changes
what `POST /v1/pricing/quotes` returns for an outstation trip (adds a genuinely different outstation
rate tier, and removes the `NO_ACTIVE_ZONE` rejection for a pickup far from any city zone). This
document's test matrix (§7) assumes that plan has already shipped. If it hasn't, the "pickup outside
every zone" row in §7 is wrong (it currently predicts a rejection that plan removes).

---

## 1. Context — why this exists

Cabzon's admin web app (`apps/web`) already has a nav entry reserved for this:

```ts
// apps/web/src/components/nav-items.ts, "Pricing" section
{ label: 'Quotes & Fare Rules', href: '/quotes', icon: Receipt, comingSoon: true },
```

It has never been built. The only thing that currently resembles a "tester" is
`apps/web/src/features/pricing/components/FareSimulatorSection.tsx` (the "Live Fare Simulator" tab
on the Pricing screen) — **and it is not a real test of the system.** Read it before you start; it
re-implements the fare formula by hand in the browser (`baseFarePaise + distanceFarePaise + ...`)
from a manually-typed distance slider. It never sends a pickup/drop pair to the backend, never
exercises zone/buffer/city resolution, and has no concept of `IN_CITY` / `OUTSTATION` /
`INTERSTATE` or `routeScope` — those only exist server-side. It is a calculator, not a test, and it
has already drifted from the real system once (it has no buffer-vs-no-buffer distinction wired to
real geometry, and no awareness that interstate pricing changed to be uniform — see
`docs/decision-log.md` D-037).

**The actual request:** a UI where an admin places a real pickup point and a real drop point (by
clicking a map, searching a place, or typing exact lat/lng) and gets back the **real, server-computed**
classification and quote — the same code path a rider's app would hit. This is how you verify the
in-city / buffer / outstation / interstate boundary logic is behaving correctly, visually, without
writing or running a backend test for every scenario.

### What already exists and must be reused, not rebuilt

| Need | Already exists at |
|---|---|
| Quote endpoint (classification + fare, real backend logic) | `POST /v1/pricing/quotes` — `apps/api/src/modules/pricing/interface/pricing.routes.ts`, public, no auth required |
| Zone-only resolution endpoint (classification without a full route) | `POST /v1/zones/resolve` — `apps/api/src/modules/zone/interface/zone.routes.ts`, public |
| Map loader (Google Maps JS SDK, singleton script load) | `apps/web/src/lib/googleMaps.ts` (`loadMapLibraries`, `DEFAULT_CENTER`, `hasApiKey`) |
| Place search box (autocomplete, moves the map, nothing else) | `apps/web/src/features/zones/components/PlaceSearch.tsx` — pattern to copy, not necessarily the exact component (it's scoped to the zone editor's `ZoneMap`'s `maps`/`places` libs from `features/zones/lib/google-maps.ts`, a thin wrapper around the shared loader) |
| `request()` HTTP client with auth-token + idempotency handling | `apps/web/src/lib/api/client.ts` |
| `useApiMutation` (React Query mutation wrapper, token injection) | `apps/web/src/lib/query/mutation.ts` |
| `authedQueryOptions` (React Query GET wrapper, token injection) | `apps/web/src/lib/query/factory.ts` |
| Design system primitives (Button, Input, Select, Badge, PageHeader, StatTile, SegmentedControl, Skeleton) | `@cabzone/design-system` |
| Money formatting | `formatPaise()` in `apps/web/src/lib/format.ts` |
| Vehicle category list | `VEHICLE_CATEGORIES`, `VehicleCategory` in `packages/contracts/src/vehicles.ts` |

**Do not** write a new fare formula in the frontend. **Do not** reuse `ZoneMap.tsx` as-is — it's a
heavyweight polygon editor (hand-rolled polygon tracing, vertex drag, GeoJSON data layers). This
feature needs a much simpler two-pin picker; building it on top of `ZoneMap` would mean fighting its
editing-mode state machine for a feature that doesn't edit anything.

---

## 2. Goal and non-goals

**Goal:** an admin screen at `/quotes` where you can:
1. Place a pickup pin and a drop pin, by map click, place search, or typed lat/lng.
2. Pick a vehicle category.
3. Get back the real server response: service type (`IN_CITY`/`OUTSTATION`/`INTERSTATE`),
   `routeScope`, `bufferApplied`, resolved city zone, resolved destination state (display-only),
   distance/duration, suggested fare, negotiation floor/ceiling, and — critically — the **error**
   when the backend rejects the trip (`NO_ACTIVE_ZONE`, `PRICING_UNAVAILABLE`, `ROUTE_UNAVAILABLE`,
   `E_RICKSHAW_CITY_ONLY`), shown plainly, not swallowed.
4. Keep a short running list of simulated scenarios on screen, so an admin can place several
   pickup/drop pairs (e.g. "just inside buffer" vs "just outside buffer") and compare results
   side by side without re-entering coordinates.

**Non-goals (explicitly do not build these now):**
- No booking/ride creation from this screen — it must never call `POST /v1/rides`. It only calls
  the quote (and optionally zone-resolve) endpoints, which are side-effect-free reads (`CreateQuoteUseCase`
  signs a token but persists nothing).
- No new backend endpoint for the MVP. `/v1/pricing/quotes` already returns everything listed above.
  (See §6 for an optional backend addition if the implementing agent decides richer diagnostics are
  worth it — only do this if explicitly asked.)
- No editing of zones, pricing configs, or anything persistent from this screen.
- No replacement of `FareSimulatorSection.tsx` in this pass. It can stay (it's still useful for
  "what if I change the rate/km" what-if questions that don't depend on geography). Flag the drift
  problem in a code comment if you touch that file, but don't delete it as part of this plan.

---

## 3. UX design

Route: `/quotes` (nav entry already exists — just remove `comingSoon: true` once the page is live;
rename the label if you want, e.g. "Trip Simulator", since "Fare Rules" doesn't describe this).

Layout — two-pane, map-left / controls-right, matching the existing Zones screen's shape
(`apps/web/src/features/zones/components/ZonesScreen.tsx`: `ZoneMap` + `ZoneRail` side by side):

```
┌─────────────────────────────────────────┬──────────────────────────────┐
│                                           │  Pickup                      │
│                                           │   [lat] [lng]  [Set on map]  │
│              MAP                         │  Drop                        │
│   (click: first click = pickup,          │   [lat] [lng]  [Set on map]  │
│    second click = drop; click again      │  Vehicle: [CAB ▾]            │
│    on either pin to re-place it)         │  [ Place search box ]        │
│                                           │                              │
│   pickup = green pin, drop = red pin     │  [ Simulate Quote ]          │
│                                           │                              │
│                                           │  ── Result ──                │
│                                           │  Service Type: IN_CITY       │
│                                           │  Route Scope: —              │
│                                           │  Buffer Applied: No          │
│                                           │  City Zone: Siliguri City    │
│                                           │  Destination State: —        │
│                                           │  Distance: 4.46 km           │
│                                           │  Duration: 9 min             │
│                                           │  Suggested Fare: ₹86.90      │
│                                           │  Negotiation: ₹69.52–₹130.35 │
│                                           │  Provider: HAVERSINE_ESTIMATE│
│                                           │                              │
│                                           │  ── Scenario log (session) ──│
│                                           │  [table of past simulations] │
└─────────────────────────────────────────┴──────────────────────────────┘
```

Interaction rules:
- First map click sets pickup, second sets drop, further clicks replace whichever pin was placed
  longer ago (or: click a pin to pick it up and click again to drop it — pick whichever is simpler
  to implement correctly; document the choice in a code comment since it's a judgment call).
- Typed lat/lng fields are the precision path — **this matters** for testing an exact buffer
  threshold (e.g. a zone with `bufferDistanceM: 25000`, you want to place a drop at *exactly*
  25,001m from the boundary to confirm it falls to `OUTSTATION`). Map clicks alone can't hit that
  precision; the lat/lng inputs must accept free typing, not just reflect pin position.
- "Simulate Quote" is an explicit button, not an auto-fire on every pixel of pin drag. If you want
  auto-fire on drag-end, debounce at least 400ms — the quote endpoint does a real routing call
  (Google Routes or haversine fallback) and this is a diagnostic tool, not a live map, so don't
  spam it.
- On error, render the backend's error code and message directly (e.g. a `Badge tone="danger"` with
  the raw `NO_ACTIVE_ZONE: Service is not available for this route or location.` text) — do not
  translate it into a generic "something went wrong." This screen's whole job is showing admins
  *exactly* what the backend decided and why.
- The scenario log is in-memory/session state only (a React array, not persisted) — each successful
  or failed simulation appends a row: pickup, drop, vehicle, result summary, timestamp. No backend
  storage, no new DB collection.

---

## 4. Architecture / file plan

Follow the existing feature-folder convention exactly (`apps/web/src/features/<name>/{components,hooks,lib}`).
New feature: `quotes`.

### 4.1 API client

**New file:** `apps/web/src/lib/api/endpoints/quotes.ts`

Mirror the shape of `apps/web/src/lib/api/endpoints/pricing.ts` and `zones.ts` — a plain object of
functions calling `request()`:

```ts
import type { GeoPoint, QuoteDto, ServiceClassificationType, VehicleCategory } from '@cabzone/contracts';
import { request } from '../client.js';

export interface SimulateQuoteInput {
  pickup: GeoPoint;
  drop: GeoPoint;
  vehicleCategory: VehicleCategory;
  requestedService?: ServiceClassificationType;
}

export const quotesApi = {
  simulate: (body: SimulateQuoteInput, token?: string) =>
    request<QuoteDto>('/v1/pricing/quotes', {
      method: 'POST',
      body,
      token,
    }),
};
```

Check `GeoPoint` is actually exported from `@cabzone/contracts` (it's re-exported from
`@cabzone/geo` via `packages/contracts/src/zones.ts: export * from '@cabzone/geo'`) — if the import
resolves, use it; if not, inline `{ lat: number; lng: number }`.

Note the backend's `pricing.controller.ts` `makeCreateQuoteController` does **not** run the body
through a zod schema — it passes `req.body` straight to `CreateQuoteUseCase.execute`. That's a
backend characteristic, not something to fix here; just know the client isn't protected by a typed
400 response for malformed input, so validate pickup/drop are finite numbers in range before
sending (reuse the same bounds the backend's `ResolveZonesUseCase.validateCoordinates` enforces:
lat -90..90, lng -180..180 — see `apps/api/src/modules/zone/application/useCases/resolveZones.usecase.ts`).

Optionally also wrap zone-resolve for a lighter preview (no routing call):

```ts
  resolveZone: (body: { pickup: GeoPoint; drop: GeoPoint }, token?: string) =>
    request<ResolvedZonesDto>('/v1/zones/resolve', { method: 'POST', body, token }),
```

(`ResolvedZonesDto` ≈ `ResolvedZones` from `packages/contracts/src/zones.ts` — check the exact
exported name before using it.)

### 4.2 Hook

**New file:** `apps/web/src/features/quotes/hooks/useQuoteSimulation.ts`

This is an on-demand action, not a cached list — use `useApiMutation`, same pattern as
`useCreatePricingConfig` in `apps/web/src/features/pricing/hooks/usePricing.ts`:

```ts
'use client';

import type { QuoteDto } from '@cabzone/contracts';
import { quotesApi, type SimulateQuoteInput } from '@/lib/api/endpoints/quotes.js';
import { useApiMutation } from '@/lib/query/mutation.js';

export function useSimulateQuote(onSuccess?: (quote: QuoteDto) => void) {
  return useApiMutation<SimulateQuoteInput, QuoteDto>({
    call: (token, body) => quotesApi.simulate(body, token),
    // No `invalidates` — this mutates nothing server-side.
    ...(onSuccess ? { onSuccess } : {}),
  });
}
```

No entry needed in `apps/web/src/lib/query/keys.ts` unless you add a cached GET (e.g. for
zone-resolve preview) — if you do, add a `quotes` block there following the existing shape
(`keys.pricing`, `keys.zones`, etc.).

### 4.3 Components

**New files under `apps/web/src/features/quotes/components/`:**

- `TripSimulatorScreen.tsx` — the page-level component (what `page.tsx` renders inside
  `<Suspense>`, matching `PricingScreen`/`ZonesScreen`'s shape: `PageHeader` + two-pane layout).
- `TripPointMap.tsx` — the map. **Keep this intentionally small.** It needs: load the map via
  `loadMapLibraries` from `@/lib/googleMaps.ts` (the *shared* one, not the zones-feature-local
  `features/zones/lib/google-maps.ts` wrapper — this screen isn't editing zone polygons, it doesn't
  need the `places` library wrapper that file adds on top, though reusing it is fine too since it
  just re-exports the shared loader); two draggable `google.maps.Marker` instances (pickup green,
  drop red — look at `zone-layers.ts` for the project's existing color/style tokens before picking
  new ones, stay consistent); a click handler that places whichever pin isn't set yet; marker
  `dragend` events that report the new lat/lng up to the parent. No `Data` layer, no polygon drawing
  — this is simpler than `ZoneMap` by design.
- `TripSimulatorForm.tsx` — lat/lng number inputs for pickup and drop, vehicle `Select`, "Simulate
  Quote" `Button`. Lat/lng inputs are the source of truth the map pins sync *from* and *to* (typing
  a value moves the pin; dragging a pin updates the fields) — keep this bidirectional sync in the
  parent screen component, not buried in the map component, same reasoning `ZoneMap` uses for
  `onDraftChange`/`draft` (controlled from above, map only reports and renders).
- `QuoteResultPanel.tsx` — renders a `QuoteDto` (or an error) as the result card described in §3.
  Use `Badge` for `serviceType`/`routeScope` (tone mapping: `IN_CITY` → `accent`, `OUTSTATION` →
  `default`/neutral, `INTERSTATE` → `warning` or similar — pick tones already used elsewhere in the
  design system rather than inventing new ones), `formatPaise()` for every money value, never a raw
  paise integer in the DOM.
- `ScenarioLog.tsx` — the session-only table of past simulations. Plain `useState<ScenarioEntry[]>`
  in the parent screen, passed down as props; cap it (e.g. last 20 entries) so it doesn't grow
  unbounded in a long admin session.

Optional, if reused instead of hand-rolled: `PlaceSearch.tsx`-style search box to pan the map. Copy
the pattern (imperative mount of `PlaceAutocompleteElement`, "search moves the map and nothing
else") rather than importing the zones-feature one directly, since that component is typed against
the zones feature's own `google-maps.ts` re-export — either works, but copying keeps `features/quotes`
free of a dependency on `features/zones`.

### 4.4 Route

**New file:** `apps/web/src/app/(panel)/quotes/page.tsx`

Mirror `apps/web/src/app/(panel)/pricing/page.tsx` exactly: `Suspense` wrapper with a `Skeleton`
fallback, default-exports a page component that renders `<TripSimulatorScreen />`.

Because the map needs `window` and the Google Maps JS SDK, **dynamic-import `TripPointMap` with
`ssr: false`** inside `TripSimulatorScreen.tsx` — this is the exact pattern already used for
`ZoneMap` (see the comment in `apps/web/src/features/zones/lib/google-maps.ts`: *"`ZoneMap` is
behind `dynamic(..., { ssr: false })`, which keeps the whole Google bundle out of the List view and
off the server"*). Example:

```ts
const TripPointMap = dynamic(() => import('./TripPointMap.js').then((m) => m.TripPointMap), {
  ssr: false,
});
```

### 4.5 Nav

**Edit:** `apps/web/src/components/nav-items.ts` — remove `comingSoon: true` from the `/quotes`
entry once the page works end-to-end. Don't flip it early; a broken nav link reads worse than a
greyed-out "coming soon."

---

## 5. Code rules (repo conventions — follow these exactly)

1. **Every interactive component starts with `'use client';`** as its first line (see every file
   referenced above).
2. **No direct `fetch()` calls in components.** All HTTP goes through `lib/api/endpoints/*.ts`
   wrapping `request()` from `lib/api/client.ts`. Components call hooks, hooks call the endpoint
   module.
3. **Data fetching is always through React Query**, never a bare `useEffect` + `fetch`:
   - Cached reads → `useQuery(authedQueryOptions({ queryKey, fetch, staleTime, ... }))`.
   - One-shot actions (this feature's "Simulate Quote" included) → `useApiMutation({ call, ... })`.
4. **Query keys live in `lib/query/keys.ts`**, never inlined as ad-hoc arrays in a component — add
   a `quotes` block there if you introduce any cached query.
5. **Never reimplement backend logic in the frontend.** This plan exists specifically because
   `FareSimulatorSection.tsx` did exactly that and drifted from the real pricing rules. Every number
   and classification this screen shows must come from the `QuoteDto` the backend returned — if the
   UI needs a derived display value (e.g. `distanceKm = quote.distanceM / 1000`), that's fine; a
   *formula* (base fare + rate × distance) is not.
6. **All money is formatted through `formatPaise()`** (`apps/web/src/lib/format.ts`) — never render
   a raw `*Paise` field.
7. **Only `@cabzone/design-system` components for UI primitives** — `Button`, `Input`, `Select`,
   `Badge`, `PageHeader`, `StatTile`, `SegmentedControl`, `Skeleton`. Don't hand-roll a button or
   dropdown.
8. **Google Maps components are dynamic-imported with `ssr: false`** and load the SDK through the
   shared loader in `apps/web/src/lib/googleMaps.ts` (or a thin feature-local re-export of it, as
   `features/zones/lib/google-maps.ts` does) — never a second `<script>` tag or a duplicate
   script-loading singleton.
9. **`exactOptionalPropertyTypes` is on repo-wide.** Spread optional props conditionally
   (`...(value !== undefined ? { key: value } : {})`), never pass an explicit `undefined` for an
   optional field — see the comment in `PlaceSearch.tsx` for the exact reasoning.
10. **No new backend module/use-case/route for the MVP.** This is a pure consumer of
    `POST /v1/pricing/quotes` (and optionally `POST /v1/zones/resolve`), both of which already
    exist and are already public (no admin auth required) per `apps/api/src/routes.ts`. If an
    admin-auth gate is wanted around *this UI page* (not the API), that's a frontend routing
    concern (the `(panel)` layout likely already requires an authenticated admin session to reach
    any `/…` route under it — verify with `apps/web/src/app/(panel)/layout.tsx` before assuming
    either way).
11. **Follow the existing two-pane screen shape** (`ZonesScreen.tsx`'s map+rail layout,
    `PricingScreen.tsx`'s `PageHeader` + stat tiles + content), not a new layout pattern — this
    keeps the admin app visually consistent.
12. **TypeScript strict, no `any`.** Type the quote response and simulate-input exactly against
    `QuoteDto`/the request shape from `@cabzone/contracts` — don't loosen types to get past an
    error; fix the actual mismatch (check `packages/contracts/src/pricing.ts` for the current
    `QuoteDto` shape before writing the result panel, since fields may have changed — e.g. as of
    D-037, `QuoteDto` no longer has `stateSegments`/`statePricingVersions`/`stateBoundaryVersion`/
    `stateConfigVersion`; only `routeScope` and `destinationStateCode` remain for state info, both
    display-only).

---

## 6. Optional backend addition (only if asked for — not required for MVP)

If the implementing agent (or the user, later) wants a **classification-only preview** that doesn't
wait on a routing-provider round trip (useful for instant feedback while dragging a pin, before
committing to "Simulate Quote"), `POST /v1/zones/resolve` already gives city/buffer/zone resolution
without pricing. Wire a debounced call to that endpoint as the pin moves, and reserve the full
`/v1/pricing/quotes` call for the explicit "Simulate Quote" button. This is strictly additive to the
plan above — do not build it unless it's actually wanted; the MVP in §2–§5 is already a complete,
useful tool without it.

Do **not** add a new backend endpoint that duplicates `CreateQuoteUseCase` logic. If richer output is
ever needed (e.g. exposing `classification.requestedService`/`recommendedService`/`discrepancyNotice`,
which `QuoteDto` doesn't currently carry), the right fix is adding those fields to `QuoteDto` and
`CreateQuoteUseCase`'s return value (`apps/api/src/modules/pricing/application/useCases/createQuote.usecase.ts`),
not building a parallel endpoint.

---

## 7. Test / verification scenarios

This is the actual point of the feature — once built, run these through the UI and confirm the
result matches. (These mirror the automated coverage in
`apps/api/test/quote-and-ride-engine.test.ts`'s "IN_CITY boundary logic in pickup-drop-pricing"
block — if a seeded city zone with a known boundary/buffer exists in the dev database, use its real
coordinates; otherwise seed one.)

| Scenario | Pickup | Drop | Expected `serviceType` | Expected `bufferApplied` | Expected `routeScope` | Expected fare tier |
|---|---|---|---|---|---|---|
| Both inside city zone | inside polygon | inside polygon | `IN_CITY` | `false` | `null` | city rate |
| Drop just past the boundary, inside the buffer | inside polygon | just outside, within `bufferDistanceM` | `IN_CITY` | `true` | `null` | city rate + buffer surcharge |
| Drop beyond the buffer, same state | inside polygon | far outside buffer, no other known city zone, same state | `OUTSTATION` | `false` | `INTRA_STATE` or `null` (if destination state can't be resolved without Google geocoding configured) | **outstation** rate (distinct from city rate — see `docs/LLD/outstation-pricing-tier-plan.md`) |
| Drop in a different state (needs `GOOGLE_ROUTES_API_KEY` configured, or a second seeded city zone in another state) | inside polygon (state A) | inside a city zone in state B, or far outstation in state B | `INTERSTATE` | `false` | `INTERSTATE` | outstation rate |
| Pickup far outside every zone, no distance cap (e.g. hundreds of km from the nearest seeded zone) | far from any seeded zone | anywhere | `OUTSTATION` (or `INTERSTATE` if drop resolves to a different state) | `false` | per destination state resolution | outstation rate of the **nearest** active city zone — `cityZoneId` must equal that zone's id, not be `null`; the trip must succeed, not error |
| Outstation vs In-City rate differentiation | inside polygon | scenario A: inside city, 15km; scenario B: beyond buffer, 15km | `IN_CITY` (A) vs `OUTSTATION` (B) | `false` | `null` | Result panel shows two different `suggestedFarePaise` values for the same 15km distance (outstation rate differs from city rate) |
| Zero active city zones exist in the system at all | n/a | n/a | — | — | — | Error: `NO_ACTIVE_ZONE` shown in the result panel — this is now the *only* case that should produce this error |
| E-Rickshaw requested for an outstation trip (either buffer-exceeded or pickup-outside-zone) | inside city, or outside every zone | outside city/buffer | — | — | — | Error: `E_RICKSHAW_CITY_ONLY` |

Also confirm:
- The scenario log accumulates each run and doesn't lose earlier rows.
- Typing exact lat/lng and clicking "Simulate" works without ever touching the map (for admins who
  know precise coordinates they want to test, e.g. from a bug report).
- No ride, zone, or pricing config is created/modified as a side effect of using this screen — check
  the relevant admin tables are unchanged after a simulation run.

---

## 8. Summary of files to add/edit

```
apps/web/src/lib/api/endpoints/quotes.ts                         (new)
apps/web/src/features/quotes/hooks/useQuoteSimulation.ts         (new)
apps/web/src/features/quotes/components/TripSimulatorScreen.tsx  (new)
apps/web/src/features/quotes/components/TripPointMap.tsx         (new)
apps/web/src/features/quotes/components/TripSimulatorForm.tsx    (new)
apps/web/src/features/quotes/components/QuoteResultPanel.tsx     (new)
apps/web/src/features/quotes/components/ScenarioLog.tsx          (new)
apps/web/src/app/(panel)/quotes/page.tsx                         (new)
apps/web/src/components/nav-items.ts                             (edit: drop comingSoon on /quotes)
apps/web/src/lib/query/keys.ts                                   (edit, only if a cached query is added)
```

Prerequisite backend changes (outstation pricing tier + unlimited-pickup fallback) are implemented in `docs/LLD/outstation-pricing-tier-plan.md`. No further backend changes are required for the Trip Simulator MVP (§6 is optional, separate work).
