# Cabzone — Ride Lifecycle

**Document:** `docs/LLD/ride-lifecycle.md`  
**Status:** Draft for Engineering Review  
**Version:** 0.1

## 1. Purpose

Define the authoritative Ride state machine, transition guards, actors, side effects, concurrency rules, terminal states, and lifecycle events.

## 2. Ride State Machine

```text
                    ┌─────────────┐
                    │   REQUESTED │
                    └──────┬──────┘
                           │ create succeeds
                           ▼
                    ┌─────────────┐
                    │   OFFERING  │
                    └───┬─────┬───┘
                        │     │
                timeout │     │ driver accepts
                        ▼     ▼
                    EXPIRED  DRIVER_ASSIGNED
                              │
                              ▼
                       DRIVER_EN_ROUTE
                              │
                              ▼
                       DRIVER_ARRIVED
                              │
                              ▼
                         TRIP_STARTED
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
             EXTENSION FLOW       TRIP_COMPLETED
                                        │
                                        ▼
                                PAYMENT_PENDING
                                        │
                                        ▼
                                     SETTLED
```

Cancellation is permitted only from explicitly configured non-terminal states.

## 3. States

### REQUESTED

Ride has been created and validated but dispatch has not started.

### OFFERING

Ride is being offered to eligible drivers.

### DRIVER_ASSIGNED

One driver has successfully won the assignment.

### DRIVER_EN_ROUTE

Assigned driver is travelling to pickup.

### DRIVER_ARRIVED

Driver has reached the pickup area.

### TRIP_STARTED

Passenger has been picked up and trip has started.

### TRIP_COMPLETED

Driver has completed the trip at the agreed destination.

### PAYMENT_PENDING

Trip execution is complete but financial settlement is incomplete.

### SETTLED

Ride financial settlement is complete.

### EXPIRED

No driver accepted within the configured offer window.

### CANCELLED

Ride was cancelled according to a valid cancellation rule.

## 4. Valid Transitions

| From                | To                  | Actor               | Guard                                |
| ------------------- | ------------------- | ------------------- | ------------------------------------ |
| REQUESTED           | OFFERING            | System              | Route/pricing valid                  |
| REQUESTED           | CANCELLED           | Rider/System        | Cancellation allowed                 |
| OFFERING            | DRIVER_ASSIGNED     | Driver/System       | Atomic assignment succeeds           |
| OFFERING            | EXPIRED             | System              | Offer deadline reached               |
| OFFERING            | CANCELLED           | Rider               | Cancellation allowed                 |
| DRIVER_ASSIGNED     | DRIVER_EN_ROUTE     | Driver/System       | Driver starts navigation             |
| DRIVER_ASSIGNED     | CANCELLED           | Rider/Driver/System | Policy permits                       |
| DRIVER_EN_ROUTE     | DRIVER_ARRIVED      | Driver/System       | Arrival criteria satisfied           |
| DRIVER_EN_ROUTE     | CANCELLED           | Rider/Driver/System | Policy permits                       |
| DRIVER_ARRIVED      | TRIP_STARTED        | Driver              | Pickup verification succeeds         |
| DRIVER_ARRIVED      | CANCELLED           | Driver/System       | No-show policy                       |
| TRIP_STARTED        | TRIP_COMPLETED      | Driver/System       | Completion validation succeeds       |
| TRIP_STARTED        | EXTENSION_REQUESTED | Rider               | Extension requested                  |
| EXTENSION_REQUESTED | TRIP_STARTED        | Driver              | Extension rejected                   |
| EXTENSION_REQUESTED | TRIP_STARTED        | Driver              | Extension accepted after fare update |
| TRIP_COMPLETED      | PAYMENT_PENDING     | System              | Trip completed                       |
| PAYMENT_PENDING     | SETTLED             | System              | Payment settled                      |

## 5. Forbidden Transitions

Examples:

```text
REQUESTED → TRIP_STARTED
EXPIRED → DRIVER_ASSIGNED
CANCELLED → DRIVER_ASSIGNED
CANCELLED → TRIP_STARTED
SETTLED → TRIP_STARTED
TRIP_COMPLETED → TRIP_STARTED
```

The backend must reject invalid transitions regardless of client state.

## 6. Ride Creation

1. Authenticate Rider.
2. Validate pickup and destination.
3. Validate passenger information.
4. Resolve route.
5. Classify zone.
6. Load applicable pricing.
7. Create immutable pricing snapshot.
8. Calculate Suggested Fare.
9. Create Ride in `REQUESTED`.
10. Emit `RIDE_CREATED`.
11. Start dispatch.
12. Transition to `OFFERING`.

## 7. Driver Assignment

Assignment must be atomic.

Conceptually:

```text
UPDATE ride
SET driver_id = driver,
    status = DRIVER_ASSIGNED,
    accepted_at = now()
WHERE ride_id = X
AND status = OFFERING
AND driver_id IS NULL
```

If exactly one record changes, assignment succeeds.

If zero records change:

```text
RIDE_ALREADY_ASSIGNED
```

## 8. Driver En Route

Driver explicitly starts navigation/approach.

System validates:

- Driver owns assignment.
- Ride is `DRIVER_ASSIGNED`.
- Driver is active.
- Ride has not expired/cancelled.

Transition:

```text
DRIVER_ASSIGNED → DRIVER_EN_ROUTE
```

## 9. Driver Arrived

Arrival should be determined using location plus a configurable pickup tolerance.

The exact tolerance remains a product/operations decision.

The PRD recommends special handling near geographic boundaries because GPS can be inaccurate.

## 10. Trip Start

Trip start requires:

- Ride is `DRIVER_ARRIVED`.
- Correct driver.
- Correct vehicle.
- Pickup verification where required.
- Passenger confirmation/OTP for third-party rides.

Transition:

```text
DRIVER_ARRIVED → TRIP_STARTED
```

## 11. Mid-Trip Extension

Per Decision D-029 ([`decision-log.md`](../decision-log.md#d-029--mid-trip-extension-workflow)):

```text
TRIP_STARTED
      ↓
Rider requests extension in-app to new destination
      ↓
Routing engine calculates additional route distance
      ↓
Zone classification re-run (in-city / outstation / interstate)
      ↓
Additional fare calculated using captured pricing snapshot
      ↓
Driver receives in-app extension prompt with fare delta
      ↓
[DRIVER CONFIRMS] ─── YES ──→ Extension accepted, added fare committed, RIDE_EXTENDED emitted
      │
      └─── NO ───────────────→ Extension rejected, original agreed fare and destination remain binding
```

Key rules:

- Both parties must see the additional fare before acceptance.
- Rider can request multiple sequential extensions.
- When rejected, the trip continues under its original agreed fare.

## 12. Trip Completion

The Driver submits completion.

Backend verifies:

- Correct assigned Driver.
- Ride is `TRIP_STARTED`.
- Valid destination/completion conditions.
- Final route/extension information is recorded.

Then:

```text
TRIP_STARTED
→ TRIP_COMPLETED
→ PAYMENT_PENDING
```

## 13. Payment Settlement

Payment behavior depends on method.

### UPI

```text
PAYMENT_PENDING
→ provider confirmation
→ PAYMENT_CONFIRMED
→ SETTLED (Commission debited from driver wallet, D-026)
```

### Cash

Per Decision D-033 ([`decision-log.md`](../decision-log.md#d-033--cash-payment-confirmation--dispute-workflow)):

```text
PAYMENT_PENDING
→ Driver collects physical cash and confirms (DRIVER_MARKS_CASH_RECEIVED)
→ PAYMENT_CONFIRMED
→ SETTLED (Commission debited from driver wallet, D-026)
```

Rider protection workflow:

- The rider sees the payment confirmation in their app in real-time.
- If disputed, the rider can trigger "Dispute Payment", transitioning the ride to `PAYMENT_DISPUTED` and creating an audit `Dispute` record for admin resolution.

## 14. Cancellation

Per Decision D-032 ([`decision-log.md`](../decision-log.md#d-032--state-based-cancellation--no-show-policy)):

Cancellation policy is strictly state-specific:

```text
REQUESTED / OFFERING
→ Free cancellation for rider (zero fee)

DRIVER_ASSIGNED / DRIVER_EN_ROUTE
→ Free within 2-minute grace period; cancellation after grace period incurs cancellation fee

DRIVER_ARRIVED
→ No-show policy applies (5-minute driver wait period)

TRIP_STARTED
→ Cannot be unilaterally cancelled; early drop-off becomes trip termination / dispute flow
```

Cancellation fees incurred by the rider are split: fuel/time compensation credited to the driver, remainder to the platform.

## 15. No-Show

Per Decision D-032:

```text
DRIVER_ARRIVED
      ↓
Wait minimum configured duration (5 minutes)
      ↓
Passenger absent
      ↓
Driver initiates no-show (DRIVER_REPORTS_NO_SHOW)
      ↓
System validates driver location and elapsed wait time
      ↓
CANCELLED (with no-show cancellation penalty fee)
```

## 16. Events

Every transition emits an append-only event.

Example:

```text
RIDE_CREATED
RIDE_OFFERING_STARTED
DRIVER_ASSIGNED
DRIVER_EN_ROUTE
DRIVER_ARRIVED
TRIP_STARTED
TRIP_COMPLETED
PAYMENT_PENDING
PAYMENT_CONFIRMED
RIDE_SETTLED
```

## 17. Lifecycle Invariants

- One Ride has at most one assigned Driver.
- Terminal states cannot transition back into active trip states.
- Agreed Fare cannot be changed except through the extension workflow.
- Pricing snapshot cannot be modified.
- Wallet balance cannot terminate an active ride.
- Payment settlement cannot happen twice.
- Every state transition is auditable.
