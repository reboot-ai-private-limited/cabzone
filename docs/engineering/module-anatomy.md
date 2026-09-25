# Module Anatomy

## Standard Module

A business module should normally contain:

```text
module/
├── domain/
├── application/
├── infrastructure/
├── interface/
├── tests/
└── index.ts
```

Not every small module requires every directory.

## Example: Ride Module

```text
ride/
├── domain/
│   ├── ride.ts
│   ├── ride-state.ts
│   └── ride-errors.ts
├── application/
│   ├── request-ride.ts
│   ├── cancel-ride.ts
│   └── complete-ride.ts
├── infrastructure/
│   └── ride-repository.ts
├── interface/
│   ├── ride-controller.ts
│   └── ride-routes.ts
└── tests/
```

## Module Rules

- Public exports are explicit.
- Internal implementation details remain private.
- Cross-module access happens through contracts/use cases.
- Do not import another module's private infrastructure directly.
- Domain invariants live with the domain object/rule where practical.
