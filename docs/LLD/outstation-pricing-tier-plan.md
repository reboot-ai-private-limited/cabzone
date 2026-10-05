# Outstation Pricing Tier + Unlimited-Pickup Serviceability

**Status:** Proposed implementation plan
**Audience:** Any coding agent implementing this (fresh context — read this whole document before touching code)
**Scope:** Backend (`apps/api`), shared contracts (`packages/contracts`), admin web (`apps/web`).
**Depends on / referenced by:** `docs/LLD/trip-simulator-virtual-testing-plan.md` (its test matrix in §7
is currently wrong about pickup-outside-zone behavior and must be updated once this lands — see §7
of this document).

---

## 1. Context — two confirmed gaps in the current pricing/serviceability model

This repo recently removed a per-*state* pricing override system (see `docs/decision-log.md` D-037)
and moved to "one pricing config per `(cityZoneId, vehicleType)`, used uniformly regardless of
route scope." While reviewing a plan to build a pickup/drop virtual-testing UI, the product owner
flagged that this went too far in one respect, and flagged a second, pre-existing gap:

1. **Outstation trips (same-state or interstate — `OUTSTATION`/`INTERSTATE` classification) need a
   genuinely different per-km fare than in-city (`IN_CITY`) trips.** This was never actually built —
   even before D-037, `IN_CITY` and same-state `OUTSTATION` already shared one rate
   (`PricingConfigEntity.ratePerKmPaise`); only cross-state trips had different (per-state) numbers,
   which D-037 removed. There has never been a `IN_CITY` vs `OUTSTATION` rate split in this schema.
   **Decision: add it as a second rate tier on the same `PricingConfigEntity` record** (not a
   separate config entity/collection) — confirmed by the product owner.

2. **A pickup outside every active city zone is a hard rejection (`NO_ACTIVE_ZONE`), with no
   fallback.** `ResolveZonesUseCase` already computes `nearestCity` when pickup isn't inside any
   zone's polygon, but nothing downstream ever uses it — `ServiceClassificationUseCase` and
   `CreateQuoteUseCase` only work from `resolved.city`, which is `null` in that case, and the quote
   throws before a fare is ever computed. **Decision: pickup is never rejected for being far from a
   city zone.** As long as at least one active city zone exists anywhere in the system, resolve the
   nearest one and price the trip as `OUTSTATION` through its config. There is deliberately **no**
   distance cap on this — a pickup a thousand kilometres from the nearest zone is still serviceable,
   just priced via that nearest zone's outstation tier. (The only case that should still produce
   `NO_ACTIVE_ZONE` is zero active city zones existing in the system at all — there is no config to
   price against.)

Read `apps/api/src/modules/zone/application/useCases/resolveZones.usecase.ts`,
`apps/api/src/modules/zone/application/useCases/serviceClassification.usecase.ts`,
`apps/api/src/modules/pricing/domain/pricingConfig.entity.ts`, and
`apps/api/src/modules/pricing/application/useCases/createQuote.usecase.ts` before starting — this
plan edits all four.

---

## 2. What does NOT change

- The drop-side buffer mechanism (`bufferDistanceM` / `bufferSurchargePaise` / `isWithinBuffer`,
  decision D-027) is untouched: pickup inside a city zone, drop just past that city's boundary
  within its configured buffer distance → still `IN_CITY`, with `bufferSurchargePaise` added to the
  **city** (not outstation) rate. That logic only ever applied to the drop and stays exactly as is.
- `E_RICKSHAW` stays restricted to `IN_CITY` only (`serviceClassification.usecase.ts`'s existing
  check) — an outstation-from-pickup trip must still reject `E_RICKSHAW` the same way an
  outstation-from-drop trip already does.
- `routeScope` (`INTRA_STATE`/`INTERSTATE`, display-only per D-037) and destination-state resolution
  (city-zone `stateCode` or the Google geocoding fallback) are unaffected — both `OUTSTATION` and
  `INTERSTATE` trips use the **same** outstation rate tier; `routeScope` keeps being purely a label.
- `includedDistanceM` (free-km allowance) stays a single field, shared by both tiers, unless you
  decide mid-implementation it needs splitting too — if so, treat that as a follow-up, not silently
  bundled into this change without flagging it back.

---

## 3. Backend changes

### 3.1 `PricingConfigEntity` — add the outstation tier

**File:** `apps/api/src/modules/pricing/domain/pricingConfig.entity.ts`

Add three fields, mirroring the existing city-tier fields:

```ts
export interface PricingConfigEntity {
  id: string;
  cityZoneId: string;
  version: number;
  vehicleType: VehicleCategory;
  baseFarePaise: number;
  ratePerKmPaise: number;
  minimumFarePaise: number;
  outstationBaseFarePaise: number;      // NEW
  outstationRatePerKmPaise: number;     // NEW
  outstationMinimumFarePaise: number;   // NEW
  includedDistanceM: number;
  bufferSurchargePaise: number;
  negotiationFloorPercent: number;
  negotiationCeilingPercent: number;
  negotiationWindowSeconds: number;
  commissionPercent: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: PricingConfigStatus;
  createdByAdminId: string;
  createdAt: Date;
}
```

Change `calculateBaseFareEstimate` to pick the tier explicitly — don't infer it from
`isBufferFallback`, that flag means something different (city-with-surcharge) and must stay
independent:

```ts
export function calculateBaseFareEstimate(opts: {
  config: PricingConfigEntity;
  distanceM: number;
  serviceType: 'CITY' | 'OUTSTATION';   // NEW, required
  isBufferFallback?: boolean;           // unchanged meaning; only ever true together with serviceType: 'CITY'
}): number {
  const { config, distanceM, serviceType, isBufferFallback = false } = opts;
  const billableDistanceM = Math.max(0, distanceM - config.includedDistanceM);

  const baseFarePaise = serviceType === 'OUTSTATION' ? config.outstationBaseFarePaise : config.baseFarePaise;
  const ratePerKmPaise = serviceType === 'OUTSTATION' ? config.outstationRatePerKmPaise : config.ratePerKmPaise;
  const minimumFarePaise = serviceType === 'OUTSTATION' ? config.outstationMinimumFarePaise : config.minimumFarePaise;

  const distanceFarePaise = Math.round((billableDistanceM / 1000) * ratePerKmPaise);
  const bufferSurcharge = isBufferFallback ? config.bufferSurchargePaise : 0;
  const subtotal = baseFarePaise + distanceFarePaise + bufferSurcharge;
  return Math.max(minimumFarePaise, subtotal);
}
```

Every existing call site of `calculateBaseFareEstimate` must now pass `serviceType` — there are
exactly two in production code (`createQuote.usecase.ts`, see §3.4) plus test call sites in
`apps/api/test/zone-pricing.test.ts` and `apps/api/test/quote-and-ride-engine.test.ts` (the
"IN_CITY boundary logic in pickup-drop-pricing" block added recently — update its
`calculateBaseFareEstimate(...)` calls to pass `serviceType: 'CITY'` or `'OUTSTATION'` matching each
scenario, and add new assertions that an outstation-priced trip actually uses
`outstationRatePerKmPaise`, not `ratePerKmPaise` — pick two different values in the test fixture
config specifically so a bug that uses the wrong tier produces a visibly wrong number, not a
coincidentally-matching one).

### 3.2 Contracts

**File:** `packages/contracts/src/pricing.ts`

Add the same three fields to `PricingConfigDto`, `CreatePricingConfigRequest`, and
`UpdatePricingConfigRequest` (as optional-with-default on create, optional on update, matching how
`bufferSurchargePaise`/`includedDistanceM` are already handled in
`apps/api/src/modules/pricing/interface/pricing.validation.ts`'s zod schemas — add corresponding
`z.number().int().min(0)` entries there too, with the same `minimumFarePaise >= baseFarePaise`-style
refinement applied to the outstation trio: `outstationMinimumFarePaise >= outstationBaseFarePaise`).

### 3.3 Mongo model + repository mapping

**File:** `apps/api/src/modules/pricing/infrastructure/persistence/pricingConfig.model.ts` — add
`outstation_base_fare_paise`, `outstation_rate_per_km_paise`, `outstation_minimum_fare_paise`
(`{ type: Number, required: true, min: 0 }`, matching the existing city-tier field definitions).

**File:** `apps/api/src/modules/pricing/infrastructure/persistence/mongoPricingConfig.repository.ts`
— extend `toPricingConfigEntity`/the `save()` document mapping with the three new fields (snake_case
in Mongo, camelCase in the entity, following the existing pattern exactly).

**Migration note:** existing `pricing_configs` documents won't have these fields. Decide one of:
- Require them in the schema (`required: true`) and write a one-time migration script
  (`apps/api/src/scripts/`, following whatever pattern `seed.ts` uses) that backfills
  `outstation_*` = the existing city `*` values for every existing document, so nothing breaks on
  deploy and admins can adjust the outstation numbers afterward.
- Or make them optional with a fallback-to-city-rate in `calculateBaseFareEstimate` for configs that
  predate this change. **Do not silently pick this path without flagging it** — a silent fallback
  means an admin who forgets to set outstation rates gets city pricing for outstation trips with no
  visible warning, which defeats the point of this change. If going this route, surface it loudly in
  the admin UI (§5) instead — e.g. disable activation until outstation fields are set, or show a
  warning badge on configs missing them.
- Since this looks like a pre-launch/dev system (see `docs/decision-log.md`'s own note on similar
  past migrations), a backfill migration is almost certainly the lower-risk choice — but confirm
  there's no production data before assuming that.

### 3.4 `ResolveZonesUseCase` — resolve a pricing-eligible city even when pickup isn't inside one

**File:** `apps/api/src/modules/zone/application/useCases/resolveZones.usecase.ts`

Current behavior: `nearestCity` is computed whenever `originCityEntity` is null, but
`ResolvedZones.city` stays `null` — nothing downstream uses `nearestCity` for pricing. Keep `city`
meaning exactly what it means today (the zone whose polygon contains pickup, or `null`) — don't
repurpose it, that would silently change `IN_CITY` detection elsewhere. Instead, downstream code
(§3.5) must explicitly fall back to `nearestCity` when `city` is `null`. No change needed to this
file itself beyond confirming `nearestCity` is always attempted regardless of distance (it already
is — `findNearestActiveCity` has no radius parameter per
`apps/api/src/modules/zone/domain/zone.port.ts:18`, confirm the Mongo/memory implementations don't
impose one either before assuming this is already correct).

### 3.5 `ServiceClassificationUseCase` — pickup-outside-zone becomes `OUTSTATION`, not rejected

**File:** `apps/api/src/modules/zone/application/useCases/serviceClassification.usecase.ts`

Current shape (after the D-037 refactor) computes `isCity`/`originCity` like this:

```ts
if (!originCity) {
  isCity = false;
} else {
  // ... dropInsideOriginCity / destinationCity / buffer checks ...
}
```

When `!originCity`, `isCity` becomes `false` (correct — not in-city) but `cityZoneId` ends up `null`
(`cityZoneId: originCity?.id ?? null`), which is what `CreateQuoteUseCase` currently treats as
"unserviceable." Change the fallback to use `resolved.nearestCity` for the zone/pricing identity
while keeping `isCity` false:

```ts
const originCity = resolved.city;
const pricingCity = resolved.city ?? resolved.nearestCity; // NEW — city used for cityZoneId/pricing

let isCity: boolean;
let bufferApplied = false;

if (!originCity) {
  isCity = false; // pickup outside every zone -> always OUTSTATION, never a buffer case
} else {
  // unchanged: dropInsideOriginCity / destinationCity / buffer checks against `originCity`
}
```

Everywhere the function currently reads `originCity?.id`/`originCity?.name` for the **output**
(`cityZoneId`, `cityName`), read `pricingCity?.id`/`pricingCity?.name` instead — but keep the
`isPointInPolygon(input.drop, originCity.boundary)` buffer-related checks reading `originCity`
specifically (not `pricingCity`), since those only make sense when pickup is actually inside a real
city zone.

Origin/destination state resolution (`originStateCode = originCity?.stateCode`) should also switch
to `pricingCity?.stateCode` — the state a far-outstation pickup is "in" should come from the nearest
city's `stateCode` the same way it already does for a drop that lands inside a known city zone,
consistent with how destination state resolution already works post-D-037.

The only remaining `NO_ACTIVE_ZONE` case is `pricingCity === null` (zero active city zones system-
wide) — `CreateQuoteUseCase`'s existing `if (!classification.cityZoneId) throw ...NO_ACTIVE_ZONE...`
check needs no code change, it'll just almost never fire anymore. Confirm this with a test that
seeds zero zones and asserts the error still fires (don't accidentally break that edge case while
fixing the common one).

### 3.6 `CreateQuoteUseCase` — pass `serviceType` into the fare calculation

**File:** `apps/api/src/modules/pricing/application/useCases/createQuote.usecase.ts`

```ts
const suggestedFarePaise = calculateBaseFareEstimate({
  config,
  distanceM: routeResult.distanceM,
  serviceType: classification.serviceType, // NEW — 'CITY' | 'OUTSTATION', already on ServiceClassificationDto
  isBufferFallback: classification.bufferApplied,
});
```

`classification.serviceType` already exists on `ServiceClassificationDto` (`'CITY' | 'OUTSTATION'`,
distinct from the three-valued `classification.type` — see the note already in
`apps/api/test/quote-and-ride-engine.test.ts` about `QuoteDto.serviceType` carrying
`classification.type`, not `classification.serviceType`; don't confuse the two when wiring this).

---

## 4. Test coverage to add/update

- `apps/api/test/zone-pricing.test.ts` — extend the `PricingConfig Domain Invariants & Fare
  Estimation` block: a fixture config with **different** city vs outstation rates (not equal
  numbers — a test using equal numbers for both tiers can't catch a bug that ignores `serviceType`
  entirely), assert `calculateBaseFareEstimate({ ..., serviceType: 'CITY' })` and
  `calculateBaseFareEstimate({ ..., serviceType: 'OUTSTATION' })` on the same distance produce
  different fares, and that `isBufferFallback` still only ever adds the **city** surcharge.
- `apps/api/test/quote-and-ride-engine.test.ts` — in the existing "IN_CITY boundary logic in
  pickup-drop-pricing" block, give `cabPricingConfig` distinct outstation numbers and:
  - Assert the existing "beyond the buffer -> OUTSTATION" test now computes its expected fare with
    `serviceType: 'OUTSTATION'` (it currently asserts against `isBufferFallback: false` with the
    *city* tier implicitly, because `serviceType` doesn't exist yet — this assertion is silently
    wrong post-change unless updated).
  - Add a new test: pickup far outside every seeded zone (e.g. hundreds of km away) + a drop
    anywhere → quote succeeds (no `NO_ACTIVE_ZONE`), `serviceType: 'OUTSTATION'`, `cityZoneId`
    equals the nearest seeded zone's id, and `suggestedFarePaise` matches
    `calculateBaseFareEstimate` with that zone's **outstation** tier.
  - Add a new test: zero zones seeded at all → quote still throws `NO_ACTIVE_ZONE` (the one
    remaining legitimate case).
- `apps/api/test/zone-resolution.test.ts` — add a `ServiceClassificationUseCase` test: pickup
  outside the only seeded zone and its buffer, far away → `type: 'OUTSTATION'`, `cityZoneId` equals
  the seeded zone's id (via `nearestCity` fallback), not `null`.

---

## 5. Admin web changes

- `apps/web/src/features/pricing/components/PricingConfigDialog.tsx` (create/edit form) — add three
  inputs for the outstation trio, grouped visibly separate from the city-tier inputs (e.g. a
  labelled sub-section "Outstation Rate" under the existing "City Rate" fields) so an admin can't
  miss that they're setting two different tiers. Mirror the existing city-field `Input` components
  exactly (same validation, same layout conventions already in that file).
- `apps/web/src/features/pricing/components/PricingConfigsTable.tsx` — the list view currently shows
  one rate/km column; decide whether to add a second "Outstation /km" column or keep the table
  focused on city rate with outstation visible only in the edit/view dialog — either is reasonable,
  pick based on how crowded the existing table already is (check the file before deciding, don't
  guess from this description alone).
- `apps/web/src/features/pricing/components/PricingConfigViewDialog.tsx` — show both tiers.
- `apps/web/src/features/pricing/components/FareSimulatorSection.tsx` — this component already
  reimplements the fare formula client-side (flagged as a problem in
  `docs/LLD/trip-simulator-virtual-testing-plan.md` §1) and now has an even bigger gap: it has no
  concept of a CITY/OUTSTATION toggle at all. At minimum, update its hand-rolled formula to add an
  outstation toggle mirroring the two tiers so it doesn't actively mislead admins testing outstation
  fares. Better: once `docs/LLD/trip-simulator-virtual-testing-plan.md` is implemented, that real
  pickup/drop-driven tool supersedes this one for anything involving actual geography (which
  city/outstation classification always does) — consider flagging `FareSimulatorSection` for removal
  at that point rather than maintaining two testers. Don't delete it as part of *this* plan without
  being asked; just don't let it silently go further out of sync.
- `apps/web/src/lib/api/endpoints/pricing.ts` / `packages/contracts/src/pricing.ts` request/response
  types need the three new fields threaded through (handled by §3.2 already).

---

## 6. Verification checklist

1. Seed (or use an existing) city zone with distinct `ratePerKmPaise` and `outstationRatePerKmPaise`
   values.
2. Pickup + drop both inside the zone → fare uses the **city** rate.
3. Pickup inside, drop just past the boundary within the buffer → fare uses the **city** rate plus
   `bufferSurchargePaise`.
4. Pickup inside, drop well beyond the buffer → fare uses the **outstation** rate, no surcharge.
5. Pickup far outside every zone (no buffer radius applied — confirm this works at, say, 500km from
   the nearest zone, not just a few km past it) → quote succeeds, `cityZoneId` is the nearest zone's
   id, fare uses that zone's **outstation** rate.
6. Zero active city zones in the system → quote throws `NO_ACTIVE_ZONE`.
7. `E_RICKSHAW` requested for any of the outstation cases above → rejected with
   `E_RICKSHAW_CITY_ONLY`, same as today.
8. Run `apps/api`'s full test suite (`pnpm -C apps/api test` or equivalent) — zero regressions
   expected outside the files listed in §4.

---

## 7. Required follow-up: fix the Trip Simulator plan's test matrix

`docs/LLD/trip-simulator-virtual-testing-plan.md` §7 currently has this row, which becomes **wrong**
once this plan ships:

> | Pickup outside every zone and buffer | far from any seeded zone | anywhere | — | — | Error:
> `NO_ACTIVE_ZONE` shown in the result panel, not a blank screen or unhandled exception |

Replace it with a row (or two) reflecting the new behavior: pickup far outside every zone now
**succeeds** as `OUTSTATION`, priced via the nearest zone's outstation tier — and add a new row
specifically asserting the outstation rate differs from the city rate for an otherwise-identical
distance (place the drop such that one scenario is "beyond buffer, same distance" and the other is
"inside city, same distance," and confirm the Trip Simulator's result panel shows two different
`suggestedFarePaise` values for the same `distanceM`). Keep the "zero active city zones ->
NO_ACTIVE_ZONE" case in the matrix — it's still correct, just now rare rather than common.

Also update `docs/LLD/trip-simulator-virtual-testing-plan.md` §2's non-goals note ("No new backend
endpoint for the MVP... `/v1/pricing/quotes` already returns everything listed above") — that's
still true (no *new endpoint* needed), but the sentence implying zero backend changes are needed is
now stale; this plan is a backend-change prerequisite for the Trip Simulator's test matrix to be
meaningful. Add a one-line "depends on `docs/LLD/outstation-pricing-tier-plan.md`" note near the top
of that document, pointing back here.
