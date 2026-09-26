# cabzone — WebSocket Contracts

**Document:** `docs/LLD/websocket-contracts.md`  
**Status:** Draft for Engineering Review  
**Version:** 0.1

## 1. Purpose

Define realtime communication between Rider/Driver clients and the backend.

WebSocket is a realtime transport, not the authoritative source of transactional truth.

The database/domain state remains authoritative.

## 2. Connection

```text
wss://api.example.com/ws
```

Authentication should use the authenticated application session/token.

The server must validate:

- user identity
- session validity
- device/session status
- role

## 3. Event Envelope

```json
{
  "event": "ride.offer.created",
  "eventId": "uuid",
  "timestamp": "2026-09-24T10:00:00Z",
  "data": {},
  "requestId": "uuid"
}
```

## 4. Driver Events

### `driver.status.updated`

```json
{
  "status": "ONLINE"
}
```

### `driver.location.updated`

```json
{
  "lat": 26.7271,
  "lng": 88.3953,
  "heading": 180,
  "speedMps": 8
}
```

Location is high-frequency and should not be persisted synchronously to the primary database on every update.

## 5. Ride Offer Events

### `ride.offer.created`

```json
{
  "rideId": "...",
  "pickup": {
    "lat": 26.7271,
    "lng": 88.3953
  },
  "drop": {
    "lat": 26.744,
    "lng": 88.4
  },
  "proposedFarePaise": 14500,
  "expiresAt": "..."
}
```

### `ride.offer.expired`

```json
{
  "rideId": "..."
}
```

## 6. Assignment Events

### `ride.driver.assigned`

Sent to:

- assigned Driver
- Rider

```json
{
  "rideId": "...",
  "driverId": "...",
  "vehicleId": "..."
}
```

## 7. Ride Lifecycle Events

```text
ride.driver.en_route
ride.driver.arrived
ride.started
ride.completed
ride.cancelled
```

Each payload must include:

```text
rideId
eventId
timestamp
current state
```

## 8. Rider Location Updates

During an active assigned Ride, Rider receives Driver location events.

```text
driver.location.updated
```

The backend should throttle/batch delivery as necessary.

## 9. Reconnection

When a client reconnects:

```text
WebSocket connected
       ↓
authenticate
       ↓
fetch authoritative current state
       ↓
resynchronize
       ↓
resume realtime stream
```

Do not attempt to reconstruct current state solely from missed WebSocket events.

## 10. Duplicate Events

Every event has an `eventId`.

Clients should treat event processing as idempotent.

Example:

```text
same eventId received twice
→ process once
```

## 11. Ordering

Events from the same Ride should include enough metadata to detect stale state.

Recommended:

```text
rideVersion
```

Example:

```json
{
  "rideId": "...",
  "rideVersion": 8,
  "status": "DRIVER_ARRIVED"
}
```

A client must not apply a state update with an older version over a newer state.

## 12. WebSocket Does Not Authorize Transactions

For example:

```text
Driver receives ride.offer.created
        ↓
Driver presses Accept
        ↓
REST/API command
        ↓
Server validates + atomically assigns
```

The WebSocket event itself does not create the assignment.

## 13. FCM Relationship

Use FCM for important notification delivery when the Driver app is backgrounded or the WebSocket is unavailable.

FCM is not the source of truth.

The client must fetch authoritative Ride state after receiving a notification.

## 14. Disconnect Rules

If Driver disconnects:

- Preserve assigned Ride.
- Mark realtime presence stale after timeout.
- Do not automatically cancel the Ride solely because a socket dropped.
- Apply separate operational timeout rules.

## 15. Security

Do not trust client-provided:

```text
ride status
driver assignment
agreed fare
payment state
wallet balance
```

These are server-authoritative.

## 16. Event Inventory

```text
driver.status.updated
driver.location.updated

ride.offer.created
ride.offer.expired
ride.driver.assigned
ride.driver.en_route
ride.driver.arrived
ride.started
ride.completed
ride.cancelled

ride.extension.requested
ride.extension.accepted
ride.extension.rejected

payment.updated
wallet.updated
dispute.updated
```
