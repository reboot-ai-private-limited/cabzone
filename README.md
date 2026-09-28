# Cabzone — Zone-Based Ride-Hailing Platform

**Cabzone** is a production-grade full-stack monorepo for a zone-based ride-hailing and driver dispatch platform featuring negotiable fares, multi-tier geographic classifications (in-city, outstation, interstate), and prepaid driver commission ledgers.

> **Naming Standards**:
>
> - **Product / Brand**: **Cabzone**
> - **NPM Package Scope**: `@Cabzone/*`
> - **Monorepo / Container Namespace**: `Cabzone`

---

## System Architecture

```text
Cabzone/
├── apps/
│   ├── api/                    Node.js 22 (ESM) + Express + BullMQ (port 4000)
│   └── web/                    Next.js 15 (App Router) + React 19 + Tailwind CSS (port 3000)
│
├── packages/
│   ├── config/                 Shared base tsconfig and ESLint configurations
│   └── contracts/              Zero-build domain models, DTOs, wire envelopes, and error codes
│
├── docs/                       Architecture documentation, PRD, LLDs, and Engineering Handbook
│
├── docker-compose.dev.yml      Local development infrastructure (MongoDB rs0 + Redis)
├── docker-compose.stage.yml    Pre-production containerized stack
├── docker-compose.prod.yml     Hardened production containerized stack
├── package.json                Root workspace configuration (pnpm 11 + Turborepo 2)
├── pnpm-workspace.yaml         Workspace package definitions and dependency overrides
└── turbo.json                  Turborepo caching and pipeline definitions
```

### Services & Port Allocation

| Component         | Package / Path              | Technology                    | Port    | Purpose                                                |
| ----------------- | --------------------------- | ----------------------------- | ------- | ------------------------------------------------------ |
| **API Server**    | `apps/api` (`@Cabzone/api`) | Express 4 (ESM), TypeScript   | `4000`  | REST API, WebSockets, health probes                    |
| **Queue Worker**  | `apps/api/src/worker.ts`    | BullMQ, ioredis               | N/A     | Asynchronous background jobs and presence checks       |
| **Admin Console** | `apps/web` (`@Cabzone/web`) | Next.js 15, Tailwind v4       | `3000`  | Operations, driver KYC, and zone management            |
| **MongoDB**       | `docker-compose.*.yml`      | MongoDB 7 (Replica Set `rs0`) | `27017` | Primary database with multi-document ACID transactions |
| **Redis**         | `docker-compose.*.yml`      | Redis 7 Alpine (Append-only)  | `6379`  | BullMQ queue transport, proximity cache, rate limiting |

---

## Three-State Operational Lifecycle

| Mode               | Target            | Configuration         | Commands                                                           |
| ------------------ | ----------------- | --------------------- | ------------------------------------------------------------------ |
| **1. Development** | Local host        | `apps/api/.env`       | `docker compose -f docker-compose.dev.yml up -d`<br>`pnpm dev:web` |
| **2. Staging**     | Pre-production QA | `apps/api/.env.stage` | `docker compose -f docker-compose.stage.yml up -d --build`         |
| **3. Production**  | Live operations   | `apps/api/.env.prod`  | `docker compose -f docker-compose.prod.yml up -d --build`          |

---

## Quickstart (Local Development)

### 1. Prerequisites

- **Node.js**: >= 20.x
- **pnpm**: 11.18.0 (`corepack enable && corepack prepare pnpm@11.18.0 --activate`)
- **Docker**: Docker Engine with Compose v2

### 2. Setup

```bash
# Clone and install dependencies
git clone <repository-url>
cd Cabzone
pnpm install

# Setup environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# Start MongoDB replica set and Redis containers
docker compose -f docker-compose.dev.yml up -d
```

### 3. Running Applications

```bash
# Run API and Admin Web concurrently with hot reload
pnpm dev:web

# Or run specific targets:
pnpm dev:api       # Start API in watch mode (http://localhost:4000)
pnpm dev:worker    # Start BullMQ worker in watch mode
pnpm dev:backend   # Start API and worker together
pnpm dev:full      # Start API, worker, and Web console simultaneously
```

### 4. Code Quality & Verification

```bash
# Run TypeScript typechecks across all packages
pnpm turbo run typecheck

# Check Clean Architecture boundaries (dependency-cruiser)
pnpm --filter @Cabzone/api lint:deps

# Run ESLint across workspace
pnpm turbo run lint

# Run Vitest test suites
pnpm turbo run test

# Run full CI check (typecheck, lint, test)
pnpm check

# Build production artifacts
pnpm turbo run build
```

---

## Documentation Hub

Detailed specifications and architectural guides live in the [`docs/`](docs/README.md) directory:

- **[Product Requirements Document](docs/prd.md)**: Product vision, user journeys, MVP scope.
- **[Architecture Decision Log](docs/decision-log.md)**: Append-only record of technical decisions (ADRs).
- **[Developer Setup Guide](docs/setup-development.md)**: Onboarding instructions and environment configuration.
- **[Low-Level Design (LLD)](docs/LLD/open-questions.md)**:
  - [Open Questions & Decisions](docs/LLD/open-questions.md)
  - [Domain Model & Invariants](docs/LLD/domain-model.md)
  - [Database Schemas](docs/LLD/database-schema.md)
  - [Ride Lifecycle State Machine](docs/LLD/ride-lifecycle.md)
  - [Fare Engine & Formulas](docs/LLD/fare-engine.md)
  - [Zone Classification Engine](docs/LLD/zone-engine.md)
  - [Dispatch & Matching Engine](docs/LLD/dispatch-engine.md)
  - [Negotiation Engine](docs/LLD/negotiation-engine.md)
  - [Driver Wallet & Commission](docs/LLD/wallet-and-commission.md)
  - [API Wire Contracts](docs/LLD/api-contracts.md)
  - [WebSocket Contracts](docs/LLD/websocket-contracts.md)
  - [Authentication & RBAC](docs/LLD/auth.md)
- **[Engineering Handbook](docs/engineering/README.md)**:
  - [Monorepo Layout](docs/engineering/monorepo-layout.md)
  - [Clean Architecture & SOLID](docs/engineering/clean-architecture-and-solid.md)
  - [Module Anatomy & Public Contracts](docs/engineering/module-anatomy.md)
  - [Boundaries & Mechanical Enforcement](docs/engineering/boundaries-and-enforcement.md)
  - [Tech Choices & 3-State Lifecycle](docs/engineering/tech-choices.md)
  - [Frontend Architecture](docs/engineering/frontend-architecture.md)
  - [Build, Docker & CI/CD Pipelines](docs/engineering/build-and-deploy.md)
  - [Coding Standards & Paise Money](docs/engineering/coding-standards.md)
  - [Testing Strategy](docs/engineering/testing.md)
  - [Adding a Module Checklist](docs/engineering/adding-a-module.md)
