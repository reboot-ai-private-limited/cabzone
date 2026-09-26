# cabzone — Negotiation Engine

**Document:** `docs/LLD/negotiation-engine.md`  
**Status:** Draft for Engineering Review  
**Version:** 0.1

## 1. Purpose

Define Rider fare proposals, validation, negotiation windows, Driver acceptance, and immutable negotiation history.

## 2. Fare Roles

```text
Suggested Fare
      ↓
Rider Proposed Fare
      ↓
Driver Accepts
      ↓
Agreed Fare
```

The PRD explicitly defines these three concepts.

## 3. Negotiation State

Conceptually:

```text
OPEN
 │
 ├── RIDER_PROPOSED
 │       │
 │       ├── DRIVER_ACCEPTED → AGREED
 │       │
 │       └── DRIVER_DECLINED → OPEN
 │
 └── EXPIRED
```

The exact Driver counter-offer model is unresolved.

## 4. Offer Validation

Per Decision D-028 ([`decision-log.md`](../decision-log.md#d-028--fare-negotiation-bounds-floor--ceiling)):

Given:

```text
suggested_fare_paise
minimum_fare_paise
negotiation_floor_percent (default: 80%)
negotiation_ceiling_percent (default: 150%)
proposed_fare_paise
```

Calculate bounds in integer paise:

```text
negotiation_floor_paise =
  MAX(minimum_fare_paise, ROUND(suggested_fare_paise × (negotiation_floor_percent / 100)))

negotiation_ceiling_paise =
  ROUND(suggested_fare_paise × (negotiation_ceiling_percent / 100))
```

Invariant validation:

```text
negotiation_floor_paise <= proposed_fare_paise <= negotiation_ceiling_paise
```

If the proposed fare violates either bound:

```text
422 FARE_OUTSIDE_NEGOTIATION_LIMIT
```

## 5. Time Window

Per Decision D-028:

```text
negotiation_window_seconds = 90
```

The server expires broadcast offers after 90 seconds. After expiry:

```text
NEGOTIATION → EXPIRED
```

## 6. Rider Proposal

Server must validate:

- Rider owns Ride.
- Ride is still negotiable.
- Offer has not expired.
- Proposed amount is integer paise.
- Proposed amount is within limits.
- Rider is not exceeding any configured proposal count.

## 7. Driver Acceptance

When Driver accepts:

```text
validate offer
      ↓
atomic Ride assignment
      ↓
Agreed Fare = accepted proposal
      ↓
append FARE_AGREED event
```

Assignment and fare agreement should be handled as one logical transaction.

## 8. History

Every negotiation action is immutable.

Example:

```text
SYSTEM → ₹140 suggested
RIDER  → ₹130
SYSTEM → accepted as valid
DRIVER → declined
RIDER  → ₹145
DRIVER → accepted
```

Never update the previous proposal to hide history.

## 9. Fraud Signals

Persist:

```text
driver_id
rider_id
suggested_fare
proposed_fare
agreed_fare
delta_percent
number_of_attempts
timestamp
```

These values can later feed fraud rules.

The PRD specifically recommends flagging repeated large fare deltas and driver-rider pairs.

## 10. Invariants

- Proposed fare cannot be below configured floor.
- Proposed fare cannot exceed configured ceiling.
- Expired negotiation cannot accept a new proposal.
- Agreed Fare is immutable except through extension.
- Negotiation history is append-only.
- Driver acceptance must be server-authoritative.
