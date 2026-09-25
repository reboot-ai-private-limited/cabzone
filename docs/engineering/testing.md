# Testing Strategy

## Testing Pyramid

```text
          E2E
         /      Integration
       /        Unit Tests
```

## Unit Tests

Prioritize deterministic business rules:

- Fare calculation
- Negotiation bounds
- Zone classification
- Ride state transitions
- Wallet eligibility
- Commission calculation
- Trust-score calculation once finalized

## Integration Tests

Test:

- Database repositories
- Routing adapter
- KYC adapter
- Payment adapter
- Authentication flows
- Realtime infrastructure

Use provider test/sandbox environments where available.

## E2E Tests

Critical flows:

### Rider

```text
Login
→ Pickup/drop
→ Fare
→ Offer
→ Driver acceptance
→ Ride
→ Payment
→ Review
```

### Driver

```text
Signup
→ KYC
→ Admin approval
→ Online
→ Ride offer
→ Accept
→ Trip
→ Payment/wallet
→ Review
```

### Admin

```text
Login
→ Driver review
→ Zone update
→ Pricing update
→ Dispute review
→ Audit
```

## Edge Cases

Tests must cover:

- Negotiation floor/ceiling.
- Negotiation timeout.
- No available drivers.
- Simultaneous driver acceptance.
- Boundary pickup.
- Buffer classification.
- Interstate route.
- Pricing changed after request.
- Wallet zero during active ride.
- Cash disagreement.
- Cancellation/no-show.
- Expired documents.
- Reapplication.
- GPS spoofing signals.

## Regression Rule

A bug in a business invariant must result in a regression test before the fix is considered complete.
