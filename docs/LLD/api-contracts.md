# Cabzone — API Contracts

**Document:** `docs/LLD/api-contracts.md`  
**Status:** Draft for Engineering Review  
**Version:** 0.1

## 1. API Conventions

Base:

```text
/v1
```

Authentication:

```http
Authorization: Bearer <access-token>
```

Request correlation:

```http
X-Request-Id: <uuid>
```

Idempotency for retryable mutations:

```http
Idempotency-Key: <unique-key>
```

## 2. Success Envelope

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Ride created",
  "data": {},
  "request": {
    "requestId": "..."
  }
}
```

## 3. Error Envelope

```json
{
  "success": false,
  "statusCode": 409,
  "code": "RIDE_ALREADY_ASSIGNED",
  "message": "This ride has already been assigned.",
  "data": {},
  "request": {
    "requestId": "..."
  }
}
```

## 4. Error Code Rules

Codes are stable machine-readable identifiers.

Examples:

```text
AUTH_INVALID_OTP
AUTH_SESSION_REVOKED
DRIVER_NOT_ELIGIBLE
RIDE_NOT_FOUND
RIDE_ALREADY_ASSIGNED
INVALID_RIDE_TRANSITION
RIDE_OFFER_EXPIRED
FARE_OUTSIDE_NEGOTIATION_LIMIT
FARE_ALREADY_AGREED
PRICING_SNAPSHOT_IMMUTABLE
INSUFFICIENT_WALLET_BALANCE
PAYMENT_NOT_CONFIRMED
DUPLICATE_REQUEST
FORBIDDEN
```

## 5. Auth Endpoints

### POST `/v1/auth/otp/request`

Request:

```json
{
  "phone": "+91XXXXXXXXXX"
}
```

### POST `/v1/auth/otp/verify`

```json
{
  "phone": "+91XXXXXXXXXX",
  "otp": "123456",
  "deviceId": "..."
}
```

Returns access/refresh session information.

## 6. Rider Endpoints

### GET `/v1/riders/me`

Returns current Rider profile.

### PATCH `/v1/riders/me`

Updates allowed profile fields.

### GET `/v1/rides`

Returns Rider's ride history.

## 7. Ride Quote

### POST `/v1/rides/quote`

Request:

```json
{
  "pickup": {
    "lat": 26.7271,
    "lng": 88.3953
  },
  "drop": {
    "lat": 26.744,
    "lng": 88.4
  },
  "vehicleCategory": "CAB"
}
```

> **Vehicle Category Support (D-025)**: Supported categories are `"CAB"` (active at launch) and `"E_RICKSHAW"` (coming soon). Omission or querying `GET /v1/rides/quotes` returns quotes across available vehicle categories.

Response:

```json
{
  "quoteId": "...",
  "available": true,
  "zone": "IN_CITY",
  "vehicleCategory": "CAB",
  "distanceM": 6200,
  "suggestedFarePaise": 14000,
  "negotiation": {
    "floorPaise": 11200,
    "ceilingPaise": 21000
  },
  "expiresAt": "..."
}
```

A quote is not itself a Ride unless the product flow explicitly makes it so.

## 8. Ride Creation

### POST `/v1/rides`

Request:

```json
{
  "pickup": {
    "lat": 26.7271,
    "lng": 88.3953
  },
  "drop": {
    "lat": 26.744,
    "lng": 88.4
  },
  "vehicleCategory": "CAB",
  "passenger": {
    "name": "Passenger",
    "phone": "+91XXXXXXXXXX"
  },
  "proposedFarePaise": 14000
}
```

Requires idempotency.

## 9. Fare Proposal

### POST `/v1/rides/{rideId}/fare-proposals`

```json
{
  "amountPaise": 14500
}
```

Possible errors:

```text
422 FARE_OUTSIDE_NEGOTIATION_LIMIT
409 FARE_ALREADY_AGREED
409 RIDE_NOT_NEGOTIABLE
409 RIDE_OFFER_EXPIRED
```

## 10. Ride Cancellation

### POST `/v1/rides/{rideId}/cancel`

```json
{
  "reasonCode": "RIDER_CHANGED_MIND"
}
```

Server calculates any applicable cancellation fee.

## 11. Driver Endpoints

### GET `/v1/drivers/me`

### PATCH `/v1/drivers/me/status`

```json
{
  "status": "ONLINE"
}
```

### GET `/v1/drivers/rides/current`

Returns current assigned Ride.

### POST `/v1/rides/{rideId}/accept`

Requires idempotency.

The server must perform atomic assignment.

### POST `/v1/rides/{rideId}/arrive`

Transitions:

```text
DRIVER_EN_ROUTE → DRIVER_ARRIVED
```

### POST `/v1/rides/{rideId}/start`

Transitions:

```text
DRIVER_ARRIVED → TRIP_STARTED
```

### POST `/v1/rides/{rideId}/complete`

Transitions:

```text
TRIP_STARTED → TRIP_COMPLETED
```

## 12. Extension

### POST `/v1/rides/{rideId}/extensions`

```json
{
  "drop": {
    "lat": 26.75,
    "lng": 88.41
  }
}
```

### POST `/v1/rides/{rideId}/extensions/{extensionId}/accept`

Driver confirms.

## 13. Wallet

### GET `/v1/drivers/me/wallet`

### POST `/v1/drivers/me/wallet/topups`

```json
{
  "amountPaise": 50000
}
```

### GET `/v1/drivers/me/wallet/transactions`

## 14. Reviews

### POST `/v1/rides/{rideId}/reviews`

```json
{
  "rating": 5,
  "reviewText": "..."
}
```

## 15. Disputes

### POST `/v1/rides/{rideId}/disputes`

```json
{
  "category": "FARE",
  "description": "..."
}
```

## 16. Admin

Administrative APIs must enforce RBAC.

Examples:

```text
GET  /v1/admin/driver-applications
POST /v1/admin/driver-applications/{id}/approve
POST /v1/admin/driver-applications/{id}/reject

GET  /v1/admin/zones
POST /v1/admin/zones
PATCH /v1/admin/zones/{id}

GET  /v1/admin/pricing
POST /v1/admin/pricing
POST /v1/admin/pricing/{id}/publish

GET /v1/admin/rides
GET /v1/admin/disputes
POST /v1/admin/disputes/{id}/resolve
```

## 17. Expected Non-Availability

Business non-availability is not necessarily an HTTP error.

Example:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Service availability checked",
  "data": {
    "available": false,
    "reason": "NO_ELIGIBLE_DRIVERS"
  },
  "request": {
    "requestId": "..."
  }
}
```

## 18. API Invariants

- Client cannot directly set Ride state.
- Client cannot set Agreed Fare arbitrarily.
- Client cannot assign a Driver.
- Idempotent mutations must not duplicate effects.
- Error codes remain stable.
- Request IDs appear in logs and responses.
