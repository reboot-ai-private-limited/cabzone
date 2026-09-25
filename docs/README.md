# Cabzon Documentation

**Cabzon** is a zone-based ride-hailing and driver dispatch platform featuring:

- **Rider Mobile App** (Roadmap)
- **Driver Mobile App** (Roadmap)
- **Admin & Operations Web Console** (`apps/web`, `@cabzone/web`)
- **Core API & Dispatch Worker** (`apps/api`, `@cabzone/api`)

Its core product concepts are negotiable fares and zone-based pricing for in-city, outstation, and interstate rides.

> **Naming Standard**:
>
> - Commercial / Product Brand: **Cabzon**
> - NPM Package Scope: `@cabzone/*`
> - Monorepo & Container Name: `cabzone`

---

## Documentation Structure

```text
docs/
├── README.md                   Documentation hub (this file)
├── prd.md                      Product Requirements Document (source of truth)
├── decision-log.md             Append-only Architecture Decision Record (ADR)
├── setup-development.md        Developer onboarding and 3-state environment setup
│
├── LLD/                        Low-Level Design Specifications
│   ├── open-questions.md       Open engineering and product questions (OQ-001 to OQ-034)
│   ├── domain-model.md         Domain glossary, entities, invariants, and events
│   ├── database-schema.md      MongoDB collections, schemas, and indexing strategy
│   ├── ride-lifecycle.md       Ride state machine transitions and audit events
│   ├── fare-engine.md          Fare formulas, integer paise calculations, and snapshots
│   ├── zone-engine.md          Polygon classification, buffer fallback, and state splitting
│   ├── dispatch-engine.md      Driver search, proximity queries, and offer broadcast
│   ├── negotiation-engine.md   Rider proposals, driver acceptance, and bounded negotiation
│   ├── wallet-and-commission.md Driver prepaid wallet, commission deduction, and ledger
│   ├── api-contracts.md        REST API design, response envelopes, and error codes
│   ├── websocket-contracts.md  Realtime events, location pings, and dispatch channels
│   └── auth.md                 Phone + OTP, tokens, session management, and RBAC
│
└── engineering/                Engineering Handbook
    ├── README.md               Handbook index and reading order
    ├── monorepo-layout.md      Monorepo topology, apps vs packages, zero-build rules
    ├── clean-architecture-and-solid.md 5-layer dependency rules and SOLID applied
    ├── module-anatomy.md       Standard module structure and .public.ts contracts
    ├── boundaries-and-enforcement.md dependency-cruiser rules and lint gates
    ├── tech-choices.md         Technology selections and 3-state environment architecture
    ├── frontend-architecture.md Admin web console structure (Next.js 15 App Router)
    ├── build-and-deploy.md     Artifact bundling, Docker compose workflows, and CI/CD
    ├── coding-standards.md     TypeScript rules, integer paise money, and naming
    ├── design-language.md      UI design principles, density, and design tokens
    ├── mobile-in-monorepo.md   Mobile app integration and Metro bundler rules
    ├── shared-packages.md      Package boundaries and zero-build contract exports
    ├── testing.md              Testing strategy (unit, integration, contracts)
    └── adding-a-module.md      Checklist for adding new API feature modules
```

---

## Recommended Reading Order

### 1. Product Requirements

Read [`prd.md`](prd.md) — The source-of-truth product requirements document.

### 2. Decisions and Open Questions

Read [`decision-log.md`](decision-log.md) and [`LLD/open-questions.md`](LLD/open-questions.md) — Identifies approved architectural decisions and open product questions.

### 3. Domain Model

Read [`LLD/domain-model.md`](LLD/domain-model.md) — Understand actors, entities, relationships, and core business invariants.

### 4. Core Ride Logic

Read the ride workflow specifications in order:

- [`LLD/ride-lifecycle.md`](LLD/ride-lifecycle.md) — Ride state transitions and event emissions.
- [`LLD/fare-engine.md`](LLD/fare-engine.md) — Base fare formulas, vehicle rates, and snapshots.
- [`LLD/zone-engine.md`](LLD/zone-engine.md) — Point-in-polygon classification and buffer logic.
- [`LLD/dispatch-engine.md`](LLD/dispatch-engine.md) — Driver matching, candidate filtering, and offers.
- [`LLD/negotiation-engine.md`](LLD/negotiation-engine.md) — Fare proposal and acceptance rules.
- [`LLD/wallet-and-commission.md`](LLD/wallet-and-commission.md) — Prepaid driver balance and commission ledger.

### 5. Data and Contracts

Read the wire and persistence specifications:

- [`LLD/database-schema.md`](LLD/database-schema.md) — MongoDB schema and transaction boundaries.
- [`LLD/api-contracts.md`](LLD/api-contracts.md) — HTTP API endpoints, request/response envelopes.
- [`LLD/websocket-contracts.md`](LLD/websocket-contracts.md) — Realtime events and socket protocols.
- [`LLD/auth.md`](LLD/auth.md) — Authentication, tokens, and role-based access control.

### 6. Development Setup

Read [`setup-development.md`](setup-development.md) — Setup local infrastructure (MongoDB replica set `rs0` + Redis) and start development servers.

### 7. Engineering Handbook

Read the engineering standards:

- [`engineering/README.md`](engineering/README.md) — Engineering overview.
- [`engineering/monorepo-layout.md`](engineering/monorepo-layout.md) — Workspace layout and zero-build package strategy.
- [`engineering/clean-architecture-and-solid.md`](engineering/clean-architecture-and-solid.md) — Clean Architecture layers.
- [`engineering/module-anatomy.md`](engineering/module-anatomy.md) — 5-layer module structure and public contracts.
- [`engineering/boundaries-and-enforcement.md`](engineering/boundaries-and-enforcement.md) — Dependency graph validation with `dependency-cruiser`.
- [`engineering/tech-choices.md`](engineering/tech-choices.md) — Technical choices and 3-state runtime environment.
- [`engineering/build-and-deploy.md`](engineering/build-and-deploy.md) — Docker compose workflows and CI pipelines.

---

## Product Scope

### MVP Includes

- Rider phone/OTP authentication.
- Driver onboarding and KYC.
- Admin driver review.
- City polygon zones.
- Buffer-based fallback classification.
- In-city/outstation pricing.
- Interstate state-based pricing.
- Fare negotiation.
- First driver acceptance/ride confirmation.
- Driver wallet.
- UPI and cash payments.
- Ratings/reviews.
- Trust score.
- Ride history.
- Disputes.
- Administrative auditability.

### MVP Excludes

- Ride pooling.
- Scheduled/advance bookings.
- Corporate accounts.
- Multi-stop rides.

---

## Core Product Flow

```text
Rider
  │
  ├── Select pickup + destination
  │
  ├── Zone classification
  │
  ├── Suggested Fare
  │
  ├── Accept / propose fare
  │
  ▼
Ride Request
  │
  ├── Broadcast to eligible nearby drivers
  │
  ├── Driver accepts
  │
  ▼
Agreed Fare
  │
  ├── Driver En Route
  ├── Arrived
  ├── Trip Started
  ├── Trip Completed
  │
  ▼
Payment
  │
  ├── UPI
  └── Cash
  │
  ▼
Wallet / Commission
  │
  ▼
Ratings + History
```

---

## Core Fare Rule

```text
Raw Fare = Base Fare + (Route Distance × Rate/km)

Fare = MAX(Raw Fare, Minimum Fare)

Suggested Fare = ROUND(Fare)
```

---

## Core Zone Rule

```text
1. Pickup inside city polygon
      → In-City

2. Pickup outside all polygons
   AND trip distance <= buffer
      → In-City using nearest city rates

3. Otherwise
      → Outstation

4. If route crosses states
      → split route by state and apply state pricing
```
