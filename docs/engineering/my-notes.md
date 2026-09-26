### 1. What problem does cabzone solve?

Traditional ride-hailing platforms suffer from rigid, algorithmic surge pricing, lack of negotiation flexibility, and poor economic alignment for trips that cross city borders or travel outstation (where return-trip viability, empty returns, state permits, and inter-city toll economics differ substantially from intra-city travel).

cabzone solves this with two foundational pillars:

1. **Negotiable Fares:** Instead of unilateral platform surge pricing, cabzone allows riders and drivers to negotiate fares within controlled, bounded limits. Riders can counter-offer the system's Suggested Fare, and drivers can choose to accept, decline, or counter, re-introducing fair market dynamics.
2. **Zone-Based & Interstate Pricing:** cabzone automatically classifies trips into **In-City**, **Outstation**, and **Interstate** based on precise geospatial boundaries and route polylines. It splits interstate trips into state-specific distance segments and calculates buffer surcharges for edge pickups, giving drivers sustainable compensation and riders transparent pricing.
3. **Prepaid Commission & Verified Driver Network:** It eliminates payment friction and cash-skimming issues by maintaining a prepaid driver wallet for platform commissions and enforcing strict third-party KYC verification (DL + Govt ID) before a driver can take rides.

---

### 2. Who are the three users/platforms?

| Persona    | Platform                   | Primary Responsibilities                                                                                                                                                                                   |
| ---------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rider**  | Mobile App (iOS / Android) | Search routes, view Suggested Fare, submit Rider Proposed Fare, book for self or someone else, track assigned driver in real-time, pay via UPI/Cash, rate & review driver.                                 |
| **Driver** | Mobile App (iOS / Android) | Complete KYC document onboarding, maintain prepaid wallet balance, receive broadcast ride offers with negotiated fares, accept/decline offers, navigate pickup/drop, collect payment, rate & review rider. |
| **Admin**  | Web Dashboard              | Review & verify driver KYC applications, draw and configure city geofence polygons, manage base/km/interstate pricing rules, resolve disputes, inspect audit logs and system health.                       |

---

### 3. What happens when a rider requests a ride?

When a rider inputs a pickup and destination and confirms a request, the following sequential pipeline executes:

1. **Validation & Authentication:** Backend authenticates the rider, validates pickup/destination coordinates, and records passenger info (distinguishing self-booking from booking for someone else).
2. **Route Resolution:** The routing engine (Google Maps / Mapbox) computes the real driving distance (`route_distance_m`) and polyline. Straight-line distance is never used.
3. **Zone Classification:** The Zone Engine evaluates pickup coordinates against active city polygons and buffer rules to classify the ride as `IN_CITY`, `OUTSTATION`, or `INTERSTATE`.
4. **Pricing Resolution & Snapshot Freeze:** Active pricing configs for the classified zone and vehicle type are retrieved and copied into an **immutable Pricing Snapshot** (`base_fare`, `rate_per_km`, `minimum_fare`, `buffer_surcharge`, `commission_rate`, `config_version`).
5. **Suggested Fare Calculation:** The Fare Engine deterministically computes the **Suggested Fare**, along with negotiation boundaries (**Floor** and **Ceiling**).
6. **Ride Creation (`REQUESTED`):** The ride entity is created in `REQUESTED` state in the database.
7. **Rider Offer Selection:** The rider chooses either to proceed with the Suggested Fare or enters a **Rider Proposed Fare** (validated against `Floor <= Proposed Fare <= Ceiling`).
8. **Offer Broadcasting (`OFFERING`):** State transitions to `OFFERING`. A countdown negotiation timer (default 90 seconds) starts, and the Dispatch Engine queries nearby active, KYC-verified drivers with a positive wallet balance (`wallet_balance > 0`) using geospatial index search (`$geoNear`) and sends real-time offer payloads via WebSockets.

---

### 4. What is Suggested Fare?

The **Suggested Fare** is the algorithmic baseline fare calculated deterministically by cabzone's Fare Engine before any negotiation occurs.

- **Formula:**
  $$\text{Raw Fare} = \text{Base Fare} + (\text{Billable Route Distance} \times \text{Rate/km}) + \text{Buffer Surcharge}$$
  $$\text{Fare} = \max(\text{Raw Fare}, \text{Minimum Fare})$$
  $$\text{Suggested Fare} = \operatorname{ROUND}(\text{Fare})$$
- **Storage Standard:** All money is computed and stored as integer **paise** ($1\text{ INR} = 100\text{ paise}$) and distance in integer **metres** to prevent floating-point calculation errors.
- **Invariance:** Suggested Fare is deterministic for identical route and configuration inputs and is permanently recorded in the ride's pricing snapshot.

---

### 5. What is Rider Proposed Fare?

The **Rider Proposed Fare** is the optional counter-offer submitted by the rider if they choose not to accept the platform's Suggested Fare.

- **Boundary Validation:** The Negotiation Engine validates that the proposed fare does not breach platform-defined limits:
  $$\text{Floor} \le \text{Rider Proposed Fare} \le \text{Ceiling}$$
  - _Default Floor:_ $\max(\text{Minimum Fare}, 80\% \times \text{Suggested Fare})$
  - _Default Ceiling:_ $150\% \times \text{Suggested Fare}$
- If the proposed fare falls outside these bounds, the API rejects it with `422 FARE_OUTSIDE_NEGOTIATION_LIMIT`.
- Once validated, the Rider Proposed Fare becomes the active price displayed to drivers during offer broadcasting.

---

### 6. What is Agreed Fare?

The **Agreed Fare** is the final, legally binding trip price established the instant an eligible driver accepts the ride offer (whether accepting the Suggested Fare or the Rider Proposed Fare).

- **Lifecycle Stamping:** When a driver accepts the ride, the transaction atomically stamps `agreed_fare_paise` onto the ride record and emits a `FARE_AGREED` audit event.
- **Immutability:** The Agreed Fare cannot be changed unilaterally by rider, driver, or admin.
- **Exception (Mid-Trip Extension):** The only mechanism that can modify the Agreed Fare is a formal in-app mid-trip extension, where additional route distance and zone rates are calculated and explicitly confirmed by both rider and driver.

---

### 7. How is a ride classified as In-City / Outstation?

The Zone Engine evaluates the ride using a deterministic, polygon-first classification sequence:

```
                  [ Pickup Coordinates ]
                            │
               Is pickup inside any active
                   City Polygon?
                     /          \
                   YES           NO
                   /              \
            [ IN-CITY ]      Is trip distance <=
                             configured Buffer (e.g. 20km)?
                                /              \
                              YES               NO
                              /                  \
                       [ IN-CITY ]         [ OUTSTATION ]
                    (Nearest city rates   (Outstation rates)
                     + buffer surcharge)
```

1. **Polygon Geofence ($geoIntersects):** If the pickup coordinate falls inside an admin-defined city polygon $\rightarrow$ **`IN_CITY`** (billed at that city's local rates).
2. **Buffer Distance Fallback:** If pickup is outside all polygons, but the total pickup-to-drop trip distance is within the global buffer distance (e.g., $\le 20\text{ km}$) $\rightarrow$ **`IN_CITY`** (priced using the nearest city polygon's pricing configuration, with an added buffer surcharge).
3. **Outstation:** If pickup is outside all polygons and trip distance exceeds the buffer $\rightarrow$ **`OUTSTATION`**.
4. _(Interstate Check)_: If the route polyline crosses one or more state boundaries, it is additionally flagged for Interstate state-by-state distance segmentation.

---

### 8. What happens when two drivers accept simultaneously?

When two drivers tap "Accept" at the exact same instant, a race condition occurs. cabzone handles this with an **atomic concurrency guard / distributed database lock**:

1. **Atomic State & Ownership Transition:** The acceptance query executes an atomic condition check:
   ```sql
   UPDATE rides
   SET driver_id = :driver_id,
       status = 'DRIVER_ASSIGNED',
       accepted_at = NOW()
   WHERE id = :ride_id
     AND status = 'OFFERING'
     AND driver_id IS NULL;
   ```
2. **Winner Driver (Rows Affected = 1):** The first driver whose update reaches the database commits the transaction. They are assigned the ride, transition to `DRIVER_ASSIGNED`, and receive a success response with full rider and pickup details.
3. **Loser Driver (Rows Affected = 0):** The database update matches 0 rows because `status` is no longer `'OFFERING'` and `driver_id` is no longer `NULL`.
   - The backend immediately returns `409 Conflict` / `RIDE_ALREADY_ASSIGNED`.
   - A WebSocket message notifies the second driver's app that the ride was already taken by another driver, and their screen clears back to the available offers feed.

---

### 9. Why does the driver have a wallet?

cabzone operates a **prepaid commission ledger model** for drivers because:

1. **Direct Rider-to-Driver Payments:** Riders pay drivers directly via cash or driver-provided UPI QR codes. cabzone does not hold or escrow trip fares for cash rides.
2. **Frictionless Commission Collection:** Because cabzone does not sit in the flow of cash payments, it cannot automatically withhold its platform commission at trip completion. The prepaid wallet allows cabzone to automatically deduct platform commission without chasing drivers for debt or managing post-trip invoicing.
3. **Dispatch Gate:** Maintaining a positive balance (`wallet_balance > 0`) is an automated precondition for dispatch eligibility. It ensures drivers maintain a credit balance before taking platform-provided leads.

---

### 10. What happens if the wallet reaches zero during an active ride?

- **Zero Interruption to Active Ride:** An active trip is **never cancelled, aborted, or interrupted** if the driver's wallet drops to zero or goes negative due to toll adjustments, commission debits, or penalties during the trip.
- **Safety & Invariant Guard:** Passenger safety and trip continuity are paramount platform invariants (`Active rides cannot be terminated because wallet balance reaches zero`).
- **Post-Trip Dispatch Block:** Once the active trip completes and settles:
  - Platform commission is recorded in the immutable wallet ledger. If balance drops $\le 0$, the balance simply becomes zero or negative.
  - The driver is immediately placed in an ineligible dispatch state. The Dispatch Engine will exclude the driver from all new ride broadcasts until they complete a wallet top-up that brings the balance back strictly above zero (`balance > 0`).

---

### 11. What happens when a ride crosses a state?

When a trip crosses one or more state boundaries:

1. **Polyline State Intersection:** The routing polyline is intersected against geographic state boundaries to divide the journey into contiguous, ordered **State Segments** (e.g., State A: 85 km, State B: 45 km).
2. **Segmented Distance Pricing:** Distance travelled within each state is priced at that specific state's regulated Rate/km:
   $$\text{Total State Distance Fare} = \sum_{i} (\text{Segment Distance}_i \times \text{State Rate}_i)$$
3. **Transparent Charges Breakdown:** State border entry taxes, commercial transport permits, and highway tolls are broken down into discrete line items (`distance_fare`, `toll_charges`, `permit_charges`) rather than being hidden in distance rates.
4. **Upfront Freeze:** State segment breakdowns and estimated toll/permit costs are computed and frozen into the Pricing Snapshot at the time of the ride request so neither rider nor driver is surprised by hidden costs at the border.

---

### 12. What happens if pricing changes after a rider requests a ride?

- **No Impact on the Existing Ride.**
- **The Configuration Freeze Invariant:** At the exact moment a ride is requested, cabzone creates an immutable **Pricing Snapshot** (`fare_snapshot`) attached directly to that `ride_id`.
- The snapshot freezes:
  - `config_id` & `config_version`
  - `base_fare_paise`, `rate_per_km_paise`, `minimum_fare_paise`
  - `buffer_surcharge_paise`, `included_km`
  - `negotiation_floor_paise` & `negotiation_ceiling_paise`
  - `commission_rate`
- **Result:** If an administrator updates city zone polygons, increases per-km rates, or modifies commission percentages while a ride is in `REQUESTED`, `OFFERING`, or active transit, those changes only affect _subsequent_ ride requests. The existing ride executes, negotiates, completes, and settles strictly against its original frozen snapshot.
