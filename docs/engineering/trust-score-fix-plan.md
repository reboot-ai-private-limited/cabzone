# Trust Score Fix Plan

**Status:** Implemented on 2026-11-03 (decision record: D-048 in `docs/decision-log.md`). See "Implementation status" below for what shipped and where it differs from this plan.
**Scope:** rider and driver trust score (API, data, admin web, rider app, driver app).
**Source:** review of `trustScore.calculator.ts` and everything that feeds or shows it (this document replaces the review notes; findings are numbered F1 to F15 and tracked in section 9).
**Governing decisions:** D-021 (trust score), D-046 / OQ-018 (ratings, display threshold). This plan needs one new decision record that amends them (task P0-1).


---

## Implementation status

All phases P0 to P5 are implemented, with the recommended answer used for every decision in section 3. P6 (rollout) is a switch plus scripts: nothing has been run against a real database yet.

| Phase | State | Where |
|---|---|---|
| P0 Decisions and docs | Done | D-048 in `docs/decision-log.md` |
| P1 Data foundation | Done | `cancelledBy`, dispute fields, `rating_sum`, atomic ratings, one stats function: `rides/domain/tripStats.ts`, `cancellationPolicy.ts`, `mongoRide.repository.ts`, `mongoRider/DriverRepository` |
| P2 Calculator v2 | Done | `identity/domain/trustScore.v2.ts` (v1 kept until cut-over) |
| P3 Persist and refresh | Done | `identity/application/trustScore.service.ts`, ride repository hook, rating hook, daily sweep in `server.ts` |
| P4 Driver score and admin | Done | stored driver score and breakdown, admin driver view, web badges with flags |
| P5 Show to users | Done (offers and ride screen) | `riderTrustTier` on driver offers, `trustTier` on the assigned driver, both mobile apps |
| P6 Rollout | Switch and scripts ready | `TRUST_SCORE_V2=off\|shadow\|on` (default `on`), `pnpm --filter @cabzone/api backfill:trust` |

### Differences from the plan

| Plan said | What was built | Why |
|---|---|---|
| Rider stats by union of booker and passenger (P1-5) | Rider stats are by **booker only** | The account holder is responsible (the in-app legal text says so), ratings already go to the booker, and the old list query already grouped this way. The mismatch was in the detail view. This also uses the existing `booker_rider_id` index, so the extra `passenger.rider_id` index (P1-6) is not needed. |
| Unresolved disputes at half weight after 14 days (Q7) | Unresolved disputes count for **nobody** | A dispute does not say who is at fault until an admin decides, and system-raised disputes have no complainant. They are reported as `openDisputes`. |
| Unassigned cancellations count only above the daily limit (Q3) | Always neutral | The limit of 5 per day already blocks a sixth, so the exception could never apply. |
| New admin dispute-resolution action (P1-4) | **Not needed** | The flow already exists (`PAYMENT_DISPUTE_RESOLVED` with `RIDER_WINS` / `DRIVER_WINS`). The outcome and timestamps are now also stored on the ride so they survive the ride returning to `SETTLED`. |
| Decision ID "next after D-046" | **D-048** | D-047 was already taken (extension distance). |
| Mongo `update()` wrote ratings and trust | `update()` **no longer writes** ratings, rating sum or trust | A stale profile object could overwrite them. They change only through `applyRevealedRating` and `saveTrust`. |
| Default rollout mode: shadow first | Default is `on` | You asked for the fixes to be applied. Set `TRUST_SCORE_V2=shadow` in the environment to start with the logged comparison instead. |

### Not done

- Rider screen header line in `ride/[rideId].tsx` (it has encoding damage unrelated to this work) does not show the driver's tier yet. The ongoing-ride card does.
- Receipt screens do not show tiers.
- Pushed offers (WebSocket) carry the rider tier, but offers cached on the device from before this change show none until refreshed.
- Nothing has been run against a real or staging database: run the backfill with `--dry-run` first.

### Verification

- API: 536 unit tests and 77 Mongo integration tests pass (including 12 new integration tests against a real replica set, and 51 new unit tests).
- Web: typecheck and 59 tests pass.
- Rider app: typecheck and 131 tests pass. Driver app: typecheck and 52 tests pass.

---

## 1. Goals and non-goals

**Goals**
1. A trust score exists for **both** riders and drivers and is computed the same way for both.
2. A user is penalised only for things they caused.
3. One bad or one good rating cannot swing a score by tens of points.
4. Score shown in the admin list equals the score shown in the detail view.
5. Old behaviour fades (decay), as D-021 asks.
6. Trust is visible to the other party before a ride, as PRD §5.7 asks, without exposing raw numbers that can be gamed.
7. Every change ships behind a switch, in shadow mode first, with a backfill and a rollback.

**Non-goals**
- Fraud or GPS-spoofing detection (D-022).
- Changing the 7-day double-blind rating rules from D-046.
- A public appeal or dispute UI. This plan only records dispute *outcomes*.

---

## 2. Current state (short)

| Area | Today |
|---|---|
| Calculator | `calculateTrustScore` in `apps/api/src/modules/identity/domain/trustScore.calculator.ts`. Pure function. Score starts at 100. |
| Callers | Only `adminRiders.usecase.ts` (list and detail). Computed per request. |
| Drivers | `trustScore` is `null` at creation (`createDriverProfile.usecase.ts`) and never updated. No driver stats query exists. |
| Stored fields | `trust_score` on rider and driver documents is never written. |
| Ratings | `applyRevealedRating` keeps a running average, rounded to 2 decimals on every update. |
| Cancellations | Ride keeps `cancellation_reason` and `cancelled_at`, but not who cancelled. Actor is only in the `RIDE_CANCELLED` event. |
| Display | Admin web only. Mobile apps show rating only ("New" until 5 ratings). |

Probe results that motivate the work (current code):

| Case | Current result |
|---|---|
| 5 completed, one 1★ rating | **12 POOR** |
| 5 completed, no ratings | **100 EXCELLENT** |
| 4 completed, 40 cancelled | `null`, UNRATED (hidden) |
| 50 completed, 1 dispute, 4.9★ avg | 95 EXCELLENT |

---

## 3. Decisions needed before coding (P0)

These change product behaviour, so they are for you and product to settle. Recommended answer in bold.

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | How should ratings enter the score before 5 exist? | (a) ignore until 5; (b) shrink toward 4.5 using a prior of 5 ratings; (c) keep as is | **(b)** Smooth, no cliff at rating 5, one rating moves the score a few points at most. |
| Q2 | Does an unrated user with 5+ rides get 100? | yes / cap | **Cap at 89 (GOOD) until 5 revealed ratings exist.** EXCELLENT needs verified ratings. |
| Q3 | Do free cancellations before a driver is assigned count? | count / ignore / count only above the daily limit | **Ignore**, unless the daily limit (5) is hit. |
| Q4 | Who is at fault for `FARE_DISAGREEMENT`? | rider / driver / neutral | **Neutral.** It is a negotiation outcome. |
| Q5 | Decay | none / 90-day half-life / hard window | **Half-life of 90 days** on cancellations, no-shows and disputes. Ratings: use all, via shrinkage. |
| Q6 | What do riders and drivers see? | number / tier / nothing | **Tier + rating label** (for example "Trusted · 4.8★ · 120 trips"). Hide the number so it is harder to game. Only when the score is public. |
| Q7 | What counts as a dispute against someone? | any dispute / only resolved against them | **Only disputes resolved against them,** plus unresolved ones older than 14 days at half weight. Needs dispute outcomes (task P1-4). |
| Q8 | Penalty for `PAYMENT_UNPAID` | none / -10 each | **-10 each** for the rider, and exclude those rides from `completedRides`. |

Deliverable P0-1: a new decision record (next free ID after D-046) in `docs/decision-log.md`, plus edits to `docs/prd.md` §5.7, `docs/LLD/domain-model.md` and `docs/LLD/open-questions.md`.

---

## 4. Target scoring model (v2)

Pure function, same for both roles. All inputs come from the stats layer (section P1). Weights below are the starting point; keep them in one config object so they can change without a redeploy of the formula.

```
inputs:
  completedRides              rides with revenue completed and paid (excludes PAYMENT_UNPAID)
  responsibleCancellations    cancellations caused by this user, decayed (see 4.2)
  noShows                     no-shows caused by this user, decayed
  disputesAgainst             disputes resolved against this user, decayed
  unpaidRides                 rider only
  ratingSum, ratingCount      revealed ratings only

effectiveRating = (5 * 4.5 + ratingSum) / (5 + ratingCount)       // prior of 5 ratings at 4.5

score = 100
score -= ratingPenalty:   if effectiveRating < 4.5: round((4.5 - effectiveRating) * 25)
score += eliteBonus:      +5 if ratingCount >= 5 and rawAverage >= 4.8
score -= cancelPenalty:   rate = responsibleCancellations / (completedRides + responsibleCancellations)
                          if rate > 0.05: round((rate - 0.05) * 100)
score -= noShows * 10
score -= disputesAgainst * 15
score -= unpaidRides * 10
score += experience:      +2 at 20 completed, +5 at 50 completed (reduced to half when any dispute is on record)
if ratingCount < 5: score = min(score, 89)            // Q2
if disputesAgainst >= 0.5: score = min(score, 89)    // a recent dispute against you blocks EXCELLENT
clamp to 10..100
tier: >=90 EXCELLENT, >=75 GOOD, >=60 FAIR, else POOR
public only when completedRides >= 5                    // unchanged, D-046
```

### 4.1 Early-account risk flags (replaces silent UNRATED)
Below 5 completed rides the score stays hidden, but the engine also returns `riskFlags` for admins:
- `EARLY_CANCEL_PATTERN`: 3 or more responsible cancellations with fewer than 5 completions.
- `EARLY_UNPAID`: any unpaid ride with fewer than 5 completions.
- `EARLY_DISPUTE`: any dispute against the user with fewer than 5 completions.

### 4.2 Cancellation attribution matrix

Needs `cancelledBy` on the ride (P1-1). `neutral` means it is not counted for either side.

| Reason | Cancelled by rider | Cancelled by driver | Cancelled by system / admin |
|---|---|---|---|
| `RIDER_CHANGED_MIND` | rider | neutral | neutral |
| `RIDER_NO_SHOW` | rider (no-show) | rider (no-show) | neutral |
| `DRIVER_DELAYED` | neutral | driver | neutral |
| `DRIVER_NO_SHOW` | neutral | driver (no-show) | neutral |
| `FARE_DISAGREEMENT` | neutral | neutral | neutral |
| `ADMIN_OVERRIDE` | neutral | neutral | neutral |
| `TIMEOUT_EXPIRED` | neutral | neutral | neutral |

Rules on top: unassigned rider cancellations are neutral unless the daily limit was reached (Q3). A rider cannot self-assign a counterparty reason: validate the allowed reasons per actor in `cancelRide.usecase.ts` (P1-2).

### 4.3 Decay
Each counted event gets weight `0.5 ^ (ageDays / 90)`. The calculator takes already-weighted counts, so it stays pure and easy to test. The stats query does the weighting using `cancelled_at` / event timestamps.

---

## 5. Work plan

Phases are ordered so each one can ship and be reverted on its own. Estimates are dev-days for one engineer and include tests.

### Phase P0: Decisions and docs (0.5 to 1 day)
| Task | Output |
|---|---|
| P0-1 | Decision record amending D-021 / D-046, with the table in section 3 resolved. |
| P0-2 | Update PRD §5.7, LLD domain model and open questions. |

**Exit:** Q1 to Q8 answered in writing.

### Phase P1: Data foundation (3 to 4 days)
Fixes F3, F4, F7 (inputs), F10, F12 (inputs).

| Task | Detail | Files |
|---|---|---|
| P1-1 | Add `cancelledBy` (`RIDER` / `DRIVER` / `SYSTEM` / `ADMIN`) to the ride: entity, mongoose schema, repository mapper, DTO. Set it in `cancelRide.usecase.ts`, `expireOffers.usecase.ts` and the admin cancel path. | `ride.entity.ts`, `ride.model.ts`, `mongoRide.repository.ts`, `cancelRide.usecase.ts`, `expireOffers.usecase.ts`, `packages/contracts/src/rides.ts` |
| P1-2 | Validate reason against actor in the cancel use case using the matrix in 4.2. Reject mismatches with a 400 (`INVALID_CANCELLATION_REASON`). | `cancelRide.usecase.ts`, `cancellationFee.service.ts` |
| P1-3 | **Backfill `cancelledBy`** from the `RIDE_CANCELLED` event's `actorType`. Where no event exists, infer from reason (`RIDER_*` to rider, `DRIVER_*` to driver, `TIMEOUT_EXPIRED` to system, `ADMIN_OVERRIDE` to admin). Idempotent, resumable, batch of 500, dry-run flag. | new `scripts/backfillCancelledBy.ts` |
| P1-4 | **Dispute outcomes.** Check what the event log already records for `PAYMENT_DISPUTED`. If the resolution outcome (in favour of rider or driver) is not stored, add an admin resolution action that records it as an event and on the ride (`disputeResolution`). Until this exists, count disputes at half weight and say so in the breakdown. | admin dispute flow, `ride.entity.ts`, contracts |
| P1-5 | **One stats layer** for riders and drivers: `getTripStats(role, ids[])`. Build the rider identity set as the union of `booker_rider_id` and `passenger.rider_id`, `$unwind`, `$match` on the requested ids, then group by that id. The detail and list views both call it. | `mongoRide.repository.ts`, `ride.port.ts`, `adminRiders.usecase.ts` |
| P1-6 | Add index `{ 'passenger.rider_id': 1, created_at: -1 }`. Confirm with `explain` that the stats query uses indexes. | `ride.model.ts` |
| P1-7 | Store `rating_sum` (integer) next to `rating_count`. Derive the average on read. Replace the read-modify-write retry loop with one atomic `$inc` on both fields. Backfill from `REVEALED` reviews. | `mongoRider.repository.ts`, `mongoDriver.repository.ts`, `rider.model.ts`, `driver.model.ts`, `scripts/backfillRatingSums.ts` |

**Exit tests**
- Unit: matrix in 4.2 with every reason and actor.
- Mongo integration (`apps/api/test/integration/`): stats for a rider who is booker on some rides and passenger on others; list result equals detail result for the same rider (F4).
- Mongo integration: concurrent rating reveals produce the exact expected sum and average (F10).
- Backfill script: run twice, same result.

### Phase P2: Calculator v2 (2 days)
Fixes F2, F5, F7, F8, F9, F13, F14.

| Task | Detail |
|---|---|
| P2-1 | New `calculateTrustScore` per section 4. Keep the old one as `calculateTrustScoreV1` until the cut-over (P5). Config object for weights and half-life. |
| P2-2 | Reject non-finite inputs at the boundary (F13): `ratingAverage` that is `NaN` or out of 1..5 is treated as "no rating" and logged. |
| P2-3 | Return `riskFlags` and a `confidence` field (`PROVISIONAL` below 5 ratings) in `TrustScoreBreakdownDto`. Extend the contracts type. |
| P2-4 | Table-driven tests. Include every probe case from section 2 with the new expected range (section 7). |

**Exit:** all calculator tests green; property test that the score is monotonic: adding a penalty event never raises the score; adding a good rating never lowers it.

### Phase P3: Persist and keep fresh (3 days)
Fixes F12.

| Task | Detail |
|---|---|
| P3-1 | Add `trust_score`, `trust_tier`, `trust_breakdown`, `trust_updated_at` to rider and driver (the score fields exist but are unused; add the rest). |
| P3-2 | New `TrustScoreRefresher` in the identity module: `refresh(role, id)` recomputes from source data (not incrementally, so it is safe to repeat) and writes the fields. Optimistic version check; no-op when the result is unchanged. |
| P3-3 | Call it after: ride settled or cancelled, rating revealed, dispute resolved, payment marked unpaid. Wire through the existing callbacks in `container.ts` (for example `onRideCancelled`) and **after** the transaction commits, so a failure cannot roll back a ride transition. Failures are logged and retried by the sweep. |
| P3-4 | Nightly sweep for decay: recompute accounts with any counted event in the last 365 days; process in batches. Add to `server.ts` beside the existing sweeps. |
| P3-5 | `scripts/backfillTrustScores.ts`: all riders and drivers, resumable, with a dry-run that prints before/after for the largest changes. |

**Exit tests**
- Integration: settle a ride, cancel a ride, reveal a rating, then assert stored fields changed on the right profile.
- Refresher is idempotent (run 3 times, one write).
- A refresher failure does not affect the ride transition.

### Phase P4: Driver score and admin tools (1.5 to 2 days)
Fixes F1.

| Task | Detail |
|---|---|
| P4-1 | Driver stats from the shared stats layer (P1-5): completed, driver-caused cancellations after acceptance, driver no-shows, disputes resolved against the driver, revealed ratings. |
| P4-2 | `adminDriverApplications.usecase.ts` and the driver detail endpoint return the stored breakdown; stop returning `null` for everyone. |
| P4-3 | Admin web: show tier, breakdown factors and `riskFlags` for riders and drivers; sort and filter by score (uses the stored field); keep the existing `TrustScoreBadge`. Files: `DriverDetailsScreen.tsx`, `DriverDetailModal.tsx`, `RidersScreen.tsx`, `RiderDetailModal.tsx`, `endpoints/drivers.ts`. |
| P4-4 | Audit entry when an admin changes something that affects the score (dispute outcome, cancellation override). |

**Exit:** the web shows a real driver score for a seeded driver with 5+ rides; no driver shows "requires 5 trips" once they have them.

### Phase P5: Show trust to the other party (2 days)
Fixes F11. Depends on Q6.

| Task | Detail |
|---|---|
| P5-1 | Add `trustTier` and `trustPublic` to `RideAssignedDriverDto` and to the driver-facing offer DTO for the rider. Fill only when the score is public. No raw number. |
| P5-2 | Rider app: show the tier and rating next to the driver on the booking and ride screens. Driver app: show the rider's tier and rating on the offer card (helps drivers decide). Use the existing "New" label when not public. |
| P5-3 | Update the mobile test stubs that mock the design system (each test needs `createStyles`). |

**Exit:** Realme device check on both apps with a user below and above the public threshold; Play listing screenshots are unaffected.

### Phase P6: Rollout and cut-over (1 day plus observation)
| Step | Action |
|---|---|
| 1 | Deploy P1 (schema and indexes first, then code). Run the `cancelledBy` and rating-sum backfills in dry-run, then for real. |
| 2 | Deploy P2 and P3 with `TRUST_SCORE_V2=shadow`: v1 stays authoritative; v2 is computed and stored in `trust_breakdown`; log a diff (count and biggest deltas) daily. |
| 3 | Review the diff with product for 3 to 7 days. Tune weights in the config object if needed. |
| 4 | Set `TRUST_SCORE_V2=on`. Run the trust backfill. Enable P4 and P5 surfaces. |
| 5 | After 2 stable weeks, delete `calculateTrustScoreV1` and the flag. |

**Rollback:** set the flag back to `shadow`. All new fields are additive, so old code keeps working and no data needs reverting.

---

## 6. Test plan summary

| Level | What |
|---|---|
| Unit | Calculator table (all probe cases plus boundaries 4/5 completed, 4.49/4.5/4.8 average, 0/1/4/5 ratings); decay weights; attribution matrix; NaN input. |
| Property | Monotonicity of penalties and ratings; score always within 10..100; tier boundaries. |
| Mongo integration | Stats parity list vs detail; passenger-only rides; concurrent rating reveals; backfills idempotent; refresher after each trigger. |
| API | Cancel with a reason that does not fit the actor returns 400; admin endpoints return stored breakdown; offers and ride DTOs hide the tier when not public. |
| Web | Badge states: hidden, provisional, each tier; sort by trust. |
| Mobile | Offer card and ride screen with and without a public tier. |

Run `pnpm test` in `apps/api`, `apps/driver-mobile`, `apps/rider-mobile`, then the integration suite against a replica-set Mongo (transactions need it).

---

## 7. Acceptance targets

Expected v2 results for the earlier probe cases (ranges, because weights may be tuned in shadow mode):

| Case | v1 | v2 target |
|---|---|---|
| 5 completed, one 1★ rating | 12 POOR | about 85 GOOD (effective rating 3.92, penalty 15) |
| 5 completed, one 5★ rating | 100 | at most 89 (provisional cap) |
| 5 completed, no ratings | 100 EXCELLENT | at most 89 GOOD |
| 4 completed, 40 responsible cancels | hidden, no signal | hidden, `EARLY_CANCEL_PATTERN` flag |
| 4 completed, 40 cancels caused by drivers or system | hidden | hidden, no flag, no penalty |
| 50 completed, 20 ratings 4.9★, 1 dispute resolved against | 95 EXCELLENT | 89 GOOD (cap), recovers to EXCELLENT as the dispute decays below 0.5 weight, about 90 days |
| 50 completed, 0 issues, 4.9★ | 100 | 100 |
| Driver with 6 completed rides | `null` forever | a real score |

---

## 8. Risks and how they are handled

| Risk | Handling |
|---|---|
| Scores shift for existing users | Shadow mode and the daily diff report before cut-over (P6). |
| Backfilling `cancelledBy` from events is wrong for old rides | Dry-run output reviewed; fall back to reason-based inference; mark inferred rows (`cancelledByInferred: true`). |
| Refresher slows ride transitions | Runs after commit, off the request path, with a sweep as backstop. |
| Stats queries get slow | Index in P1-6; batch size cap of 100 already exists; check `explain` in review. |
| Score becomes a target to game | Show tier only, keep decay, keep weights in config, keep an admin audit trail. |
| Dispute outcomes do not exist yet | P1-4 adds them; until then disputes count at half weight and the breakdown says so. |
| Mobile list screens that mock the design system break | P5-3 updates the stubs. |

---

## 9. Traceability: every finding to a task

| Finding | Summary | Task |
|---|---|---|
| F1 | Driver score never calculated | P3, P4-1, P4-2 |
| F2 | One rating swings the score (12 for one 1★) | P2-1 (shrinkage) |
| F3 | Riders penalised for cancellations they did not cause | P1-1, P1-2, P1-3, 4.2 |
| F4 | List and detail scores can differ | P1-5, P1-6 |
| F5 | Cancel-spammers invisible below 5 completions | 4.1 risk flags |
| F6 | Unpaid and disputed rides counted as completed; disputes counted by current status | P1-4, Q7, Q8, section 4 inputs |
| F7 | Unrated users score 100 | Q2, P2-1 cap |
| F8 | Dispute barely registers for experienced users | P2-1 (experience bonus halved, EXCELLENT blocked while a recent dispute counts) |
| F9 | No decay | Q5, 4.3, P3-4 |
| F10 | Rounding drift in rating average | P1-7 |
| F11 | Trust not shown pre-ride | P5 |
| F12 | Stored score is dead data | P3 |
| F13 | `NaN` rating treated as none | P2-2 |
| F14 | No-shows counted twice (rate and -10) | Keep, document it in the decision record (it is intended: the cancellation and the no-show are different harms) |
| F15 | Tests miss the worst cases | section 6, P2-4 |

---

## 10. Effort and order

| Phase | Days |
|---|---|
| P0 Decisions and docs | 0.5 to 1 |
| P1 Data foundation | 3 to 4 |
| P2 Calculator v2 | 2 |
| P3 Persist and refresh | 3 |
| P4 Driver score and admin | 1.5 to 2 |
| P5 Show to users | 2 |
| P6 Rollout | 1 plus 1 to 2 weeks observation |
| **Total** | **about 13 to 15 dev-days** |

Suggested first slice if time is short: **P0, P1-1 to P1-3, P1-5, P2.** That alone fixes the three worst problems (F2, F3, F4) without touching the apps or adding stored fields.
