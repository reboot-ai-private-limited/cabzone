# Shared Packages

## Purpose

Shared packages prevent duplication while preserving module boundaries.

## Good Candidates

```text
packages/
├── contracts/
├── validation/
├── domain/
├── config/
├── utilities/
└── ui/
```

## Contracts

May contain:

- API request/response types
- Realtime event shapes
- Common identifiers
- Enumerations shared across clients

## Validation

May contain reusable validation rules that have a stable cross-application meaning.

## Domain

Only genuinely shared domain logic belongs here.

Do not create a shared package simply because two files look similar.

## UI

Shared UI components should be used only where visual and behavioral requirements are genuinely shared.

## Rules

- Avoid circular package dependencies.
- Avoid importing application-specific code into shared packages.
- Keep shared packages small and intentional.
- Every package needs a clear owner and purpose.
