# Cabzone — Open Questions & Engineering Decisions

**Document:** `docs/LLD/open-questions.md`
**Status:** Draft for Engineering Review
**Version:** 0.1
**Source:** Cabzone Product Requirements Document v0.1
**Purpose:** Identify unresolved product and engineering decisions that can materially affect the domain model, database schema, algorithms, APIs, security, financial flows, or operational behavior.

---

## 1. Purpose

This document converts ambiguities and unresolved decisions in the Cabzone PRD into explicit engineering questions.

Every question is classified as:

- 🔴 **BLOCKING** — Must be resolved before the affected architecture or core implementation is considered stable.
- 🟡 **PRE-LAUNCH** — Can be implemented with a documented default but must be finalized before production/beta launch.
- 🟢 **DEFERRED** — Can safely remain outside MVP or be finalized after the initial production release.

Each question contains:

1. The unresolved question.
2. Why the decision matters.
3. The current PRD position.
4. Recommended default.
5. Decision required from Product/Business.
6. Architectural impact if the decision changes later.
7. Current implementation status.

> **Engineering rule:** A recommended default is not the same as a product decision. Until explicitly accepted, the default is an implementation assumption and must be recorded in [`decision-log.md`](../decision-log.md) once approved.

---

# 2. Decision Status

| Status             | Meaning                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `OPEN`             | No final decision has been approved.                               |
| `DEFAULT_PROPOSED` | Engineering has proposed a default so implementation can continue. |
| `DECIDED`          | Product/Business has explicitly approved the decision.             |
| `DEFERRED`         | Intentionally postponed beyond the current milestone.              |
| `BLOCKED`          | Implementation cannot safely proceed without the decision.         |

---

# 3. Decision Priority

| ID     | Question                             |      Priority | Affects                  |
| ------ | ------------------------------------ | ------------: | ------------------------ |
| OQ-001 | Vehicle-type pricing                 |    🟢 DECIDED | Pricing, DB, Admin       |
| OQ-002 | Commission calculation               |    🟢 DECIDED | Wallet, Payment          |
| OQ-003 | Buffer-zone configuration            |    🟢 DECIDED | Zone Engine              |
| OQ-004 | Fare negotiation bounds              |    🟢 DECIDED | Fare Engine              |
| OQ-005 | Mid-trip extension workflow          |    🟢 DECIDED | Ride, Fare, Zone         |
| OQ-006 | Ride assignment concurrency          |    🟢 DECIDED | Dispatch                 |
| OQ-007 | Ride expiration behavior             |    🟢 DECIDED | Ride, Dispatch           |
| OQ-008 | Cancellation rules                   |    🟢 DECIDED | Ride, Payment            |
| OQ-009 | Cash-payment confirmation            |    🟢 DECIDED | Payment, Disputes        |
| OQ-010 | Pricing snapshot/versioning          |    🟢 DECIDED | Pricing, Ride            |
| OQ-011 | Interstate pricing model             |    🟢 DECIDED | Zone, Fare               |
| OQ-012 | Driver eligibility rules             |    🟢 DECIDED | Dispatch                 |
| OQ-013 | KYC re-verification behavior         | 🟡 PRE-LAUNCH | Driver, KYC              |
| OQ-014 | KYC rejection/reapplication rules    | 🟡 PRE-LAUNCH | Driver, KYC              |
| OQ-015 | Driver/admin review SLA              | 🟡 PRE-LAUNCH | Operations               |
| OQ-016 | Driver location frequency            | 🟡 PRE-LAUNCH | Realtime, Infrastructure |
| OQ-017 | GPS spoofing enforcement             | 🟡 PRE-LAUNCH | Fraud                    |
| OQ-018 | Trust-score formula                  | 🟡 PRE-LAUNCH | Trust, UX                |
| OQ-019 | Review visibility/timing             | 🟡 PRE-LAUNCH | Reviews                  |
| OQ-020 | Ride-for-someone-else accountability | 🟡 PRE-LAUNCH | Rider, Safety            |
| OQ-021 | Vehicle/document data model          | 🟡 PRE-LAUNCH | Driver                   |
| OQ-022 | Toll/permit handling                 | 🟡 PRE-LAUNCH | Interstate               |
| OQ-023 | Wallet top-up methods                | 🟡 PRE-LAUNCH | Wallet                   |
| OQ-024 | Payment reconciliation               | 🟡 PRE-LAUNCH | Finance                  |
| OQ-025 | City/admin permission scope          | 🟡 PRE-LAUNCH | Admin                    |
| OQ-026 | Document retention                   | 🟡 PRE-LAUNCH | KYC, Security            |
| OQ-027 | Phone-number recycling               | 🟡 PRE-LAUNCH | Auth                     |
| OQ-028 | Cancellation/no-show fees            | 🟡 PRE-LAUNCH | Ride, Payment            |
| OQ-029 | SOS workflow                         |   🟢 DEFERRED | Safety                   |
| OQ-030 | Scheduled rides                      |   🟢 DEFERRED | Product                  |
| OQ-031 | Multi-stop rides                     |   🟢 DEFERRED | Product                  |
| OQ-032 | Ride pooling                         |   🟢 DEFERRED | Product                  |
| OQ-033 | Corporate accounts                   |   🟢 DEFERRED | Product                  |
| OQ-034 | Promotions/referrals                 |   🟢 DEFERRED | Growth                   |

---

# 4. 🔴 BLOCKING Decisions

## OQ-001 — Does pricing vary by vehicle type?

**Status:** `DECIDED`  
**Priority:** 🟢 RESOLVED (formerly 🔴 BLOCKING)  
**Decision Reference:** [`decision-log.md`](../decision-log.md#d-025--vehicle-category-pricing--initial-fleet-types) (D-025)

### Question

Should an auto/e-rickshaw, sedan, SUV, or other vehicle category have different:

- Base fare?
- Rate per kilometre?
- Minimum fare?
- Included kilometres?
- Buffer surcharge?
- Negotiation limits?

### Approved Decision

**YES.** Independent vehicle category pricing is approved. Each vehicle category has its own distinct pricing configuration within a city zone:

- Base fare (`base_fare_paise`)
- Rate per kilometre (`rate_per_km_paise`)
- Minimum fare (`minimum_fare_paise`)
- Included distance (`included_distance_m`)
- Buffer surcharge (`buffer_surcharge_paise`)
- Negotiation floor percentage and ceiling percentage

### Initial Launch Fleet Categories

1. **`CAB`**: Standard 4-wheeler cab/car. **Active now** at launch.
2. **`E_RICKSHAW`**: Electric rickshaw. **Supported in data model & architecture, marked `[coming soon]`** (staged for future operational rollout).

### Architecture & Extensibility

Pricing configuration keys by `(city_zone_id, vehicle_category)`. Future vehicle types (e.g. `SEDAN`, `SUV`, `AUTO`) can be added dynamically via Admin configuration without requiring database migrations or fare engine code rewrites. Driver dispatch candidate search filters strictly by the requested vehicle category.

### Why

Cabzone serves both cabs and electric rickshaws in its operating regions. Their capital, fuel/charging, and distance economics differ significantly. Deciding this now establishes clean `(city_zone, vehicle_category)` schemas across pricing, rides, dispatch, and mobile contracts.

---

# OQ-002 — How is driver commission calculated?

**Status:** `DECIDED`  
**Priority:** 🟢 RESOLVED (formerly 🔴 BLOCKING)  
**Decision Reference:** [`decision-log.md`](../decision-log.md#d-026--driver-commission-calculation-percentage-of-agreed-fare) (D-026)

### Question

Is Cabzone commission:

1. A percentage of Agreed Fare?
2. A fixed amount per ride?
3. A percentage with a minimum/maximum?
4. Different by city/vehicle/ride type?

### Approved Decision

**Option 1: A percentage of Agreed Fare.**

```text
Commission (Paise) = ROUND(Agreed Fare Paise × (Commission Percentage / 100))
```

Key rules:

- **Integer paise**: Calculated and stored strictly in integer paise.
- **Pricing Snapshot**: Captured in the ride's pricing snapshot when the ride is created; historical rides never recalculate if admin commission rates are modified later.
- **Prepaid Wallet Debit**: Commission is debited from the driver's prepaid wallet upon ride settlement (`PAYMENT_CONFIRMED`). Zero or negative balance prevents accepting new ride offers but never interrupts active rides.

---

# OQ-003 — What is the buffer-zone distance?

**Status:** `DECIDED`  
**Priority:** 🟢 RESOLVED (formerly 🔴 BLOCKING)  
**Decision Reference:** [`decision-log.md`](../decision-log.md#d-027--buffer-zone-distance-city-override-with-global-default) (D-027)

### Question

What distance constitutes the fallback "in-city" trip when pickup is outside every city polygon?

### Approved Decision

**Configurable per city zone, with a global default fallback.**

```text
effective_buffer_distance_m = city_zone.buffer_distance_m ?? global_settings.default_buffer_distance_m
```

Key rules:

- **Trip Distance Basis**: Evaluated based on pickup-to-drop trip distance (`trip_distance_m <= effective_buffer_distance_m`), **not** pickup-to-city-center.
- **Nearest City Rates**: Evaluates against the nearest active city zone polygon to the pickup location.
- **Buffer Surcharge**: Applies the configured `buffer_surcharge_paise` associated with the nearest city zone and vehicle category.

---

# OQ-004 — What are the exact fare negotiation limits?

**Status:** `DECIDED`  
**Priority:** 🟢 RESOLVED (formerly 🔴 BLOCKING)  
**Decision Reference:** [`decision-log.md`](../decision-log.md#d-028--fare-negotiation-bounds-floor--ceiling) (D-028)

### Question

What are the minimum and maximum Rider Proposed Fare values?

### Approved Decision

**Bounded floor and ceiling based on Suggested Fare and Minimum Fare:**

```text
Floor:
negotiation_floor_paise = MAX(
    minimum_fare_paise,
    ROUND(suggested_fare_paise × (negotiation_floor_percent / 100))
)
Default floor percentage: 80%

Ceiling:
negotiation_ceiling_paise = ROUND(suggested_fare_paise × (negotiation_ceiling_percent / 100))
Default ceiling percentage: 150%

Negotiation Window:
Default: 90 seconds
```

Key rules:

- Strictly validated on the server. Proposals outside bounds return `422 FARE_OUTSIDE_NEGOTIATION_LIMIT`.
- Captured in the pricing configuration per city and vehicle category, and frozen in the ride pricing snapshot.

---

# OQ-005 — What exactly happens during a mid-trip extension?

**Status:** `DECIDED`  
**Priority:** 🟢 RESOLVED (formerly 🔴 BLOCKING)  
**Decision Reference:** [`decision-log.md`](../decision-log.md#d-029--mid-trip-extension-workflow) (D-029)

### Approved Decision

The **recommended default workflow** is approved:

```text
TRIP_STARTED
     ↓
Rider requests extension to new destination in-app
     ↓
Routing engine recalculates route distance
     ↓
Zone classification re-run (in-city / outstation / interstate)
     ↓
Added fare calculated using captured pricing snapshot
     ↓
Driver receives in-app extension prompt
     ↓
[DRIVER CONFIRMS] ─── YES ──→ Extension accepted, added fare committed, RIDE_EXTENDED emitted
     │
     └─── NO ───────────────→ Extension rejected, original agreed fare and destination remain binding
```

Key rules:

- Rider can request another extension after a prior request is completed or rejected.
- Recalculation applies the frozen pricing snapshot of the active ride.

---

# OQ-006 — What mechanism guarantees only one driver gets a ride?

**Status:** `DECIDED`  
**Priority:** 🟢 RESOLVED (formerly 🔴 BLOCKING)  
**Decision Reference:** [`decision-log.md`](../decision-log.md#d-030--atomic-database-concurrency-for-ride-assignment) (D-030)

### Approved Decision

Authoritative ride assignment is executed as an **atomic single-document state transition** in MongoDB (supported by multi-document transactions with replica set `rs0`):

```text
UPDATE ride
SET driver_id = :driverId,
    status = 'DRIVER_ASSIGNED',
    assigned_at = NOW(),
    version = version + 1
WHERE id = :rideId
  AND status = 'OFFERING'
  AND driver_id IS NULL
```

Key rules:

- Exactly one driver acceptance query succeeds.
- Any concurrent acceptance request matching `status = 'OFFERING'` fails immediately with `409 RIDE_ALREADY_ASSIGNED`.
- Redis coordinates realtime notifications and cancels pending offers across other handsets, but MongoDB remains the single source of truth.

---

# OQ-007 — What happens when the ride offer expires?

**Status:** `DECIDED`  
**Priority:** 🟢 RESOLVED (formerly 🔴 BLOCKING)  
**Decision Reference:** [`decision-log.md`](../decision-log.md#d-031--ride-expiration--immutable-offer-history) (D-031)

### Approved Decision

When the negotiation/dispatch window (default 90 seconds) expires without driver acceptance:

```text
OFFERING ─── timeout ──→ EXPIRED
```

Key rules:

- The rider receives an explicit notification: "No driver accepted the current offer."
- The rider can submit a new offer or adjust proposed fare.
- Historical proposal and negotiation records are append-only; old offers are never silently mutated.
- Expired rides remain visible in ride history.

---

# OQ-008 — What is the cancellation policy?

**Status:** `DECIDED`  
**Priority:** 🟢 RESOLVED (formerly 🔴 BLOCKING)  
**Decision Reference:** [`decision-log.md`](../decision-log.md#d-032--state-based-cancellation--no-show-policy) (D-032)

### Approved Decision

State-based cancellation policy approved:

```text
REQUESTED / OFFERING
→ Free cancellation for rider (zero fee)

DRIVER_ASSIGNED / DRIVER_EN_ROUTE
→ Free within 2-minute grace period; cancellation after grace period incurs cancellation fee

DRIVER_ARRIVED
→ Driver waits minimum 5 minutes; if passenger absent, driver triggers NO_SHOW with cancellation fee

TRIP_STARTED
→ Cannot be unilaterally cancelled; early drop-off becomes trip termination / dispute flow
```

Key rules:

- Incurred cancellation fees are split: compensation to the driver for fuel/time, remainder to platform.

---

# OQ-009 — How is cash payment confirmed?

**Status:** `DECIDED`  
**Priority:** 🟢 RESOLVED (formerly 🔴 BLOCKING)  
**Decision Reference:** [`decision-log.md`](../decision-log.md#d-033--cash-payment-confirmation--dispute-workflow) (D-033)

### Approved Decision

Driver confirmation workflow with rider dispute protection:

```text
PAYMENT_PENDING
     ↓
Driver marks physical cash received (DRIVER_MARKS_CASH_RECEIVED)
     ↓
PAYMENT_CONFIRMED
     ↓
RIDE_SETTLED (Platform commission debited from driver prepaid wallet)
```

Key rules:

- The rider sees payment confirmation in real time.
- If disputed (e.g. overcharge, disputed collection), rider can tap "Dispute Payment", transitioning the ride to `PAYMENT_DISPUTED` and creating an audit `Dispute` ticket for admin review.

---

# OQ-010 — How are pricing configurations versioned?

**Status:** `DECIDED`  
**Priority:** 🟢 RESOLVED (formerly 🔴 BLOCKING)  
**Decision Reference:** [`decision-log.md`](../decision-log.md#d-034--immutable-pricing--zone-snapshots) (D-034)

### Approved Decision

Every ride stores an **immutable pricing and zone snapshot** captured at ride-request creation:

```text
pricing_config_id
pricing_config_version
pricing_snapshot (base fare, rate/km, min fare, included km, buffer surcharge, floor/ceil %, commission %)
zone_classification_snapshot (zone type, city zone id, state segments)
```

Key rules:

- Live lookups against mutable database configuration are strictly prohibited for existing rides.
- Admin updates increment `version` and create a new configuration; historical rides retain their frozen snapshot.

---

# OQ-011 — How should interstate pricing work operationally?

**Status:** `DECIDED`  
**Priority:** 🟢 RESOLVED (formerly 🔴 BLOCKING)  
**Decision Reference:** [`decision-log.md`](../decision-log.md#d-035--interstate-route-segmentation-pricing-model) (D-035)

### Approved Decision

Route polyline state boundary segmentation approved:

```text
Route Polyline
      ↓
Spatial intersection with state boundary polygons
      ↓
Sequential state segments: [(State_1, dist_1), (State_2, dist_2), ...]
      ↓
segment_fare = segment_distance × state_rate (from state_pricing)
      ↓
Total interstate fare = SUM(segment_fares) + base_fare + tolls/permits
```

Key rules:

- The state segment breakdown is recorded in the ride snapshot and displayed transparently to both parties.

---

# OQ-012 — What makes a driver eligible for dispatch?

**Status:** `DECIDED`  
**Priority:** 🟢 RESOLVED (formerly 🔴 BLOCKING)  
**Decision Reference:** [`decision-log.md`](../decision-log.md#d-036--driver-dispatch-eligibility-10-point-criteria) (D-036)

### Approved Decision

A driver must satisfy all **10 eligibility conditions** simultaneously to receive ride offers:

```text
1. ACTIVE account status
2. KYC status APPROVED
3. Vehicle status APPROVED
4. Mandatory documents valid and unexpired (expires_at > NOW())
5. Prepaid wallet balance > 0
6. ONLINE (on duty)
7. Recent location ping in Redis (< 2 minutes freshness)
8. Vehicle category strictly matches requested category (CAB vs E_RICKSHAW, per D-025)
9. Not already assigned to another active ride (assigned_ride_id === null)
10. Not SUSPENDED or under fraud lockout
```

---

# 5. 🟡 PRE-LAUNCH Decisions

## OQ-013 — KYC re-verification

**Status:** `OPEN`
**Priority:** 🟡 PRE-LAUNCH

The PRD identifies document expiry and recommends flagging documents before expiry and suspending the driver after expiry.

### Recommended default

```text
30 days before expiry → warning
expiry → driver suspended
renewal → KYC verification
approval → driver reactivated
```

---

## OQ-014 — Reapplication policy after KYC rejection

**Status:** `OPEN`
**Priority:** 🟡 PRE-LAUNCH

The PRD distinguishes fixable rejection from fraud/hard rejection and proposes a maximum reapplication count/cooldown.

### Recommended default

```text
FIXABLE
→ allow correction
→ re-verification

HARD/FRAUD
→ permanently block identity
```

For ambiguous failures:

```text
maximum attempts = 3
cooldown = configurable
```

Exact values require product approval.

---

## OQ-015 — Driver application review SLA

**Status:** `OPEN`
**Priority:** 🟡 PRE-LAUNCH

### Question

How quickly must an administrator review a driver application?

### Recommended default

Define an operational target before pilot launch.

The exact SLA is intentionally unresolved in the PRD.

---

## OQ-016 — Driver location update frequency

**Status:** `OPEN`
**Priority:** 🟡 PRE-LAUNCH

### Question

How frequently should the driver app transmit location?

### Recommended default

Use adaptive location updates:

```text
offline       → no updates
online/idle   → low frequency
en route      → medium frequency
active trip   → higher frequency
```

Exact interval must be determined through battery/network testing.

---

## OQ-017 — GPS spoofing enforcement

**Status:** `OPEN`
**Priority:** 🟡 PRE-LAUNCH

The PRD recommends mock-location detection and detection of physically implausible GPS jumps.

### Recommended default

Initially:

```text
detect
→ flag
→ preserve evidence
→ do not automatically permanently ban
```

Admin/fraud review determines enforcement.

---

## OQ-018 — Trust-score formula

**Status:** `OPEN`
**Priority:** 🟡 PRE-LAUNCH

The PRD proposes incorporating:

- verified ride count
- rating
- cancellation rate
- complaints/disputes
- recency/decay

and recommends hiding the score until a minimum ride threshold exists.

### Recommended default

Start with a deterministic formula rather than ML.

Document the exact formula before exposing the score publicly.

---

## OQ-019 — Review visibility

**Status:** `OPEN`
**Priority:** 🟡 PRE-LAUNCH

The PRD recommends blind/double-blind reviews to reduce retaliation.

### Recommended default

Neither side sees the other's rating until:

```text
both submit
OR
review window expires
```

---

## OQ-020 — Ride for someone else

**Status:** `OPEN`
**Priority:** 🟡 PRE-LAUNCH

The PRD identifies Booker A / Passenger B accountability as a specific problem.

### Recommended default

Store separately:

```text
booker_id
passenger_name
passenger_phone
```

Generate a pickup OTP for the actual passenger.

Both booker and passenger receive ride tracking.

---

## OQ-021 — Vehicle data model

**Status:** `OPEN`
**Priority:** 🟡 PRE-LAUNCH

### Question

What vehicle attributes are required?

### Recommended default

At minimum:

```text
vehicle_id
driver_id
vehicle_type
make
model
registration_number
color
manufacture_year
verification_status
```

If vehicle documents are required, model them separately from driver documents.

---

## OQ-022 — Tolls and permits

**Status:** `OPEN`
**Priority:** 🟡 PRE-LAUNCH

The PRD recommends showing tolls/permit charges separately rather than hiding them inside per-km rates.

### Recommended default

Represent separately:

```text
base fare
distance fare
toll charges
permit charges
other approved charges
```

Do not silently include tolls inside `rate_per_km`.

---

## OQ-023 — Wallet top-up methods

**Status:** `OPEN`
**Priority:** 🟡 PRE-LAUNCH

### Question

Which wallet top-up mechanisms are supported?

### Recommended default

Support one digital payment provider initially.

All top-ups must create immutable wallet ledger transactions.

---

## OQ-024 — Payment reconciliation

**Status:** `OPEN`
**Priority:** 🟡 PRE-LAUNCH

### Question

How are payment-provider events reconciled against Cabzone's internal payment state?

### Recommended default

Every external payment operation must have:

```text
internal_payment_id
provider_payment_id
provider_status
amount_paise
currency
raw_reference
created_at
updated_at
```

Provider callbacks must be idempotent.

---

## OQ-025 — Admin permission scope

**Status:** `OPEN`
**Priority:** 🟡 PRE-LAUNCH

The PRD explicitly identifies the need for separate administrative roles.

### Recommended default

```text
SUPER_ADMIN
CITY_ADMIN
SUPPORT_ADMIN
FINANCE_ADMIN
```

At minimum:

```text
SUPER_ADMIN
→ global access

CITY_ADMIN
→ assigned city only
```

Every sensitive mutation creates an audit log.

---

## OQ-026 — Government-document retention

**Status:** `OPEN`
**Priority:** 🟡 PRE-LAUNCH

The PRD identifies document encryption, access control, retention/deletion, and consent as requirements that need to be defined.

### Recommended default

Before production:

- define retention period
- restrict document access
- encrypt storage
- audit document access
- define deletion/anonymization workflow
- define consent capture

Exact retention requirements require product/legal review.

---

## OQ-027 — Phone-number recycling

**Status:** `OPEN`
**Priority:** 🟡 PRE-LAUNCH

The PRD identifies recycled phone numbers as a potential identity problem and recommends OTP on every new-device login.

### Recommended default

Use:

```text
OTP verification
+
device/session management
+
session revocation
```

Treat a newly verified phone number as an authentication event, not proof that the historical account owner is unchanged.

---

## OQ-028 — Cancellation and no-show fee values

**Status:** `OPEN`
**Priority:** 🟡 PRE-LAUNCH

The PRD identifies cancellation/no-show handling as missing.

### Recommended default

Make cancellation rules configurable by:

```text
ride state
city
vehicle type
```

Do not hard-code fee values into the application.

---

# 6. 🟢 DEFERRED Decisions

## OQ-029 — SOS / Emergency workflow

**Status:** `DEFERRED`
**Priority:** 🟢 POST-LAUNCH

The PRD recommends SOS functionality and emergency-contact/live-location sharing as an additional capability.

### Recommended default

Design an extension point in the ride model but keep the complete emergency workflow outside the initial MVP unless safety requirements make it mandatory before launch.

---

## OQ-030 — Scheduled rides

**Status:** `DEFERRED`

Explicitly listed as a non-MVP feature.

Do not implement in the initial ride state machine.

---

## OQ-031 — Multi-stop rides

**Status:** `DEFERRED`

Explicitly listed as a non-MVP feature.

---

## OQ-032 — Ride pooling

**Status:** `DEFERRED`

Explicitly listed as a non-MVP feature.

---

## OQ-033 — Corporate accounts

**Status:** `DEFERRED`

Explicitly listed as a non-MVP feature.

---

## OQ-034 — Promotions and referrals

**Status:** `DEFERRED`

The PRD identifies promotions/referrals as a future growth capability rather than an MVP requirement.

---

# 7. Engineering Defaults That Apply Unless Overridden

The following defaults should be treated as engineering conventions rather than unresolved product questions.

## 7.1 Money

All monetary values must be stored as integer paise.

```text
₹125.50
↓
12550 paise
```

Never use floating-point values for financial state.

---

## 7.2 Distance

Use metres internally where precision matters.

```text
distance_m: integer
```

Convert to kilometres only for presentation or explicitly defined pricing calculations.

---

## 7.3 Coordinates

API/application representation:

```json
{
  "lat": 26.7271,
  "lng": 88.3953
}
```

GeoJSON/database representation:

```json
{
  "type": "Point",
  "coordinates": [88.3953, 26.7271]
}
```

The conversion boundary must be explicit.

---

## 7.4 Time

Persist timestamps in UTC.

Render timestamps in the user's/business timezone.

---

## 7.5 Idempotency

State-mutating requests that can safely be retried must support idempotency.

Examples:

```text
Create ride
Accept ride
Cancel ride
Start ride
Complete ride
Cash payment confirmation
Wallet top-up
```

---

## 7.6 Immutable Ride Events

Important ride transitions should produce append-only events.

Example:

```text
RIDE_CREATED
RIDE_OFFERED
DRIVER_ACCEPTED
DRIVER_ASSIGNED
DRIVER_ARRIVED
TRIP_STARTED
FARE_EXTENSION_REQUESTED
FARE_EXTENSION_ACCEPTED
TRIP_COMPLETED
PAYMENT_CONFIRMED
RIDE_SETTLED
```

Events must not be rewritten to alter historical behavior.

---

# 8. Questions That Must Not Be Solved Implicitly in Code

The following must never be decided by an individual developer while implementing a feature:

```text
1. Fare limits
2. Commission calculation
3. Vehicle pricing
4. Cancellation fees
5. Wallet eligibility
6. Driver acceptance rules
7. KYC rejection rules
8. Trust-score calculation
9. Review visibility
10. Interstate pricing
11. Toll/permit treatment
12. Admin permissions
13. Document retention
14. Ride-for-someone-else liability
```

If a developer needs to make one of these decisions to continue implementation, the decision must be:

```text
documented
→ approved
→ added to [`decision-log.md`](../decision-log.md)
→ reflected in affected LLD documents
```

---

# 9. Decision Propagation Rule

A decision must propagate to every affected document.

Example:

```text
Vehicle-specific pricing approved
          │
          ├── decision-log.md
          ├── domain-model.md
          ├── database-schema.md
          ├── fare-engine.md
          ├── dispatch-engine.md
          ├── api-contracts.md
          └── admin requirements
```

Do not update only one document.

---

# 10. Approval Gate Before Implementation

Engineering should not consider the architecture ready for implementation until all 🔴 BLOCKING questions have one of these statuses:

```text
DECIDED
```

or

```text
DEFAULT_PROPOSED + explicitly accepted by Product/Engineering
```

Minimum gate:

```text
[x] OQ-001 Vehicle pricing (Decided: YES, CAB active, E_RICKSHAW coming soon, D-025)
[x] OQ-002 Commission (Decided: Percentage of Agreed Fare, D-026)
[x] OQ-003 Buffer zone (Decided: Configurable per city with global default, D-027)
[x] OQ-004 Negotiation limits (Decided: Floor MAX(min fare, 80%), Ceiling 150%, D-028)
[x] OQ-005 Mid-trip extension (Decided: In-app recalculation + driver confirmation, D-029)
[x] OQ-006 Assignment concurrency (Decided: Atomic DB state transition in MongoDB, D-030)
[x] OQ-007 Ride expiry (Decided: 90s timeout to EXPIRED, immutable history, D-031)
[x] OQ-008 Cancellation (Decided: State-based fee schedule & 5m no-show wait, D-032)
[x] OQ-009 Cash payment (Decided: Driver marks received + rider dispute flow, D-033)
[x] OQ-010 Pricing versioning (Decided: Immutable ride pricing snapshot at creation, D-034)
[x] OQ-011 Interstate pricing (Decided: Route polyline state boundary segmentation, D-035)
[x] OQ-012 Driver eligibility (Decided: 10-point simultaneous eligibility check, D-036)
```

Only after this gate should the following documents be treated as architecture-ready:

- [`domain-model.md`](domain-model.md)
- [`database-schema.md`](database-schema.md)
- [`ride-lifecycle.md`](ride-lifecycle.md)
- [`fare-engine.md`](fare-engine.md)
- [`zone-engine.md`](zone-engine.md)
- [`dispatch-engine.md`](dispatch-engine.md)
- [`api-contracts.md`](api-contracts.md)

---

# 11. Decision Log Requirement

Every resolved question must be copied into [`docs/decision-log.md`](../decision-log.md) with:

```text
Decision ID
Date
Question
Decision
Alternatives considered
Reason
Affected components
Migration/reversal strategy
Approved by
```

This keeps the LLD documents focused on the resulting design while the decision log preserves why the design exists.

---

# 12. Current Recommendation

Before writing application code, resolve these decisions in this order:

```text
1. Vehicle pricing
        ↓
2. Commission model
        ↓
3. Buffer-zone model
        ↓
4. Negotiation limits
        ↓
5. Ride lifecycle + cancellation
        ↓
6. Mid-trip extension
        ↓
7. Interstate pricing
        ↓
8. Driver eligibility
        ↓
9. Dispatch concurrency
        ↓
10. Payment + cash confirmation
```

These decisions form the dependency chain for the core Cabzone architecture.

Once they are resolved, the engineering team can freeze the domain model and database schema and proceed to the detailed LLD documents.
