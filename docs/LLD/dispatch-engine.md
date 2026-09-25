# Cabzon — Dispatch Engine

**Document:** `docs/LLD/dispatch-engine.md`  
**Status:** Draft for Engineering Review  
**Version:** 0.1

## 1. Purpose

Define how Cabzon finds eligible Drivers, offers Rides, handles concurrent acceptance, retries, expiration, and assignment.

## 2. Dispatch Flow

```text
Ride created
    ↓
Eligibility filter
    ↓
Geo proximity filter
    ↓
Driver ranking
    ↓
Offer generation
    ↓
Realtime delivery
    ↓
Driver acceptance
    ↓
Atomic assignment
    ↓
Ride assigned
```

## 3. Driver Eligibility

A Driver is eligible when:

```text
ACTIVE
+
KYC verified
+
required documents valid
+
approved vehicle
+
ONLINE
+
recent location
+
wallet eligible
+
not already assigned
+
not suspended
```

The PRD requires wallet balance to prevent acceptance of new rides when balance is non-positive.

## 4. Location Source

Realtime driver location should use:

```text
Driver Android
    ↓
WebSocket
    ↓
Backend location gateway
    ↓
Redis
```

Redis stores current location for hot-path proximity queries.

Persistent location history is optional and should be retention-controlled.

## 5. Candidate Search

Candidate filtering considers:

```text
driver status (ONLINE, not SUSPENDED)
KYC verification (APPROVED)
vehicle category match (CAB vs E_RICKSHAW, per D-025)
wallet eligibility (balance_paise > 0)
location freshness (recent ping in Redis)
current ride assignment (not already busy)
city/zone constraints
```

Per [`decision-log.md`](../decision-log.md#d-025--vehicle-category-pricing--initial-fleet-types) (D-025), a ride request specifies the requested vehicle category (`CAB` active, `E_RICKSHAW` staged as coming soon). Candidate drivers must operate a verified vehicle strictly matching the requested category. Drivers operating a `CAB` will not receive `E_RICKSHAW` offers, and vice versa.

## 6. Ranking

Initial ranking should be deterministic.

Candidate ranking may use:

```text
distance to pickup
location freshness
vehicle compatibility
operational status
```

Do not initially use opaque ML ranking.

## 7. Offer

A Ride offer contains:

```text
ride_id
pickup
destination
vehicle requirement
proposed fare
offer expiry
```

The Driver sees the proposed fare before accepting, consistent with the PRD.

## 8. Offer Delivery

Primary:

```text
WebSocket
```

Fallback/notification:

```text
FCM
```

FCM is not the authoritative ride state.

The Driver must fetch/validate the current Ride from the backend before accepting.

## 9. Concurrent Acceptance

Critical rule:

```text
Driver A ─┐
          ├── accept
Driver B ─┘
```

Only one may succeed.

Use atomic conditional assignment:

```text
UPDATE ride
WHERE status = OFFERING
AND driver_id IS NULL
```

Success:

```text
1 row changed
```

Failure:

```text
0 rows changed
→ RIDE_ALREADY_ASSIGNED
```

## 10. Offer Expiration

Every offer has an expiry.

Expired offers cannot be accepted.

The server must check:

```text
current_time < offer_expiry
```

before assignment.

## 11. Driver Disconnect

If WebSocket disconnects:

- Driver is marked stale after a configured threshold.
- New offers should not be sent after the driver becomes ineligible.
- Existing Ride assignment remains authoritative.
- Driver may reconnect and resynchronize state.

## 12. Dispatch Retry

If a driver declines or the offer expires:

```text
next eligible candidate
```

is selected.

Do not create a new Ride merely because dispatch failed.

## 13. Dispatch Exhaustion

When no eligible Driver remains:

```text
Ride remains OFFERING
```

until the configured deadline.

After expiry:

```text
OFFERING → EXPIRED
```

The Rider may then submit a new offer/request according to product rules.

## 14. Driver Acceptance

Server validation:

```text
authenticated driver
+
driver owns active session
+
driver eligible
+
ride OFFERING
+
offer not expired
+
driver not busy
+
wallet eligible
```

Then atomically assign.

## 15. Dispatch Events

```text
DISPATCH_STARTED
DRIVER_OFFERED
DRIVER_DECLINED
DRIVER_OFFER_EXPIRED
DRIVER_ACCEPTANCE_RECEIVED
DRIVER_ASSIGNED
DISPATCH_EXHAUSTED
```

## 16. Invariants

- One Ride can have only one assigned Driver.
- Expired offers cannot be accepted.
- Client-side state cannot authorize assignment.
- FCM delivery does not establish assignment.
- WebSocket connection state does not establish assignment.
- Database state is authoritative.
