# Adding a Module

## Before Coding

1. Identify the product requirement.
2. Identify the domain boundary.
3. Check whether an existing module already owns the behavior.
4. Check [`decision-log.md`](../decision-log.md) for relevant decisions.
5. Identify external dependencies.
6. Define acceptance criteria.

## Steps

### 1. Define the Module

Write:

- Responsibility
- Owned entities
- Commands/use cases
- Queries
- Events
- External dependencies
- Invariants

### 2. Define the Boundary

State explicitly:

```text
This module owns X.
This module does not own Y.
```

### 3. Implement Domain Rules

Write pure business logic first where possible.

### 4. Add Application Use Cases

Each use case should represent a meaningful business operation.

### 5. Add Infrastructure

Adapters should implement interfaces required by the application.

### 6. Add Interface

Expose only the required API/events.

### 7. Add Tests

At minimum:

- Happy path
- Invalid input
- Boundary conditions
- State transition failures
- External failure behavior
- Concurrency-sensitive behavior where applicable

### 8. Update Documentation

Update:

- LLD
- API/WebSocket contract
- decision log if a new engineering decision was made
- README/setup if developer workflow changed
