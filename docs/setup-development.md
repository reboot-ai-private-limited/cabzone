# Cabzon — Development Setup

**Source:** Cabzon PRD v0.1  
**Status:** Engineering setup framework — technology choices intentionally left open where the PRD is silent.

---

## 1. Purpose

This document defines what must exist for development to begin without inventing technical decisions that are not present in the PRD.

The PRD defines product behavior but does not prescribe the backend framework, mobile framework, database, hosting provider, or repository layout.

Therefore, this document separates:

- **PRD requirements** — mandatory product behavior.
- **Engineering choices** — must be selected by the development team.

---

## 2. Required Applications

The development workspace must support three products:

```text
Cabzon
├── Rider Mobile App
├── Driver Mobile App
└── Admin Web Dashboard
```

### Rider App

Must support:

- Phone + OTP account creation.
- Pickup/drop selection.
- Suggested Fare display.
- Rider Proposed Fare.
- Ride tracking.
- Driver/vehicle information.
- UPI/Cash payment.
- Ratings/reviews.
- Ride history.
- Booking for another passenger.

### Driver App

Must support:

- Driver registration.
- Government ID/DL submission.
- KYC status.
- Application status.
- Online/offline ride availability.
- Ride offers.
- Fare visibility.
- Accept/decline.
- Navigation/ride execution states.
- Live location.
- Wallet and top-up.
- Ride history.
- Ratings/reviews.

### Admin Web Dashboard

Must support:

- Driver application review.
- Accept/reject with reason.
- City polygon management.
- Pricing management.
- State pricing management.
- Dispute handling.
- Ride history.
- Audit trail.
- Role-based access as proposed by the PRD.

---

## 3. External Services Required

The PRD identifies or implies these external service categories:

### KYC

One of:

- Cashfree
- Surepass

Purpose:

- OCR
- Government database matching
- Driver document verification

### Routing

A routing provider such as:

- Google
- Mapbox

Purpose:

- Route distance
- Route polyline
- Interstate/state route segmentation

### Payment

The PRD requires:

- UPI
- Cash

The specific UPI provider is not selected by the PRD.

### Location / Mapping

The product needs map-based city polygons and live driver location. The specific mapping stack is not selected by the PRD.

---

## 4. Configuration That Must Be Admin-Controlled

The system must allow administration of:

- City polygons.
- Base fare.
- Rate/km.
- Minimum fare.
- Included KM.
- Buffer surcharge.
- State-specific rate/km for interstate segments.

The actual buffer distance is still an open product decision.

---

## 5. Required Development Environments

The team should maintain separate environments for:

```text
Development
Staging / Testing
Production
```

The exact infrastructure is an engineering decision not specified by the PRD.

Each environment should have independently configured:

- Database
- KYC credentials
- Routing credentials
- Payment credentials
- Authentication/OTP credentials
- Application secrets

Production credentials must not be committed to source control.

---

## 6. Minimum Development Workflow

### Step 1 — Resolve Open Product Questions

Before implementing pricing and dispatch, resolve:

1. Re-uploaded document verification flow.
2. Buffer-zone distance.
3. Vehicle-specific pricing.
4. Admin review SLA.
5. Commission model.

Also resolve the mid-trip extension flow before production implementation.

### Step 2 — Freeze Product Rules

Document the final values for:

- Negotiation floor.
- Negotiation ceiling.
- Negotiation window.
- Buffer distance.
- Vehicle pricing.
- Commission.
- Cancellation/no-show rules.
- Trust-score formula.
- Reapplication limits/cooldowns.

### Step 3 — Implement Domain Flows

Implement in dependency order:

```text
Authentication
    ↓
Driver onboarding / verification
    ↓
City zones + pricing
    ↓
Fare calculation
    ↓
Ride request
    ↓
Fare negotiation
    ↓
Driver acceptance
    ↓
Ride execution
    ↓
Payment
    ↓
Wallet commission
    ↓
Ratings / reviews / disputes
```

### Step 4 — Add Edge-Case Controls

Test at minimum:

- Pickup exactly near a polygon boundary.
- Pickup outside polygon but short trip inside buffer.
- Outstation trip.
- Interstate route.
- Admin pricing change after ride request.
- Driver wallet reaching zero during active ride.
- Cash payment disagreement.
- Ride for another person.
- Fare below floor.
- Fare above ceiling.
- Negotiation timeout.
- Driver cancellation/no-show.
- Expired driver documents.
- Reapplication.
- GPS spoofing/mock location.
- Retaliatory reviews.

---

## 7. Source-Control Rules

These are engineering hygiene rules, not requirements stated by the PRD:

- Never commit secrets.
- Use environment variables or an approved secret-management system.
- Protect production credentials.
- Use code review before production changes.
- Keep migrations/configuration changes version-controlled.
- Keep product decisions synchronized with the decision log.

---

## 8. Definition of Development Readiness

Development of a module is ready to start when:

1. Its product requirements are unambiguous.
2. Relevant open questions are resolved.
3. Required external service dependencies are selected.
4. Error/edge-case behavior is documented.
5. Test scenarios exist for the critical flows.
6. The implementation choice has been recorded separately from product requirements.

---

## 9. Important Boundary

Do not treat this document as evidence that Cabzon uses a particular stack.

For example, the PRD does **not** say that Cabzon must use:

- Node.js
- MongoDB
- Redis
- WebSockets
- React
- React Native
- Flutter
- Docker
- AWS
- Firebase

Those are engineering decisions that must be made separately.
