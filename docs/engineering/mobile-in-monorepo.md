# Mobile in Monorepo

## Applications

```text
apps/
├── rider-mobile/
└── driver-mobile/
```

The exact mobile framework is an open engineering decision.

## Shared Code

Share only code that is genuinely platform/product neutral:

- API contracts
- Validation
- Domain value types
- Formatting utilities
- Design tokens where appropriate

Do not force rider and driver UI into the same component tree merely to maximize code reuse.

## Driver-Specific Concerns

The driver application has additional responsibilities:

- Online/offline availability
- Ride offers
- Live location
- Ride-state updates
- Background/foreground behavior
- Push notification handling

## Rider-Specific Concerns

The rider application needs:

- Booking
- Fare negotiation
- Live ride tracking
- Passenger-for-someone-else flow
- Payment status
- Ratings/reviews

## Security

Never embed server secrets in either mobile application.

Authentication and authorization are enforced by the backend.
