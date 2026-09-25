# Boundaries and Enforcement

## Purpose

Documentation is useful only when important rules are enforced.

## Domain Boundary

Business rules must not depend directly on:

- HTTP framework
- Database driver
- UI framework
- KYC SDK
- Payment SDK
- Routing SDK

Use adapters/interfaces.

## Application Boundary

Use cases coordinate business operations.

Controllers should not contain substantial domain logic.

## Infrastructure Boundary

Infrastructure translates between external systems and application contracts.

## Data Boundary

Database access must be isolated behind repositories/data-access modules where the architecture requires it.

## Client Boundary

Mobile/web clients are untrusted.

The server must revalidate:

- Authentication
- Authorization
- Fare limits
- Ride state
- Driver eligibility
- Wallet eligibility
- Payment state

Never rely on the client to enforce business rules.

## Realtime Boundary

Realtime transport is not authoritative.

A received client event must not itself prove that a business action occurred.

The server validates the command and persists authoritative state.

## Enforcement Mechanisms

Where tooling supports it, enforce:

- Type checking
- Linting
- Formatting
- Import boundaries
- Test execution
- Secret scanning
- Dependency checks
- Build verification

## Critical Rule

Security, authorization, fare, wallet and ride-state rules must be enforced server-side.
