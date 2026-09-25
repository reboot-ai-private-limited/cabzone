# Cabzon — Domain Model

**Document:** `docs/LLD/domain-model.md`
**Status:** Draft for Engineering Review
**Version:** 0.1
**Parent Documents:**

- [`docs/prd.md`](../prd.md)
- [`docs/LLD/open-questions.md`](open-questions.md)

---

# 1. Purpose

This document defines the business domain of Cabzon independently of implementation details.

It establishes:

- Domain terminology.
- Actors and responsibilities.
- Core entities and their ownership.
- Entity relationships.
- Entity lifecycle boundaries.
- Core business invariants.
- Domain events.
- Aggregate boundaries.
- Rules that must be enforced by application/domain logic.
- Rules that must eventually be enforced at the database or infrastructure boundary.

This document does **not** define:

- MongoDB/Mongoose schemas.
- REST endpoint details.
- WebSocket payloads.
- UI implementation.
- Infrastructure deployment.
- Exact third-party provider APIs.

Those concerns are defined in later LLD and engineering documents.

---

# 2. Domain Summary

Cabzon is a ride-hailing platform consisting of three primary applications:

```text
┌────────────────────┐
│     Rider App      │
│                    │
│ Request ride       │
│ Negotiate fare     │
│ Track ride         │
│ Pay                 │
│ Rate driver        │
└─────────┬──────────┘
          │
          │
          ▼
┌────────────────────────────┐
│       Cabzon Backend       │
│                            │
│ Auth                       │
│ Ride Management            │
│ Pricing                    │
│ Zone Classification        │
│ Dispatch                   │
│ Payments                   │
│ Wallet                     │
│ Reviews                    │
│ Trust/Fraud                │
└────────────┬───────────────┘
             │
      ┌──────┴──────┐
      │             │
      ▼             ▼
┌────────────┐ ┌──────────────┐
│ Driver App │ │ Admin Web    │
│            │ │ Dashboard    │
│ Online     │ │ KYC review   │
│ Receive    │ │ Zones        │
│ Accept     │ │ Pricing      │
│ Navigate   │ │ Disputes     │
│ Complete   │ │ Operations   │
└────────────┘ └──────────────┘
```

The Rider creates demand, the Driver fulfills the ride, and Admin manages operational configuration and exceptions. The PRD identifies these as the three principal personas/platforms.

---

# 3. Domain Actors

## 3.1 Rider

A Rider is the customer requesting transportation.

### Responsibilities

A Rider can:

- Create an account using a phone number and OTP.
- Maintain optional profile information.
- Request a ride.
- Request a ride for another person.
- Accept the suggested fare.
- Submit a proposed fare.
- View driver information after assignment.
- Track the driver.
- Cancel a ride where permitted.
- Request a mid-trip extension.
- Pay using supported payment methods.
- Rate/review the Driver.
- View their ride history.
- Raise disputes where supported.

The PRD explicitly supports booking for either the Rider themselves or another passenger.

---

# 3.2 Passenger

A Passenger is the actual person travelling in the vehicle.

A Passenger may be:

```text
Rider == Passenger
```

or:

```text
Rider != Passenger
```

when a Rider books on behalf of another person.

For a third-party ride, the domain must distinguish:

```text
booker
actual passenger
```

The PRD identifies this distinction as necessary for accountability and pickup verification.

---

# 3.3 Driver

A Driver is a service provider who operates an approved vehicle and fulfills rides.

### Responsibilities

A Driver can:

- Submit an onboarding application.
- Submit identity documents.
- Submit driving-license information.
- Register vehicle information.
- Complete KYC.
- Receive administrative approval.
- Go online/offline.
- Receive ride offers.
- Accept/decline ride offers.
- Navigate to pickup.
- Confirm arrival.
- Start a trip.
- Confirm trip completion.
- Confirm cash receipt when applicable.
- Receive ride payments/earnings.
- Pay Cabzon commission through the wallet.
- Rate/review the Rider.
- View ride history.
- Raise disputes.

A Driver cannot receive rides until the required account, KYC, vehicle, and operational eligibility conditions are satisfied.

---

# 3.4 Admin

Admin represents Cabzon's operational staff.

The original PRD uses a broad `Admin` role but explicitly identifies the need to split administrative responsibilities.

The domain therefore defines Admin as an abstract administrative actor with concrete roles:

```text
SUPER_ADMIN
CITY_ADMIN
SUPPORT_ADMIN
FINANCE_ADMIN
```

Exact permissions are defined separately in the authorization design.

---

# 3.5 System

The System is the automated Cabzon backend.

It is responsible for:

- Fare calculation.
- Zone classification.
- Driver eligibility evaluation.
- Ride dispatch.
- Ride expiration.
- Notifications.
- State transition enforcement.
- Payment processing coordination.
- Wallet calculations.
- Fraud detection/flagging.
- Document-expiry monitoring.
- Audit-event generation.
- Reconciliation jobs.

The System is an actor because many domain transitions occur without direct human action.

---

# 4. Core Domain Concepts

## 4.1 Driver Application

Represents a Driver's onboarding and verification process.

Lifecycle:

```text
DRAFT
  ↓
SUBMITTED
  ↓
UNDER_REVIEW_AUTO
  ↓
UNDER_REVIEW_ADMIN
  ├──→ APPROVED
  │
  └──→ REJECTED
             │
             ↓
          REAPPLIED
```

The PRD explicitly defines these application states.

A Driver Application is not the same thing as a Driver.

```text
DriverApplication
       │
       │ approved
       ▼
     Driver
```

An application can be rejected without deleting the historical application record.

---

# 4.2 Driver

Represents the operational service provider.

Important conceptual attributes:

```text
Driver
├── identity
├── account status
├── KYC status
├── vehicle
├── wallet
├── rating
├── trust score
├── operational status
└── eligibility status
```

A Driver may exist before becoming eligible to accept rides.

Example:

```text
REGISTERED
   ↓
KYC_PENDING
   ↓
APPROVED
   ↓
ACTIVE
   ↓
SUSPENDED
```

The exact Driver account state machine will be defined separately.

---

# 4.3 Vehicle

Represents the vehicle used by a Driver to fulfill rides.

A vehicle is conceptually separate from Driver because:

```text
Driver
  │
  └── operates → Vehicle (Category: CAB | E_RICKSHAW)
```

Vehicle category-specific pricing is **approved** (per [`decision-log.md`](../decision-log.md#d-025--vehicle-category-pricing--initial-fleet-types), D-025).

Supported launch fleet categories:

```text
CAB          (Active at launch — 4-wheeler car/cab)
E_RICKSHAW   (Coming soon — electric rickshaw, staged in schema and architecture)
```

Future categories (e.g. `SEDAN`, `SUV`, `AUTO`) can be enabled via Admin pricing configuration without schema migrations.

---

# 4.4 Rider

Represents the authenticated customer account.

Core conceptual information:

```text
Rider
├── phone
├── verification status
├── profile
├── rating
├── trust-related information
└── ride history
```

Authentication identity and Rider profile should remain conceptually separate.

---

# 4.5 Ride

The Ride is the **central transactional aggregate** of Cabzon.

A Ride represents one transportation transaction from request through settlement.

Conceptually:

```text
Ride
│
├── Booker
├── Passenger
├── Driver
├── Vehicle
│
├── Pickup
├── Destination
├── Route
│
├── Zone Classification
├── Pricing Snapshot
│
├── Fare Negotiation
├── Agreed Fare
│
├── Ride State
├── Location/Tracking
│
├── Payment
├── Commission
│
├── Reviews
└── Disputes
```

The PRD defines the Ride as containing pickup/drop information, route distance, zone classification, suggested/proposed/agreed fares, state, and timestamps.

---

# 4.6 Fare

Cabzon has three distinct fare concepts.

```text
                  ┌────────────────┐
                  │ Suggested Fare │
                  └───────┬────────┘
                          │
                     Rider proposes
                          │
                          ▼
                  ┌────────────────┐
                  │ Proposed Fare  │
                  └───────┬────────┘
                          │
                    Driver accepts
                          │
                          ▼
                  ┌────────────────┐
                  │  Agreed Fare   │
                  └────────────────┘
```

### Suggested Fare

Calculated by the Cabzon pricing engine.

### Rider Proposed Fare

Amount offered by the Rider during negotiation.

### Agreed Fare

Amount accepted by the Driver.

The PRD explicitly distinguishes these three values.

---

# 4.7 Pricing Configuration

Represents the pricing rules applicable to a geographic/vehicle context.

Conceptually:

```text
PricingConfiguration
├── city/zone
├── vehicle type
├── base fare
├── rate per km
├── minimum fare
├── included distance
├── buffer surcharge
├── negotiation limits
└── commission configuration
```

A Ride must not depend on mutable pricing configuration after its fare has been established.

Instead:

```text
Current Pricing Configuration
            │
            ▼
       Ride Creation
            │
            ▼
    Pricing Snapshot
            │
            ▼
       Ride remains
       historically stable
```

The PRD requires pricing classification to be frozen at ride-request time.

---

# 4.8 Pricing Snapshot

A Pricing Snapshot is the immutable representation of the pricing configuration used for a specific Ride.

Conceptually:

```text
PricingSnapshot
├── configuration_id
├── configuration_version
├── zone classification
├── base fare
├── rate/km
├── minimum fare
├── included distance
├── applicable surcharges
└── applicable negotiation limits
```

This prevents an Admin changing current pricing from modifying an existing ride's financial calculation.

---

# 4.9 City Zone

A City Zone represents the geographic boundary and pricing context for a city.

Conceptually:

```text
CityZone
├── city identity
├── GeoJSON polygon
├── pricing configuration
├── buffer configuration
├── operational status
└── configuration version
```

The PRD requires city boundaries to be represented as polygons rather than simply as a radius.

---

# 4.10 Zone Classification

Zone Classification determines the commercial category of a Ride.

Current domain categories:

```text
IN_CITY
OUTSTATION
INTERSTATE
```

The exact relationship between `OUTSTATION` and `INTERSTATE` requires care:

- `IN_CITY` is determined primarily from pickup location and the configured city rules.
- `OUTSTATION` represents a ride outside the in-city classification.
- `INTERSTATE` represents a ride whose route crosses state boundaries and therefore requires state-segment pricing.

The PRD explicitly requires state-based pricing when the destination/route crosses state boundaries.

---

# 4.11 Route

A Route represents the route returned by the configured routing provider.

It is distinct from straight-line geographic distance.

Conceptually:

```text
Pickup
   ↓
Routing Engine
   ↓
Route
├── distance
├── duration
├── polyline
└── state segments
```

The PRD explicitly requires Route Distance to come from a routing engine and to be locked at ride-request time.

---

# 4.12 State Pricing

Represents pricing applicable to a route segment within a particular state.

Conceptually:

```text
Route
 ├── State A segment → StatePricing A
 ├── State B segment → StatePricing B
 └── State C segment → StatePricing C
```

The final interstate fare is derived from the applicable state segments.

The PRD requires the route to be segmented according to state boundaries and priced using state-specific rates.

---

# 4.13 Fare Negotiation

Represents the history of fare proposals and responses associated with a Ride.

Conceptually:

```text
FareNegotiation
├── Ride
├── actor
├── previous amount
├── proposed amount
├── action
├── timestamp
└── result
```

Example:

```text
SYSTEM
  Suggested ₹140
      ↓
RIDER
  Offers ₹130
      ↓
SYSTEM
  Valid
      ↓
DRIVER
  Accepts ₹130
      ↓
AGREED FARE = ₹130
```

Negotiation events are append-only.

The PRD specifically recommends logging negotiation events for fraud detection.

---

# 4.14 Wallet

A Wallet represents the Driver's Cabzon financial balance used for commission settlement.

```text
Driver
  │
  └── Wallet
        │
        └── Wallet Transactions
```

The wallet is not the same as Driver earnings.

It is an accounting mechanism for amounts owed to Cabzon.

The PRD requires a prepaid Driver wallet and states that a non-positive wallet balance prevents acceptance of new rides.

---

# 4.15 Wallet Transaction

Represents an immutable financial movement.

Conceptual transaction types:

```text
CREDIT
DEBIT
REVERSAL
ADJUSTMENT
```

Examples:

```text
Wallet Top-up
→ CREDIT

Cabzon Commission
→ DEBIT

Commission Reversal
→ REVERSAL

Admin Financial Adjustment
→ ADJUSTMENT
```

The exact commission model remains an open product decision.

---

# 4.16 Payment

Represents the payment associated with a Ride.

Supported MVP methods:

```text
UPI
CASH
```

The PRD explicitly identifies these two payment methods.

Payment is distinct from the Driver wallet:

```text
Rider Payment
       │
       ▼
     Ride
       │
       ├── Driver earnings
       │
       └── Cabzon commission
                    │
                    ▼
              Driver Wallet
```

---

# 4.17 Review

Represents a post-ride review.

Relationships:

```text
Rider ─────reviews─────> Driver

Driver ─────reviews────> Rider
```

Reviews are associated with completed rides.

The PRD requires both parties to be able to rate/review one another.

---

# 4.18 Trust Score

A Trust Score is an operational trust signal shown to users.

It is conceptually distinct from a raw rating.

Potential inputs identified by the PRD include:

```text
verified rides
rating
cancellation rate
complaints
disputes
recency
```

The exact formula is unresolved and must not be invented inside application code.

The PRD explicitly states that the Trust Score requires a defined formula and anti-gaming protection.

---

# 4.19 Dispute

Represents an operational complaint requiring investigation.

Known dispute categories include:

```text
FARE_DISPUTE
CASH_PAYMENT_DISPUTE
SAFETY_INCIDENT
OTHER
```

The PRD explicitly identifies fare, cash-payment, and SOS/safety disputes.

A dispute must preserve the relevant historical Ride state and evidence.

---

# 4.20 Audit Log

An Audit Log records sensitive administrative or system actions.

Examples:

```text
Admin changed pricing
Admin changed city polygon
Admin approved driver
Admin rejected driver
Admin suspended driver
Admin resolved dispute
Admin adjusted wallet
```

Audit records are append-only.

The PRD explicitly requires an audit trail for administrative pricing and zone changes.

---

# 5. Entity Relationship Map

```text
                         ┌──────────────┐
                         │    Rider     │
                         └──────┬───────┘
                                │
                              books
                                │
                                ▼
                         ┌──────────────┐
                         │     Ride     │
                         └──────┬───────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
        ┌───────────┐    ┌─────────────┐   ┌─────────────┐
        │  Driver   │    │   Vehicle   │   │   Payment   │
        └─────┬─────┘    └─────────────┘   └─────────────┘
              │
              ├───────────────┐
              ▼               ▼
        ┌───────────┐   ┌──────────────┐
        │  Wallet   │   │  Reviews     │
        └───────────┘   └──────────────┘

Ride
 │
 ├── Route
 │
 ├── Zone Classification
 │
 ├── Pricing Snapshot
 │
 ├── Fare Negotiations
 │
 └── Disputes

CityZone
 │
 └── Pricing Configuration
        │
        └── State Pricing
```

---

# 6. Driver Onboarding Domain Flow

```text
Driver
   │
   │ starts application
   ▼
DriverApplication
   │
   ├── documents
   ├── KYC verification
   └── admin review
          │
          ├── REJECTED
          │      │
          │      └── Reapply
          │
          └── APPROVED
                  │
                  ▼
                Driver
                  │
                  ├── Vehicle
                  ├── Wallet
                  └── Operational Status
```

A Driver Application remains historical even after approval or rejection.

---

# 7. Ride Domain Flow

```text
Rider
  │
  │ pickup + destination
  ▼
Ride Request
  │
  ├── Route calculation
  ├── Zone classification
  ├── Pricing calculation
  └── Pricing snapshot
          │
          ▼
      Suggested Fare
          │
          ▼
     Rider Proposal
          │
          ▼
       Dispatch
          │
          ▼
    Driver Acceptance
          │
          ▼
      Agreed Fare
          │
          ▼
     Ride Execution
          │
          ▼
      Trip Complete
          │
          ▼
        Payment
          │
          ▼
       Settlement
          │
          ▼
        Reviews
```

---

# 8. Ride Aggregate Boundary

The Ride is the central transactional aggregate.

The Ride owns or references:

```text
Ride
├── route snapshot
├── zone snapshot
├── pricing snapshot
├── fare negotiation history
├── lifecycle state
├── payment state
├── extension requests
└── cancellation state
```

The Ride does **not** directly own global configuration such as:

```text
CityZone
PricingConfiguration
StatePricing
```

Those are external configuration domains.

When a Ride is created, relevant configuration is copied into an immutable snapshot.

---

# 9. Aggregate Relationships

## 9.1 Rider → Ride

A Rider can have many Rides.

```text
Rider 1 ─────── N Ride
```

---

## 9.2 Driver → Ride

A Driver can fulfill many Rides over time.

```text
Driver 1 ─────── N Ride
```

A Ride can have at most one final assigned Driver.

---

## 9.3 Driver → Vehicle

A Driver may have one or more registered vehicles depending on the final product decision.

For MVP, the operational model should ensure that a Ride references exactly one selected Vehicle.

---

## 9.4 Ride → Fare Negotiation

```text
Ride 1 ─────── N FareNegotiation
```

Negotiation history is append-only.

---

## 9.5 Ride → Payment

```text
Ride 1 ─────── 1 Payment
```

The payment may have multiple external provider events or reconciliation records.

---

## 9.6 Driver → Wallet

```text
Driver 1 ─────── 1 Wallet
Wallet 1 ─────── N WalletTransaction
```

---

## 9.7 Ride → Reviews

A completed Ride may produce:

```text
0..1 Rider → Driver Review
0..1 Driver → Rider Review
```

---

## 9.8 Ride → Disputes

A Ride may have multiple disputes or dispute events depending on the final operational model.

```text
Ride 1 ─────── N Dispute
```

---

# 10. Core State Ownership

Each major state belongs to one domain owner.

| State/Status              | Owner             |
| ------------------------- | ----------------- |
| Driver Application Status | Driver Onboarding |
| Driver Account Status     | Driver            |
| Vehicle Verification      | Vehicle           |
| Ride State                | Ride              |
| Fare Negotiation State    | Fare Negotiation  |
| Payment State             | Payment           |
| Wallet State              | Wallet            |
| Dispute State             | Dispute           |
| Admin Session             | Authentication    |
| Zone Configuration        | Zone              |
| Pricing Configuration     | Pricing           |

No module should modify another module's state by directly manipulating its persistence model.

It must use the owning domain/application interface.

---

# 11. Domain Invariants

The following invariants are mandatory business rules.

## INV-01 — Unique Ride Assignment

A Ride can have **at most one assigned Driver**.

```text
Ride.driver_id
```

may transition from empty to one Driver only once for a normal dispatch assignment.

**Enforcement:** Ride/Dispatch application boundary + database atomicity.

**Timing:** Assignment write-time.

**Failure:** `409 RIDE_ALREADY_ASSIGNED`.

---

## INV-02 — Valid Ride State Transitions Only

A Ride may only transition through explicitly permitted lifecycle transitions.

Example:

```text
REQUESTED
→ OFFERING
→ DRIVER_ASSIGNED
→ DRIVER_EN_ROUTE
→ DRIVER_ARRIVED
→ TRIP_STARTED
→ TRIP_COMPLETED
```

Invalid transitions must be rejected.

**Enforcement:** Ride domain state machine.

**Timing:** Every state mutation.

**Failure:** `409 INVALID_RIDE_TRANSITION`.

---

## INV-03 — Agreed Fare Is Not Arbitrarily Mutable

Once a Driver accepts the Rider's offer, the Agreed Fare becomes the contractual fare for the Ride.

A change requires the explicit extension workflow.

**Enforcement:** Ride/Fare domain.

**Timing:** Write-time.

**Failure:** `409 FARE_ALREADY_AGREED`.

---

## INV-04 — Pricing Snapshot Is Immutable

Changes to current pricing configuration must not alter an existing Ride.

**Enforcement:** Pricing/Ride application boundary + persistence constraints.

**Timing:** Ride creation and subsequent writes.

**Failure:** `409 PRICING_SNAPSHOT_IMMUTABLE`.

The PRD explicitly requires this behavior.

---

## INV-05 — Route Distance Is Frozen

The route distance used for the original fare calculation must remain fixed during fare negotiation.

**Enforcement:** Ride creation.

**Timing:** Synchronous.

**Failure:** `409 ROUTE_SNAPSHOT_IMMUTABLE`.

The PRD explicitly requires the routing result to be locked at ride-request time.

---

## INV-06 — Driver Must Be Eligible to Accept

A Driver cannot accept a Ride unless the Driver satisfies all required operational eligibility rules.

Minimum conceptual conditions:

```text
approved
+
active
+
vehicle eligible
+
documents valid
+
online
+
location available
+
wallet eligible
+
not currently assigned
```

**Enforcement:** Dispatch application boundary.

**Failure:** `403 DRIVER_NOT_ELIGIBLE`.

---

## INV-07 — Wallet Does Not Terminate Active Rides

A non-positive Driver wallet may prevent acceptance of a new Ride but cannot interrupt an already active Ride.

**Enforcement:** Dispatch boundary.

**Timing:** New assignment only.

The PRD explicitly establishes this distinction.

---

## INV-08 — Completed Rides Are Terminal

A successfully completed Ride cannot return to an active trip state.

```text
TRIP_COMPLETED
```

is terminal with respect to trip execution.

Subsequent financial operations may continue through settlement/reconciliation without reopening the trip itself.

---

## INV-09 — Cancelled Rides Cannot Start

A Ride that has entered a terminal cancellation state cannot transition to:

```text
TRIP_STARTED
```

or:

```text
DRIVER_EN_ROUTE
```

---

## INV-10 — Negotiation Must Respect Configured Bounds

A Rider Proposed Fare must satisfy the configured negotiation floor and ceiling per Decision D-028 ([`decision-log.md`](../decision-log.md#d-028--fare-negotiation-bounds-floor--ceiling)):

- **Floor:**
  ```text
  negotiation_floor_paise = MAX(
      minimum_fare_paise,
      ROUND(suggested_fare_paise × (negotiation_floor_percent / 100))
  )
  ```
  Default floor percentage: **80%**.
- **Ceiling:**
  ```text
  negotiation_ceiling_paise = ROUND(suggested_fare_paise × (negotiation_ceiling_percent / 100))
  ```
  Default ceiling percentage: **150%**.

**Enforcement:** Fare Negotiation domain.  
**Failure:** `422 FARE_OUTSIDE_NEGOTIATION_LIMIT`.

---

## INV-11 — Negotiation History Is Append-Only

A previous fare proposal cannot be modified to rewrite historical negotiation behavior.

Corrections must be represented as new events.

**Enforcement:** Fare Negotiation domain.

---

## INV-12 — Cash Payment Requires Explicit Confirmation

A cash Ride cannot become financially settled without the defined cash-confirmation workflow.

**Failure:** `409 CASH_PAYMENT_NOT_CONFIRMED`.

---

## INV-13 — Wallet Transactions Are Immutable

A posted Wallet Transaction cannot be edited.

Corrections must be represented through reversal or adjustment transactions.

---

## INV-14 — Administrative Configuration Is Audited

Changes to:

- city zones
- pricing
- state pricing
- driver status
- wallet adjustments
- disputes

must produce audit records.

---

## INV-15 — Driver Application History Is Preserved

Rejected and previously submitted Driver Applications must remain historically traceable.

A reapplication creates a new application attempt/history entry rather than erasing the previous decision.

---

## INV-16 — Expired Driver Documents Affect Eligibility

An expired required document must prevent the Driver from remaining eligible according to the final KYC policy.

The PRD recommends warning before expiry and suspension after expiry.

---

## INV-17 — Third-Party Ride Must Identify the Passenger

If the Booker and Passenger are different people, the Ride must contain enough information to identify the intended Passenger and perform the defined pickup verification.

---

## INV-18 — Geographic Representation Must Be Consistent

Application/API coordinates use:

```text
{ lat, lng }
```

GeoJSON uses:

```text
[lng, lat]
```

Conversion must happen at an explicit infrastructure boundary.

---

## INV-19 — Financial Values Use Integer Subunits

All monetary domain values use integer paise.

Floating-point monetary values are prohibited.

---

## INV-20 — Historical Ride Data Must Be Self-Contained

An existing Ride must retain the information necessary to reconstruct the fare and classification that were agreed at the time of the transaction.

It must not depend on current mutable city pricing to explain a historical transaction.

---

# 12. Domain Events

Important domain state changes should produce immutable events.

## Driver Events

```text
DRIVER_APPLICATION_CREATED
DRIVER_APPLICATION_SUBMITTED
DRIVER_KYC_COMPLETED
DRIVER_APPLICATION_APPROVED
DRIVER_APPLICATION_REJECTED
DRIVER_REAPPLIED
DRIVER_SUSPENDED
DRIVER_REACTIVATED
```

## Ride Events

```text
RIDE_CREATED
RIDE_CLASSIFIED
RIDE_PRICED
RIDE_OFFERING_STARTED
RIDE_OFFER_EXPIRED
DRIVER_ASSIGNED
DRIVER_EN_ROUTE
DRIVER_ARRIVED
TRIP_STARTED
TRIP_COMPLETED
RIDE_CANCELLED
```

## Fare Events

```text
FARE_PROPOSAL_CREATED
FARE_PROPOSAL_REJECTED
FARE_PROPOSAL_ACCEPTED
FARE_AGREED
FARE_EXTENSION_REQUESTED
FARE_EXTENSION_ACCEPTED
FARE_EXTENSION_REJECTED
```

## Payment Events

```text
PAYMENT_CREATED
PAYMENT_PENDING
PAYMENT_CONFIRMED
PAYMENT_FAILED
PAYMENT_DISPUTED
PAYMENT_RECONCILED
```

## Wallet Events

```text
WALLET_CREDITED
WALLET_DEBITED
WALLET_REVERSED
WALLET_ADJUSTED
```

## Administrative Events

```text
PRICING_CONFIG_CREATED
PRICING_CONFIG_UPDATED
CITY_ZONE_CREATED
CITY_ZONE_UPDATED
DRIVER_STATUS_CHANGED
DISPUTE_RESOLVED
```

---

# 13. Entity Lifecycle Map

```text
                     DRIVER ONBOARDING

Driver
  │
  ▼
DriverApplication
  │
  ├── Draft
  ├── Submitted
  ├── Auto Review
  ├── Admin Review
  │
  ├───────────────→ Rejected
  │                      │
  │                      ▼
  │                  Reapplied
  │
  └───────────────→ Approved
                         │
                         ▼
                       Driver
                         │
                         ▼
                       Active
```

```text
                       RIDE LIFECYCLE

Rider
  │
  ▼
Ride Request
  │
  ▼
Classification
  │
  ▼
Pricing
  │
  ▼
Offering
  │
  ├────────────→ Expired
  │
  ▼
Driver Assigned
  │
  ▼
Driver En Route
  │
  ▼
Driver Arrived
  │
  ▼
Trip Started
  │
  ├────────────→ Extension Workflow
  │
  ▼
Trip Completed
  │
  ▼
Payment
  │
  ▼
Settlement
  │
  ▼
Reviews
```

---

# 14. Actor-to-Domain Matrix

| Domain              |    Rider    | Driver  |   Admin   |  System   |
| ------------------- | :---------: | :-----: | :-------: | :-------: |
| Authentication      |      ✓      |    ✓    |     ✓     |     ✓     |
| Driver Application  |      —      |    ✓    |     ✓     |     ✓     |
| KYC                 |      —      |    ✓    |     ✓     |     ✓     |
| Vehicle             |      —      |    ✓    |     ✓     |     ✓     |
| Ride Creation       |      ✓      |    —    |     —     |     ✓     |
| Zone Classification |      —      |    —    | Configure |     ✓     |
| Pricing             |    View     |  View   | Configure | Calculate |
| Negotiation         |      ✓      |    ✓    |   View    | Validate  |
| Dispatch            |    View     |    ✓    |   View    |     ✓     |
| Location            |    View     | Publish |   View    |   Route   |
| Trip Lifecycle      | View/Action | Action  |   View    | Validate  |
| Payment             |      ✓      |  View   |  Manage   |  Process  |
| Wallet              |      —      |    ✓    |  Manage   | Calculate |
| Reviews             |      ✓      |    ✓    | Moderate  |  Publish  |
| Trust               |    View     |  View   |  Manage   | Calculate |
| Disputes            |   Create    | Create  |  Resolve  |   Route   |
| Audit               |      —      |    —    |   View    |   Write   |

---

# 15. Domain Boundaries

The backend should be divided into domain modules.

```text
┌─────────────────────────────────────────┐
│                 Cabzon                  │
│                                         │
│  ┌──────────┐       ┌───────────────┐  │
│  │ Identity │       │ Driver Domain │  │
│  └──────────┘       └───────────────┘  │
│                                         │
│  ┌──────────┐       ┌───────────────┐  │
│  │   Ride   │──────▶│    Pricing    │  │
│  └────┬─────┘       └───────────────┘  │
│       │                                 │
│       ├──────────────▶ Zone             │
│       │                                 │
│       ├──────────────▶ Dispatch         │
│       │                                 │
│       ├──────────────▶ Payment          │
│       │                                 │
│       └──────────────▶ Wallet           │
│                                         │
│  ┌───────────┐      ┌───────────────┐  │
│  │ Reviews   │      │   Disputes    │  │
│  └───────────┘      └───────────────┘  │
└─────────────────────────────────────────┘
```

A domain module should not directly modify another module's internal persistence structures.

For example:

```text
Dispatch
    ↓
Ride.public API
```

not:

```text
Dispatch
    ↓
RideMongoModel.updateOne(...)
```

The latter breaks the domain boundary.

---

# 16. Configuration vs Transactional Data

Cabzon contains two fundamentally different classes of information.

## Configuration

Changes over time:

```text
CityZone
PricingConfiguration
StatePricing
NegotiationConfiguration
CancellationConfiguration
CommissionConfiguration
```

## Transactional

Represents what actually happened:

```text
Ride
FareNegotiation
Payment
WalletTransaction
Review
Dispute
AuditLog
```

The key rule is:

```text
Mutable Configuration
        │
        ▼
Transaction Creation
        │
        ▼
Immutable Snapshot
```

Never reconstruct historical Ride economics from today's configuration.

---

# 17. Domain Rule: Configuration Versioning

Whenever a configuration changes:

```text
Version 1
   ↓
Version 2
   ↓
Version 3
```

Existing transactions continue referencing the version they used.

Example:

```text
Ride A
pricing_config_version = 17

Admin changes rate

Ride B
pricing_config_version = 18
```

Ride A must not be recalculated using version 18.

---

# 18. Domain Rule: Time

All persisted domain timestamps are UTC.

Examples:

```text
created_at
submitted_at
accepted_at
arrived_at
started_at
completed_at
cancelled_at
settled_at
```

Business-facing rendering may use the configured local timezone.

---

# 19. Domain Rule: Monetary Representation

All monetary values are integer paise.

Example:

```text
₹140.00
=
14000 paise
```

Domain objects must not use:

```text
float
double
```

for money.

---

# 20. Domain Rule: Spatial Representation

External/application representation:

```json
{
  "lat": 26.7271,
  "lng": 88.3953
}
```

GeoJSON representation:

```json
{
  "type": "Point",
  "coordinates": [88.3953, 26.7271]
}
```

The conversion must occur at the geographic infrastructure boundary.

---

# 21. Domain Rule: Historical Immutability

The following must be treated as historical facts once committed:

```text
Ride
├── route snapshot
├── zone classification snapshot
├── pricing snapshot
├── agreed fare
├── negotiation history
├── payment records
└── wallet transactions
```

Corrections should produce new records/events rather than rewriting history.

---

# 22. Explicitly Out of the Current Domain

The MVP domain does not include:

```text
Ride Pooling
Scheduled/Advance Booking
Corporate Accounts
Multi-Stop Rides
```

These are explicitly identified as non-goals in the PRD.

Future features such as:

```text
Promotions
Referrals
Advanced Incentives
Advanced Analytics
```

should not introduce domain entities until their requirements are approved.

---

# 23. Domain Decisions Resolution Status

All **12 🔴 BLOCKING architecture questions** (OQ-001 through OQ-012) are now **DECIDED** per [`decision-log.md`](../decision-log.md) (Decisions D-025 through D-036):

- ✅ **Vehicle-specific pricing (OQ-001 / D-025)**: Independent pricing matrices for `CAB` (active) and `E_RICKSHAW` (coming soon).
- ✅ **Commission calculation (OQ-002 / D-026)**: Percentage of Agreed Fare (`agreed_fare * commission_percent`), captured in ride pricing snapshot.
- ✅ **Buffer-zone configuration (OQ-003 / D-027)**: City zone override with global default fallback, evaluated on trip distance.
- ✅ **Negotiation bounds (OQ-004 / D-028)**: Floor $\max(\text{min\_fare}, 80\% \times \text{suggested})$ and Ceiling $150\% \times \text{suggested}$, 90-second window.
- ✅ **Mid-trip extension (OQ-005 / D-029)**: In-app route recalculation and zone reclassification with mandatory driver confirmation.
- ✅ **Assignment concurrency (OQ-006 / D-030)**: Atomic database state transition in MongoDB with `409 RIDE_ALREADY_ASSIGNED` on race loss.
- ✅ **Ride expiration behavior (OQ-007 / D-031)**: Explicit timeout transition to `EXPIRED` with immutable proposal history.
- ✅ **Cancellation policy (OQ-008 / D-032)**: State-based schedule (free in `REQUESTED`, 2-min grace in `ASSIGNED`, 5-min driver wait in `ARRIVED`).
- ✅ **Cash-payment confirmation (OQ-009 / D-033)**: Driver confirmation marks cash received, real-time rider receipt with dispute flow.
- ✅ **Pricing snapshot/versioning (OQ-010 / D-034)**: Immutable pricing and zone classification snapshot locked at ride creation.
- ✅ **Interstate pricing model (OQ-011 / D-035)**: Route polyline intersected into sequential state segments applying state rates.
- ✅ **Driver eligibility rules (OQ-012 / D-036)**: Simultaneous 10-point check (active, KYC, vehicle match, docs, wallet > 0, online, fresh location, not busy, not suspended).

Remaining items requiring pre-launch finalization (🟡 PRE-LAUNCH in [`open-questions.md`](open-questions.md)):

```text
Trust-score formula (OQ-018)
Vehicle relationship/cardinality (OQ-021)
Driver/admin review SLA (OQ-015)
Document retention policy (OQ-026)
```

These are deliberately not hidden behind arbitrary assumptions.

---

# 24. Domain Model Completion Criteria

This document is considered ready for implementation when:

```text
[ ] Every core business entity has a definition
[ ] Actor responsibilities are defined
[ ] Aggregate boundaries are defined
[ ] Entity relationships are defined
[ ] Core lifecycles are identified
[ ] Domain invariants are numbered
[ ] Enforcement ownership is identified
[ ] Domain events are identified
[ ] Configuration vs transaction data is separated
[ ] Historical snapshot requirements are defined
[ ] Money representation is fixed
[ ] Time representation is fixed
[ ] Geographic representation is fixed
[ ] Blocking open questions are resolved or explicitly accepted as defaults
```

Once this gate is satisfied, the next document should be:

```text
[database-schema.md](database-schema.md)
```

The database schema must implement this domain model rather than independently redefining it.
