# cabzone — Decision Log

**Source:** cabzone PRD v0.1  
**Purpose:** Record product decisions explicitly present in the PRD and keep unresolved decisions visible.

> This is a product decision log, not an engineering architecture decision log. Technical choices such as MongoDB, Redis, WebSocket implementation, framework selection, deployment topology, UUID strategy, and exact API schemas are not asserted here because they are not specified by the PRD.

---

## Decision Format

- **Status:** Decided / Proposed Fix / Open
- **Source:** Section of the PRD
- **Decision:** What the PRD says
- **Notes:** Constraints or unresolved details

---

## D-001 — Three-Application Product

**Status:** Decided  
**Source:** §1 Product Overview

cabzone consists of:

- Rider Mobile App
- Driver Mobile App
- Admin Web Dashboard

---

## D-002 — Negotiable Fare Model

**Status:** Decided  
**Source:** §1, §4.3, §5

The rider can accept the Suggested Fare or submit a Rider Proposed Fare. A driver's acceptance establishes the Agreed Fare.

---

## D-003 — Three Fare Concepts

**Status:** Decided  
**Source:** §5.2

The product distinguishes:

1. Suggested Fare
2. Rider Proposed Fare
3. Agreed Fare

---

## D-004 — Route-Based Fare Calculation

**Status:** Decided  
**Source:** §5

Route distance comes from a routing engine rather than straight-line distance.

Formula:

```text
Raw Fare = Base Fare + (Route Distance × Rate/km)
Fare = MAX(Raw Fare, Minimum Fare)
Suggested Fare = ROUND(Fare)
```

---

## D-005 — Freeze Fare Inputs at Ride Request

**Status:** Decided  
**Source:** §5.1, §6.5, L9

Pricing and zone classification must be frozen at ride-request time so later admin changes do not retroactively change an agreed/in-progress ride.

---

## D-006 — Polygon-First Zone Classification

**Status:** Decided  
**Source:** §6, L7

Classification uses one ordered rule:

1. Pickup inside city polygon → In-City.
2. Otherwise, if pickup-to-drop trip distance is within the global buffer → In-City using nearest city rates.
3. Otherwise → Outstation.
4. State route segmentation is applied for interstate pricing.

---

## D-007 — Interstate Route Segmentation

**Status:** Decided  
**Source:** §4.5, §6

When a trip crosses state boundaries, route distance is divided by state and each state segment is priced using its state-specific per-km rate.

The PRD also calls for transparent state-by-state fare breakdown.

---

## D-008 — Driver Wallet Gate

**Status:** Decided  
**Source:** §4.6, L12

A driver with wallet balance `<= 0` cannot accept a **new** ride.

A zero balance must not interrupt an active ride.

---

## D-009 — Payment Methods

**Status:** Decided  
**Source:** §4.4, §4.6

Rider payment methods are:

- UPI
- Cash

Cash requires a defined confirmation/dispute mechanism according to L11.

---

## D-010 — Driver Verification

**Status:** Decided  
**Source:** §4.1

Driver verification uses government ID + Driving License and a third-party KYC provider such as Cashfree or Surepass, followed by admin review.

---

## D-011 — Application Rejection Requires Reason

**Status:** Decided  
**Source:** §4.1

Admin rejection must include a reason, and the driver can edit and reapply.

The PRD further proposes distinguishing fixable and hard/fraud rejection.

---

## D-012 — Ride-for-Someone-Else Accountability

**Status:** Proposed Fix  
**Source:** L4

The PRD proposes:

- Booker billed by default.
- Actual passenger receives a pickup OTP.
- Booker and actual passenger receive ride tracking/safety notifications.

---

## D-013 — Negotiation Bounds

**Status:** Open  
**Source:** §5.3

The PRD requires a floor, ceiling, and negotiation time window but gives only examples:

- Around 80% of Suggested Fare as a possible floor.
- Around 150% as a possible ceiling.
- Around 90 seconds as a possible window.

These values are not final decisions.

---

## D-014 — Buffer-Zone Distance

**Status:** Open  
**Source:** §6, Open Question 2

The PRD uses an example of 20 km but explicitly asks for the actual value and whether it should be global or city-configurable.

---

## D-015 — Vehicle-Based Pricing

**Status:** Open  
**Source:** Open Question 3

The PRD asks whether auto/sedan/SUV should have different pricing or whether Rate/km is uniform per city.

---

## D-016 — Commission Model

**Status:** Open  
**Source:** Open Question 5

The PRD asks whether commission should be:

- Flat fee per ride, or
- Percentage of Agreed Fare.

No final value is specified.

---

## D-017 — Admin Role Split

**Status:** Proposed Fix  
**Source:** L16

The PRD proposes role-based administration, including:

- Super Admin for global configuration and driver-verification policy.
- City Admin for zone/pricing management for assigned cities.

Every pricing/zone change should have an audit trail.

---

## D-018 — Document Security

**Status:** Proposed Fix  
**Source:** L18

Government ID and Driving License data should be encrypted at rest, access-restricted, retained according to a defined policy, and uploaded with explicit consent.

---

## D-019 — Cancellation / No-Show

**Status:** Open / Proposed Fix  
**Source:** L17

The PRD says cancellation and no-show behavior needs to be defined, and proposes a small cancellation fee and a driver wait period before no-show cancellation.

Exact fee, timing, and conditions remain open.

---

## D-020 — Review Visibility

**Status:** Proposed Fix  
**Source:** L13

The PRD proposes blind/double-blind reviews so one party does not see the other's rating until both submit or a timeout occurs.

---

## D-021 — Trust Score

**Status:** Proposed Fix  
**Source:** L14

The PRD proposes a trust score based on:

- Verified rides
- Average rating, with recency weighting
- Cancellation rate
- Complaint/dispute history

It also proposes a minimum ride-count threshold and decay of old data.

The exact formula is not defined.

---

## D-022 — GPS Spoofing Detection

**Status:** Proposed Fix  
**Source:** L15

The PRD proposes basic mock-location detection and flagging physically implausible GPS jumps.

---

## D-023 — MVP Non-Goals

**Status:** Decided  
**Source:** §2

Do not implement ride pooling, scheduled bookings, corporate accounts, or multi-stop rides in MVP.

---

## D-024 — Mid-Trip Extension

**Status:** Requirement; detailed flow needs engineering review  
**Source:** §5.1.1

Extension must be requested in-app, show added fare to both sides, require driver confirmation, and rerun zone/state classification when the extension crosses boundaries.

---

## D-025 — Vehicle Category Pricing & Initial Fleet Types

**Decision ID:** D-025  
**Date:** 2026-09-24  
**Question:** OQ-001 (Vehicle-type pricing)  
**Status:** Decided

**Decision:**
YES. Pricing varies independently by vehicle category. Each category has independent:

- Base fare (`base_fare_paise`)
- Rate per kilometre (`rate_per_km_paise`)
- Minimum fare (`minimum_fare_paise`)
- Included distance (`included_distance_m`)
- Buffer surcharge (`buffer_surcharge_paise`)
- Negotiation limits (floor % and ceiling %)

**Initial Fleet Categories:**
Two vehicle categories are defined at launch:

1. `CAB`: Active now (standard 4-wheeler cab/car).
2. `E_RICKSHAW`: Supported in data model and architecture, marked `[coming soon]` (staged for future activation).

**Extensibility:**
The pricing schema keys by `(city_zone_id, vehicle_category)`. Adding future categories (e.g. `AUTO`, `SEDAN`, `SUV`) is purely a configuration action without requiring database migrations or fare engine rewrites.

**Alternatives Considered:** Uniform city-wide rate (rejected because operating economics of cabs and electric rickshaws are vastly different).  
**Reason:** Matches operational economics in target markets (e.g. Siliguri) and provides architectural readiness for e-rickshaws.  
**Affected Components:** `CityZone`, `PricingConfig`, Fare Engine, Dispatch Matching, Ride Snapshot, Admin Pricing UI, API Contracts (`@cabzone/contracts`).  
**Approved by:** Product & Engineering (via OQ-001)

---

## D-026 — Driver Commission Calculation (Percentage of Agreed Fare)

**Decision ID:** D-026  
**Date:** 2026-09-24  
**Question:** OQ-002 (Driver commission calculation)  
**Status:** Decided

**Decision:**
cabzone commission is calculated as a **percentage of the Agreed Fare**:

```text
Commission (Paise) = ROUND(Agreed Fare Paise × (Commission Percentage / 100))
```

**Key Architectural Rules:**

1. **Integer Arithmetic**: All calculations operate in integer paise to eliminate floating-point drift.
2. **Snapshot Immutability**: The applicable commission percentage is captured in the ride's pricing snapshot when the ride is created. Subsequent changes to admin commission settings never recalculate completed or active rides.
3. **Wallet Debit Timing**: Commission is debited from the driver's prepaid wallet upon ride settlement (`PAYMENT_CONFIRMED`). A zero or negative wallet balance never halts or interrupts an active ride, but blocks the driver from receiving new ride offers once the current trip concludes.

**Alternatives Considered:** Fixed flat fee per ride (rejected because it disproportionately penalizes short in-city rides vs long outstation rides), hybrid model with caps (deferred for post-MVP optimization).  
**Reason:** Proportional, standard across the ride-hailing industry, and straightforward to audit in the driver wallet ledger.  
**Affected Components:** `PricingConfig`, Driver Wallet Ledger, Settlement Use Case, Ride Pricing Snapshot, Reporting.  
**Approved by:** Product & Engineering (via OQ-002)

---

## D-027 — Buffer-Zone Distance (City Override with Global Default)

**Decision ID:** D-027  
**Date:** 2026-09-24  
**Question:** OQ-003 (Buffer-zone distance & configuration)  
**Status:** Decided

**Decision:**
Buffer zone distance is **configurable per city zone**, with a fallback to a **global system default**:

```text
effective_buffer_distance_m = city_zone.buffer_distance_m ?? global_settings.default_buffer_distance_m
```

**Key Architectural Rules:**

1. **Trip Distance Basis**: Fallback in-city classification applies when pickup is outside every city polygon and the **pickup-to-drop trip distance** (`trip_distance_m`) is within `effective_buffer_distance_m`. It is **not** based on distance from pickup to city center.
2. **Nearest City Rates**: When buffer classification evaluates to true, the ride is priced under in-city rules using the rates of the nearest active city zone to the pickup point.
3. **Buffer Surcharge**: The configured `buffer_surcharge_paise` for that city and vehicle category is added to the fare breakdown.

**Alternatives Considered:** Fixed global buffer only (rejected because physical geography and density differ between metropolitan and tier-2/3 regions like Siliguri).  
**Reason:** Gives operations the flexibility to tune peripheral coverage per market while maintaining a reliable default (e.g. 20 km).  
**Affected Components:** Zone Engine, `CityZone` Schema, Global Settings, Pricing Configuration, Admin Zone Editor.  
**Approved by:** Product & Engineering (via OQ-003)

---

## D-028 — Fare Negotiation Bounds (Floor & Ceiling)

**Decision ID:** D-028  
**Date:** 2026-09-24  
**Question:** OQ-004 (Fare negotiation limits)  
**Status:** Decided

**Decision:**
Rider proposed fare limits are bounded by the following formulas:

- **Floor**:
  ```text
  negotiation_floor_paise = MAX(
      minimum_fare_paise,
      ROUND(suggested_fare_paise × (negotiation_floor_percent / 100))
  )
  ```
  Default floor percentage: **80%** of Suggested Fare.
- **Ceiling**:
  ```text
  negotiation_ceiling_paise = ROUND(suggested_fare_paise × (negotiation_ceiling_percent / 100))
  ```
  Default ceiling percentage: **150%** of Suggested Fare.

**Key Architectural Rules:**

1. **Server-Side Enforcement**: The negotiation engine enforces these bounds strictly. Proposals below the floor or above the ceiling are rejected immediately with `422 FARE_OUTSIDE_NEGOTIATION_LIMIT`.
2. **Configuration-Driven**: `negotiation_floor_percent` (e.g. 80) and `negotiation_ceiling_percent` (e.g. 150) are stored on `PricingConfig` per city zone and vehicle category, and captured in the ride pricing snapshot.
3. **Time-Boxed Window**: Driver offers operate within a default time-boxed window of 90 seconds.

**Alternatives Considered:** Unconstrained negotiation (rejected due to predatory pricing or extreme fare inflation), fixed rupee bands (rejected as insensitive to trip length).  
**Reason:** Protects driver earnings floor while capping rider fare surges during high demand or negotiation races.  
**Affected Components:** Fare Engine, Negotiation Engine, `PricingConfig`, API Contracts (`QuoteResponse`, `FareProposalRequest`).  
**Approved by:** Product & Engineering (via OQ-004)

---

## D-029 — Mid-Trip Extension Workflow

**Decision ID:** D-029  
**Date:** 2026-09-24  
**Question:** OQ-005 (Mid-trip extension workflow)  
**Status:** Decided (Recommended default approved)

**Decision:**
During an ongoing trip (`TRIP_STARTED`), a rider can request an extension to a new destination:

1. **Recalculation**: Routing engine computes additional route distance from current driver location (or original destination) to new destination.
2. **Zone Re-evaluation**: Zone Engine reruns zone classification. If the extension crosses into outstation or state boundaries, the appropriate tariff rates apply.
3. **Delta Fare Calculation**: Additional fare is computed using the ride's pricing snapshot and displayed to both parties.
4. **Driver Confirmation Required**: The driver receives an in-app extension prompt showing the new destination and additional earnings.
   - If Driver **Confirms**: Extension is accepted, agreed fare is incremented, and `RIDE_EXTENDED` event is emitted.
   - If Driver **Declines**: Extension is cancelled with `EXTENSION_REJECTED`, and the original agreed fare and destination remain binding.
5. **Multiple Extensions**: The rider may request another extension after a prior extension is resolved.

**Affected Components:** Ride State Machine, Fare Engine, Zone Engine, Mobile Apps, Audit Event Ledger.  
**Approved by:** Product & Engineering (via OQ-005)

---

## D-030 — Atomic Database Concurrency for Ride Assignment

**Decision ID:** D-030  
**Date:** 2026-09-24  
**Question:** OQ-006 (Ride assignment concurrency)  
**Status:** Decided (Recommended default approved)

**Decision:**
Authoritative ride assignment is executed as an **atomic single-document state transition** in MongoDB (supported by multi-document transactions in replica set `rs0`):

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

- Exactly one driver acceptance query succeeds.
- Any concurrent acceptance request matching `status = 'OFFERING'` fails immediately and returns `409 RIDE_ALREADY_ASSIGNED`.
- Redis coordinates realtime event broadcasts and removes pending offers from other handsets, but MongoDB remains the single source of truth.

**Affected Components:** Dispatch Engine, Ride Repository, WebSocket Gateway, Driver Mobile App.  
**Approved by:** Product & Engineering (via OQ-006)

---

## D-031 — Ride Expiration & Immutable Offer History

**Decision ID:** D-031  
**Date:** 2026-09-24  
**Question:** OQ-007 (Ride expiration behavior)  
**Status:** Decided (Recommended default approved)

**Decision:**
When an offer's time-boxed window (default 90 seconds) elapses without driver acceptance:

1. **Transition**: The ride transitions from `OFFERING` to `EXPIRED`.
2. **Notification**: The rider receives an explicit notification: "No driver accepted the current offer."
3. **Immutable History**: Historical proposal and negotiation records are append-only. Expired ride records remain preserved in history and are never silently mutated or deleted.
4. **Re-attempt**: The rider can initiate a new proposal or adjust fare within bounds, creating a new negotiation attempt.

**Affected Components:** Negotiation Engine, Dispatch Queue Worker, Ride State Machine, Event Log.  
**Approved by:** Product & Engineering (via OQ-007)

---

## D-032 — State-Based Cancellation & No-Show Policy

**Decision ID:** D-032  
**Date:** 2026-09-24  
**Question:** OQ-008 (Cancellation rules and financial policy)  
**Status:** Decided (Recommended default approved)

**Decision:**
Cancellation policies and financial liabilities are strictly governed by ride lifecycle state:

- `REQUESTED` / `OFFERING`: Rider can cancel freely with zero cancellation fee.
- `DRIVER_ASSIGNED` / `DRIVER_EN_ROUTE`: Rider can cancel freely within a 2-minute grace period. Cancellations after grace period incur a configurable cancellation fee (credited partially as driver compensation, remainder to platform).
- `DRIVER_ARRIVED`: Driver must wait a minimum configured wait period (e.g. 5 minutes). If passenger fails to appear, driver triggers `NO_SHOW`. After validation, ride transitions to `CANCELLED` with a no-show penalty charged to the rider and paid to the driver.
- `TRIP_STARTED`: Trip cannot be unilaterally cancelled; early drop-off becomes trip termination/dispute flow.

**Affected Components:** Ride State Machine, Driver Wallet Ledger, Cancellation Use Cases, Payment Service.  
**Approved by:** Product & Engineering (via OQ-008)

---

## D-033 — Cash Payment Confirmation & Dispute Workflow

**Decision ID:** D-033  
**Date:** 2026-09-24  
**Question:** OQ-009 (Cash-payment confirmation)  
**Status:** Decided (Recommended default approved)

**Decision:**
For cash-settled rides:

1. **Driver Confirmation**: Upon trip completion (`PAYMENT_PENDING`), the driver collects physical cash and confirms receipt in the Driver App (`DRIVER_MARKS_CASH_RECEIVED`).
2. **Transition**: Ride transitions to `PAYMENT_CONFIRMED` and platform commission is debited from the driver's prepaid wallet.
3. **Rider Visibility & Disputes**: The rider immediately sees the payment confirmation in their app. If there is a dispute (e.g. overcharging or disputed payment status), the rider can trigger "Dispute Payment", which transitions the ride to `PAYMENT_DISPUTED` and creates an audit dispute ticket for admin resolution.

**Affected Components:** Payment Domain, Driver App, Rider App, Wallet Ledger, Disputes Module.  
**Approved by:** Product & Engineering (via OQ-009)

---

## D-034 — Immutable Pricing & Zone Snapshots

**Decision ID:** D-034  
**Date:** 2026-09-24  
**Question:** OQ-010 (Pricing configuration snapshotting & versioning)  
**Status:** Decided (Recommended default approved)

**Decision:**
Every ride locks an immutable pricing and zone classification snapshot at ride-request creation:

- Captured snapshot fields: `pricing_config_id`, `pricing_config_version`, `base_fare_paise`, `rate_per_km_paise`, `minimum_fare_paise`, `included_distance_m`, `buffer_surcharge_paise`, `negotiation_floor_percent`, `negotiation_ceiling_percent`, `commission_percent`, `zone_type`, `state_segments`.
- Live pricing lookup against mutable database configuration is strictly prohibited for existing rides.
- Admin pricing modifications create a new configuration version with a new `version` increment; existing and in-flight rides remain pegged to their historical snapshot.

**Affected Components:** Ride Entity, Pricing Engine, Database Schema, Audit Logging.  
**Approved by:** Product & Engineering (via OQ-010)

---

## D-035 — Interstate Route Segmentation Pricing Model

**Decision ID:** D-035  
**Date:** 2026-09-24  
**Question:** OQ-011 (Interstate pricing model)  
**Status:** Decided (Recommended default approved)

**Decision:**
When a route crosses state borders:

1. **Route Polyline Segmentation**: The routing polyline is spatially intersected with state boundary polygons to produce discrete sequential state segments: $[(\text{State}_1, \text{dist}_1), (\text{State}_2, \text{dist}_2), \dots]$.
2. **Per-State Rate Calculation**: Each segment distance is multiplied by that state's configured `rate_per_km_paise` from `state_pricing`.
3. **Fare Aggregation**: Total interstate distance fare equals the sum of segment distance fares, plus base fare, buffer surcharge (if applicable), and tolls/permit fees.
4. **Transparency**: The state segment distance breakdown is recorded in the ride pricing snapshot and displayed transparently to riders and drivers.

**Affected Components:** Zone Engine, Fare Engine, State Pricing Schema, Rider/Driver Breakdown Views.  
**Approved by:** Product & Engineering (via OQ-011)

---

## D-036 — Driver Dispatch Eligibility 10-Point Criteria

**Decision ID:** D-036  
**Date:** 2026-09-24  
**Question:** OQ-012 (Driver eligibility rules for dispatch)  
**Status:** Decided (Recommended default approved)

**Decision:**
To receive a broadcast ride offer, a candidate driver must satisfy all 10 eligibility conditions simultaneously:

1. **Account Status**: `ACTIVE` (not deactivated or pending review).
2. **KYC Status**: `APPROVED` by admin review.
3. **Vehicle Status**: `APPROVED` and assigned to driver.
4. **Document Validity**: All mandatory documents (DL, RC, Insurance, Permit) valid and unexpired (`expires_at > NOW()`).
5. **Prepaid Wallet**: Balance must be strictly positive (`balance_paise > 0`).
6. **Duty Status**: Driver is `ONLINE` (on duty).
7. **Location Freshness**: Realtime location fix reported to Redis within freshness threshold (< 2 minutes).
8. **Vehicle Category Match**: Vehicle category strictly matches the requested category (`CAB` vs `E_RICKSHAW`, per D-025).
9. **Concurrency**: Driver is not already assigned to another active ride (`assigned_ride_id === null`).
10. **Disciplinary Status**: Driver is not `SUSPENDED` or under fraud lockout.

**Affected Components:** Dispatch Matching Engine, Driver Pool Indexing, Redis Presence Cache, Admin Verification.  
**Approved by:** Product & Engineering (via OQ-012)

---

## Explicitly Not Decided by This Log

The PRD does not decide:

- Backend language/framework.
- Mobile framework.
- Web frontend framework.
- Database technology.
- Cache technology.
- WebSocket implementation.
- Push notification provider.
- Hosting/cloud provider.
- CI/CD.
- Repository structure.
- Exact API paths/payloads.
- Exact MongoDB/PostgreSQL schema.
- Exact token implementation.
- Exact wallet provider.
- Exact routing provider; Google/Mapbox are examples.
