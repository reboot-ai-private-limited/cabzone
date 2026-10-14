# Cabzon Driver App — Technical Specification v1

**Status:** Draft for implementation  
**Scope:** Driver mobile application only  
**AI/GenAI:** Explicitly out of scope for v1  
**Source basis:** Current Cabzon PRD and existing backend architecture decisions

## 1. Purpose

This document defines the functional and technical requirements for the Cabzon Driver App.

The Driver App is responsible for authentication, KYC/onboarding visibility, driver profile and vehicle information, online/offline availability, location transmission, ride opportunities, ride acceptance, trip execution, OTP-based trip start, ride completion, payment confirmation, wallet/earnings visibility, realtime communication, push notifications, and reconnect/state reconciliation.

The backend remains the authoritative source of truth. The mobile application must never independently determine final fare, driver eligibility, ride winner, ride state, commission, serviceability, wallet balance, or pricing.

## 2. Product Scope

The MVP supports City Ride and Outstation. Vehicle/service eligibility is determined by the backend. The Driver App displays only rides for which the driver is eligible.

## 3. Driver Lifecycle

```text
Authenticate
  ↓
Complete onboarding/KYC
  ↓
KYC approved
  ↓
Vehicle eligible
  ↓
Wallet eligible
  ↓
Location available/fresh
  ↓
OFFLINE
  ↓
ONLINE
  ↓
Receive ride opportunity
  ↓
Accept
  ↓
Navigate to pickup
  ↓
ARRIVED
  ↓
OTP verification
  ↓
IN_TRANSIT
  ↓
COMPLETED
  ↓
Payment confirmation
  ↓
Wallet/earnings updated
```

## 4. Driver State Model

State dimensions remain independent.

### KYC

```text
PENDING_REVIEW
APPROVED
REJECTED
```

### Availability

```text
ONLINE
OFFLINE
```

### Trip

```text
AVAILABLE
RIDE_ASSIGNED
EN_ROUTE
ARRIVED
IN_TRANSIT
```

### Location

```text
FRESH
STALE
UNAVAILABLE
```

The backend determines eligibility.

## 5. Authentication

Use the existing Cabzon authentication architecture:

- Login
- Access-token handling
- Refresh-token handling
- Logout
- Session expiration
- Reauthentication when required

Tokens must use platform-secure storage. API authorization is server-side.

## 6. Driver Onboarding / KYC

Current architecture identifies:

- Driving Licence
- RC
- Selfie

Primary flow:

```text
PENDING_REVIEW
      ↓
APPROVED
```

The app displays KYC state and backend-provided rejection reasons where available. It never approves/rejects KYC locally. Sensitive documents must be securely transmitted and not unnecessarily cached.

## 7. Driver Profile

Display:

- Name
- Phone
- Profile information
- KYC status
- Vehicle
- Registration
- Vehicle/service type
- Account status

Editing is controlled by backend permissions and product rules.

Implementation note (2026-10-13): personal-information Continue saves through authenticated `POST /api/v1/driver/profile` before advancing. First and last names become the existing `name` field; display DOB `DD/MM/YYYY` becomes `dateOfBirth` in `YYYY-MM-DD`; `gender` is `MALE`, `FEMALE` or `OTHER`. These values reload from `GET /api/v1/driver/profile/me`.

Profile photos use `profilePhotoDataUrl` as upload input (JPEG/PNG, at most 600 KB). The server signs an upload using its existing Cloudinary credentials and stores the returned `profilePhotoUrl` in Mongo. Client file URIs and arbitrary remote photo URLs are rejected. Omitted photo input preserves the photo; `null` clears the reference. Camera/library selection follows the [Expo SDK 57 ImagePicker API](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/); server authentication follows [Cloudinary signed uploads](https://cloudinary.com/documentation/upload_images#generating_authentication_signatures). The final photo step also captures and saves a real image. Replaced or removed image assets currently require storage cleanup; document verification and face verification are separate capabilities.

Driving licences are selected with the [Expo SDK 57 DocumentPicker API](https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/) and must be PDF, JPG or JPEG, at most 500 KB. The client checks the file before sending; `POST /api/v1/driver/documents/license` checks decoded size, MIME type and file signature again, computes SHA-256 on the server, uploads to Cloudinary as an authenticated raw asset and saves the storage key on the driver's draft application. The older metadata-only document endpoint rejects driving licences. The development app fills a sample DL number only when no saved number exists; users still must select a real file. Admin document preview, expiry capture, and storage cleanup for replaced files remain separate work.

OTP login always uses the backend, including development fixed OTPs; fabricated local tokens are removed. Authenticated-user details are stored with the session because the backend refresh response contains tokens only. Existing installations without the stored user must sign in once again.

## 8. Home / Availability

### OFFLINE

```text
OFFLINE
Today's earnings
Today's completed rides
[ GO ONLINE ]
```

### ONLINE

```text
ONLINE
Searching for rides...
Today's earnings
Today's completed rides
[ GO OFFLINE ]
```

Going online is a backend command. The backend validates KYC, vehicle, wallet eligibility, location freshness, current ride, and other eligibility rules.

The app displays backend failure reasons.

Going offline is also backend-controlled. An active ride may prevent the operation depending on backend policy.

## 9. Location

Current architecture targets approximately:

- Foreground/in-trip: 3–4 seconds
- Android background: approximately 15 seconds via Foreground Service

The driver sees the required persistent Android foreground-service notification.

If Android kills the application/service, reliable location stops. The backend must not treat the driver as actively available indefinitely; stale-location policy determines eligibility.

A location update conceptually contains:

```ts
{
  (driverId, latitude, longitude, accuracy, heading, speed, timestamp);
}
```

Authenticated identity should be preferred over arbitrary client-supplied driver IDs.

## 10. Realtime Communication

### Primary

WebSocket / Socket.IO for:

- New ride opportunities
- Acceptance results/events
- Ride-taken events
- Ride state updates
- Relevant realtime communication

### Fallback

Firebase Cloud Messaging (FCM) for background notification/wake-up when WebSocket is unavailable.

FCM is not the business-state source of truth.

Reconnect flow:

```text
Reconnect
  ↓
Authenticate
  ↓
Fetch authoritative state
  ↓
Reconcile local UI
```

## 11. Ride Opportunity

Ride offers should expose enough information for a fast decision:

- Pickup
- Drop
- Pickup distance
- Route distance
- Estimated duration
- Service type
- Route scope where applicable
- Rider proposed/agreed offer
- Relevant estimated toll information where applicable

Fare values come from backend quote/ride data. The app does not recalculate fare.

## 12. First-to-Accept

Cabzon MVP uses first successful atomic claim.

```text
SEARCHING
   ↓
Driver A accepts
Driver B accepts
Driver C accepts
   ↓
Backend atomic claim
   ↓
Exactly one winner
```

The app submits an accept command. The backend determines the winner. A late claimant can receive an authoritative conflict such as HTTP 409 and the UI removes the unavailable offer.

## 13. Ride Lifecycle

Primary lifecycle:

```text
SEARCHING
    ↓
ACCEPTED
    ↓
ARRIVED
    ↓
IN_TRANSIT
    ↓
COMPLETED
```

Only SEARCHING is claimable. After acceptance, the agreed fare is locked.

The mobile app requests transitions; the backend validates and commits them.

## 14. Accepted Ride

After successful acceptance:

```text
Ride accepted
  ↓
Show active trip
  ↓
Navigate to pickup
```

An active ride must be recoverable from the backend after app restart.

## 15. Navigation

Provide navigation actions for:

```text
Driver → Pickup
Pickup → Destination
```

Navigation UI is not proof of a backend ride-state transition.

## 16. ARRIVED

The driver submits an arrival command. Backend validation determines whether:

```text
EN_ROUTE
   ↓
ARRIVED
```

is permitted.

## 17. Trip Start OTP

Current architecture uses a 4-digit OTP:

```text
ARRIVED
  ↓
Rider provides OTP
  ↓
Driver enters OTP
  ↓
Backend verifies
  ↓
IN_TRANSIT
```

OTP validity is server-side.

Still-open production configuration includes expiry, maximum attempts, regeneration, and lockout behavior unless finalized elsewhere.

## 18. IN_TRANSIT

After backend confirmation:

- Show destination
- Show navigation/trip progress
- Show agreed fare
- Continue location transmission
- Show completion action

## 19. Complete Ride

The driver submits completion. Backend validates ride, driver, lifecycle state, and required completion conditions.

```text
IN_TRANSIT
    ↓
COMPLETED
```

The agreed fare remains authoritative.

## 20. Rider Payment

MVP rider settlement is directly to the driver:

- Cash
- Driver personal UPI QR

The app records/acknowledges the applicable payment method according to the backend contract. It must not claim a payment was received without the appropriate backend confirmation.

## 21. Wallet

The driver app exposes:

- Wallet balance
- Transaction history

Transaction types can include:

```text
RECHARGE
COMMISSION
ADJUSTMENT
REFUND
```

Balance is authoritative backend/ledger data.

## 22. Commission

Current agreed Cabzon architecture:

```text
8% of completed ride fare
```

Commission is charged after successful completion.

Example:

```text
Completed fare = ₹1,000
Commission = ₹80
Driver wallet debit = ₹80
```

Commission deduction must be idempotent. Retrying completion must never create a duplicate commission.

## 23. Earnings

Expose:

- Today's earnings
- Completed rides
- Recent earnings

Financial values come from backend ride/wallet data.

## 24. Ride History

Show:

- Date/time
- Pickup
- Destination
- Service
- Status
- Agreed fare
- Payment method where available

Historical data comes from the backend.

## 25. Cancellation

Support backend-defined flows for:

- Rider cancellation
- Driver cancellation
- Cancellation after acceptance
- No-show

Exact penalties and waiting-time policy remain product decisions unless finalized. The app displays backend results/reasons.

## 26. Push Notifications

Possible notifications:

```text
New ride
Ride taken
Ride cancelled
Ride state changed
KYC status
Wallet-related event
```

Notification payloads are not authoritative. On opening, the app fetches current backend state.

## 27. Offline / Reconnect

Handle:

- Network loss
- WebSocket disconnect
- Backgrounding
- Android process restart
- Duplicate events
- Out-of-order events
- Late FCM delivery

Recovery:

```text
Authenticate
  ↓
Connect WebSocket
  ↓
Fetch current driver state
  ↓
Fetch active ride
  ↓
Fetch relevant offers
  ↓
Update UI
```

## 28. Startup Recovery

On startup determine:

```text
Authenticated?
KYC status?
Availability?
Active ride?
Wallet state?
Realtime connection?
Location permission/service?
```

If an active ride exists, restore the active ride instead of showing an empty home state.

## 29. Permissions

Potential permissions:

- Location
- Background/foreground location capability
- Notifications where applicable
- Camera/storage where document/profile workflows require them

Request permissions contextually and explain why location is required.

## 30. Error Handling

Business errors include:

```text
Ride already taken
Driver not eligible
Wallet insufficient
KYC pending
Ride completed
Invalid OTP
Ride cancelled
```

Network/device errors include:

```text
No internet
Timeout
WebSocket disconnected
Server unavailable
Location disabled
Permission denied
Foreground service stopped
Notifications disabled
```

Backend error codes remain authoritative.

## 31. Security

The app must:

- Use authenticated API calls
- Use secure token storage
- Never trust client authorization
- Never trust client-calculated fares
- Never trust client wallet balances
- Never trust client ride transitions
- Avoid logging tokens or sensitive KYC data
- Use TLS
- Protect sensitive session data

## 32. Suggested Navigation

```text
Driver App
│
├── Home
│   ├── Offline
│   ├── Online
│   ├── Ride Offer
│   └── Active Ride
│
├── Rides
│   ├── Current
│   └── History
│
├── Earnings
│   ├── Summary
│   ├── Wallet
│   └── Transactions
│
└── Profile
    ├── Personal Details
    ├── Vehicle
    ├── KYC
    ├── Documents
    └── Settings
```

## 33. Logical API Contract Categories

These are contract categories to reconcile with the existing backend; they are not claims that every path already exists.

### Auth

```text
POST /auth/login
POST /auth/refresh
POST /auth/logout
```

### Driver

```text
GET /driver/me
GET /driver/status
```

### Availability

```text
POST /driver/online
POST /driver/offline
```

### Location

```text
POST /driver/location
```

### Rides

```text
GET /driver/rides/current
GET /driver/rides/history

POST /rides/:rideId/accept
POST /rides/:rideId/arrive
POST /rides/:rideId/start
POST /rides/:rideId/complete
POST /rides/:rideId/cancel
```

### Wallet/Earnings

```text
GET /driver/wallet
GET /driver/wallet/transactions
GET /driver/earnings
```

## 34. Logical Realtime Events

Potential event categories:

```text
ride.offer.created
ride.offer.expired
ride.taken
ride.cancelled
ride.updated
ride.status_changed
wallet.updated
driver.status_changed
```

Final event names must match the backend contract.

Events should have an identifier, type, entity ID, server timestamp, and version/sequence where applicable. Client handling must tolerate duplicates.

## 35. Client State

Separate server state from local UI state.

### Server state

- Driver profile
- KYC
- Wallet
- Active ride
- Ride offers
- Backend availability

### Local UI state

- Screen
- Modal
- Loading
- Form input
- Temporary presentation state

Server state always wins.

## 36. Observability

Useful non-sensitive telemetry:

```text
app_started
login_success
login_failed
location_permission_changed
location_service_started
location_service_stopped
websocket_connected
websocket_disconnected
ride_offer_received
ride_accept_started
ride_accept_success
ride_accept_conflict
ride_arrived
otp_verification_success
otp_verification_failed
ride_started
ride_completed
```

Never log access/refresh tokens or full sensitive KYC documents.

## 37. Testing

### Unit

- State rendering
- API handling
- Error mapping
- Realtime events
- Duplicate event handling

### Integration

```text
Login
 ↓
Online
 ↓
Offer
 ↓
Accept
 ↓
Arrive
 ↓
OTP
 ↓
Start
 ↓
Complete
 ↓
Wallet update
```

### Failure tests

- Accept after another driver wins
- Network loss during accept
- WebSocket disconnect
- Late FCM
- App restart during active ride
- Location permission revoked
- Location service stopped
- Invalid OTP
- Duplicate completion
- Duplicate commission
- Wallet becoming ineligible
- Offline attempt during active ride

## 38. MVP Acceptance Criteria

The MVP is acceptable when:

- Authentication and session recovery work.
- KYC state is visible and unapproved drivers cannot receive normal rides.
- Eligible drivers can go online/offline.
- Foreground/background location works according to policy.
- Stale location prevents inappropriate dispatch.
- Ride offers arrive through realtime/fallback mechanisms.
- Only one concurrent claimant wins.
- ARRIVED, OTP, IN_TRANSIT and COMPLETED work through backend validation.
- Payment method can be recorded according to the backend contract.
- Completed-ride commission is reflected exactly once.
- Wallet/earnings are visible.
- Active rides survive app restart.
- Reconnect reconciles authoritative state.
- Security-sensitive data is protected.
- Integration/failure tests pass.

## 39. Open Product/Engineering Decisions

Do not invent values for:

1. OTP expiry
2. OTP attempt limit
3. OTP regeneration
4. Driver cancellation penalties
5. Rider cancellation penalties
6. No-show/waiting-time policy
7. Wallet minimum/recharge threshold
8. Wallet behavior during an active ride if balance becomes insufficient
9. Stale-location timeout
10. Final location-frequency tuning
11. Notification priority/UX
12. Navigation provider
13. Final API paths
14. Final realtime event names
15. Mobile framework/project structure

## 40. Implementation Order

```text
Phase 1
Authentication
Driver profile
KYC state
Vehicle
        ↓
Phase 2
Home
Online/offline
Location
        ↓
Phase 3
WebSocket
FCM
Ride offers
Atomic acceptance
        ↓
Phase 4
Active ride
ARRIVED
OTP
IN_TRANSIT
COMPLETED
        ↓
Phase 5
Payment confirmation
Wallet
Commission
Earnings
        ↓
Phase 6
Reconnect
Recovery
Errors
Permissions
Hardening
        ↓
Phase 7
Integration / failure testing
```

## 41. Definition of Done

The Driver App is complete when:

- UI reflects authoritative backend state.
- Ride claiming is server-controlled.
- Realtime failures are recoverable.
- Active rides survive app restart.
- Location lifecycle works correctly.
- OTP cannot be bypassed.
- Financial values come from backend records.
- Duplicate commands are safely handled.
- Push notifications are treated as delivery mechanisms, not truth.
- Sensitive data is protected.
- The full driver lifecycle passes integration testing.

## 42. Architectural Principle

The Driver App is a client of the Cabzon backend, not a second business-logic engine.

```text
                 CABZON BACKEND
                       │
          ┌────────────┼────────────┐
          │            │            │
       REST/API     WebSocket       FCM
          │            │            │
          └────────────┼────────────┘
                       ↓
                 DRIVER APP
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
      Home           Rides         Earnings
                       │
                       ↓
                 Driver actions
                       │
                       ↓
                 Backend command
                       │
                       ↓
             Authoritative result
```

**Version:** 1.0  
**AI/GenAI:** Excluded  
**Status:** Ready for review before implementation
