# Clean Architecture and SOLID

## Goal

Keep Cabzonee's business rules independent from HTTP, database, mobile UI, mapping providers, KYC providers and payment providers.

## Layers

### Domain

Contains:

- Ride rules
- Fare concepts
- Negotiation rules
- Zone classification rules
- Wallet rules
- Driver eligibility rules
- Domain states/invariants

Domain code should not import database clients, HTTP frameworks or UI libraries.

### Application

Contains use cases such as:

- RequestRide
- ProposeFare
- AcceptRide
- StartTrip
- CompleteTrip
- RequestExtension
- VerifyDriver
- TopUpWallet
- SubmitReview

### Infrastructure

Contains adapters for:

- Database
- KYC provider
- Routing provider
- Payment provider
- Push notifications
- Realtime transport
- File/document storage

### Interface

Contains:

- REST controllers
- WebSocket handlers
- Admin controllers
- Mobile/web presentation logic

## SOLID Rules

### Single Responsibility

A fare service calculates fare. It should not also send notifications or write HTTP responses.

### Open/Closed

Provider-specific implementations should sit behind interfaces.

### Liskov Substitution

A replacement routing/KYC/payment adapter must preserve the contract expected by the application layer.

### Interface Segregation

Do not create one giant service interface containing unrelated operations.

### Dependency Inversion

Business logic depends on abstractions, not provider SDKs.

## Critical Rule

The domain layer must remain executable and testable without a running database or external provider.
