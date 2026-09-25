# Coding Standards

## General

- Prefer explicit names over clever abbreviations.
- Keep functions focused.
- Avoid hidden side effects.
- Validate external input at boundaries.
- Keep business rules deterministic where possible.
- Do not silently swallow errors.

## Naming

Use domain terminology consistently:

- `suggestedFare`
- `riderProposedFare`
- `agreedFare`
- `pickup`
- `drop`
- `cityZone`
- `wallet`
- `commission`

Do not create synonyms such as `finalPrice`, `acceptedAmount`, and `rideCost` for the same domain concept.

## Money

Represent money using an integer smallest-unit representation in the implementation.

Never use floating-point arithmetic for monetary calculations.

## Distance

Use an explicit unit in internal representations. The engineering convention should be documented centrally.

## Dates

Store timestamps consistently and convert only at presentation boundaries.

## Errors

Errors should have:

- Stable machine-readable code.
- Safe human-readable message.
- Relevant contextual data where appropriate.

## Logging

Never log:

- OTP values.
- Authentication secrets.
- Government document contents.
- Payment credentials.
- Sensitive personal data unnecessarily.

## Comments

Comment the reason behind non-obvious behavior, not code that is already self-explanatory.
