# Graph Report - cabzonenew  (2026-09-25)

## Corpus Check
- Corpus is ~34,380 words - fits in a single context window. You may not need a graph.

## Summary
- 696 nodes · 888 edges · 64 communities (39 shown, 25 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Web App Config
- Root Package Config
- API Build Config
- API App & Container
- Error Handling
- Health Module
- Environment Config
- Database & API Contracts
- Turbo Pipeline
- Driver & Zone Schema
- Architecture Boundaries
- Base TypeScript Config
- Shared Config Package
- Pricing Contracts
- API Dependencies
- Production Docker
- Contracts Package
- Engineering Docs & Wallet
- Build & Frontend Arch
- API Scripts
- API TypeScript Config
- Web TypeScript Config
- Ride Policies
- React TypeScript Config
- Ride Assignment & WebSocket
- Dev Setup Guide
- Fare & Commission
- Testing Strategy
- Contracts TypeScript Config
- Zone Engine
- Dispatch Engine
- Negotiation & Fare Engine
- Design Language
- Shared Packages
- Backend Tech Stack
- Immutable Snapshots
- Interstate Segmentation
- Graphify Integration
- Dependency Cruiser
- ESLint Config
- Admin & RBAC
- Root TypeScript
- CI Pipeline
- Next.js Types
- Wallet Eligibility
- WebSocket Resilience
- Ride Expiration
- Three-State Deployment
- Node.js Runtime
- API Invariants
- Wire Envelope
- Auth Invariants
- JWT Authentication
- Idempotency Keys
- System Actor
- Wallet Top-up
- Driver Location Events
- Negotiable Fares
- Zone-Based Pricing

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 19 edges
2. `scripts` - 14 edges
3. `express` - 12 edges
4. `Product Requirements Document (PRD)` - 12 edges
5. `scripts` - 11 edges
6. `createApp()` - 10 edges
7. `HealthProbePort` - 10 edges
8. `buildHealthContainer()` - 10 edges
9. `AppError` - 10 edges
10. `Ride Lifecycle` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Cabzone Platform` --references--> `Ride (Central Transactional Aggregate)`  [INFERRED]
  README.md → docs/LLD/domain-model.md
- `pnpm Workspace Configuration` --references--> `Monorepo Layout`  [INFERRED]
  pnpm-workspace.yaml → docs/engineering/monorepo-layout.md
- `pnpm Workspace Configuration` --references--> `apps/api (@cabzone/api)`  [INFERRED]
  pnpm-workspace.yaml → docs/engineering/monorepo-layout.md
- `pnpm Workspace Configuration` --references--> `apps/web (@cabzone/web)`  [INFERRED]
  pnpm-workspace.yaml → docs/engineering/monorepo-layout.md
- `AppError` --references--> `FaultCode`  [EXTRACTED]
  apps/api/src/shared/errors/AppError.ts → packages/contracts/src/errors.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Architectural Boundary Enforcement Triangle** — docs_engineering_boundaries_and_enforcement_domain_boundary, docs_engineering_clean_architecture_and_solid_domain_layer, docs_engineering_module_anatomy_rules [INFERRED 0.95]
- **Domain Development and Verification Workflow** — docs_setup_development_workflow, docs_engineering_testing_unit_tests [INFERRED 0.85]
- **Core Ride Flow (Fare + Negotiation + Dispatch)** — docs_lld_domain_model_ride_aggregate, docs_lld_fare_engine_base_formula, docs_lld_negotiation_engine_negotiation_state, docs_lld_dispatch_engine_dispatch_flow [EXTRACTED 1.00]
- **Immutable Pricing Snapshot Pattern (Zone + Config + Ride)** — docs_lld_domain_model_pricing_snapshot, docs_lld_fare_engine_fare_snapshot, docs_lld_database_schema_rides_collection, docs_lld_open_questions_blocking_resolved [EXTRACTED 1.00]
- **Driver Eligibility Gate (Wallet + KYC + Dispatch)** — docs_lld_dispatch_engine_driver_eligibility, docs_lld_domain_model_wallet, docs_lld_auth_driver_eligibility_vs_auth [EXTRACTED 1.00]
- **Fare Negotiation Triangle: Suggested, Proposed, and Agreed Fare** — docs_prd_suggested_fare, docs_prd_rider_proposed_fare, docs_prd_agreed_fare [EXTRACTED 1.00]
- **Core Ride Processing: Zone Engine + Fare Snapshot + State Machine** — docs_lld_ride_lifecycle_ride_state_machine, docs_lld_ride_lifecycle_pricing_snapshot, docs_lld_zone_engine_zone_classification [INFERRED 0.95]
- **Monorepo Deployable Units: API, Web, Contracts** — docs_engineering_monorepo_layout_apps_api, docs_engineering_monorepo_layout_apps_web, docs_engineering_monorepo_layout_packages_contracts [EXTRACTED 1.00]

## Communities (64 total, 25 thin omitted)

### Community 0 - "Web App Config"
Cohesion: 0.04
Nodes (42): config, dependencies, @cabzone/contracts, lucide-react, next, react, react-dom, devDependencies (+34 more)

### Community 1 - "Root Package Config"
Cohesion: 0.04
Nodes (45): devDependencies, @cabzone/config, eslint, eslint-config-prettier, eslint-plugin-jsx-a11y, eslint-plugin-react, eslint-plugin-react-hooks, prettier (+37 more)

### Community 2 - "API Build Config"
Cohesion: 0.05
Nodes (42): external, pkg, devDependencies, @cabzone/config, dependency-cruiser, esbuild, pino-pretty, supertest (+34 more)

### Community 3 - "API App & Container"
Cohesion: 0.09
Nodes (29): createApp(), AppContainers, buildContainers(), buildApiRouter(), accessLogMiddleware(), isSilent(), SILENT_PATHS, causeChain() (+21 more)

### Community 4 - "Error Handling"
Cohesion: 0.08
Nodes (19): AppError, ApiError, NetworkError, request(), RequestOptions, FAULT_CODES, FaultCode, DependencyHealth (+11 more)

### Community 5 - "Health Module"
Cohesion: 0.14
Nodes (18): GetHealthUseCase, DependencyHealth, DependencyStatus, HealthReport, summarise(), HealthProbePort, buildHealthContainer(), HealthContainer (+10 more)

### Community 6 - "Environment Config"
Cohesion: 0.14
Nodes (27): allowDevShortcuts, env, isDevelopment, isProdLike, isProduction, isStaging, isTest, loadEnv() (+19 more)

### Community 7 - "Database & API Contracts"
Cohesion: 0.08
Nodes (27): MongoDB Dev Service (docker-compose.dev.yml), Redis Dev Service (docker-compose.dev.yml), Ride Endpoints (/v1/rides), fare_negotiations Collection, Integer Paise Convention, riders Collection, rides Collection (central transactional record), Offer Expiration (90s window) (+19 more)

### Community 8 - "Turbo Pipeline"
Cohesion: 0.07
Nodes (26): dependsOn, outputs, cache, persistent, cache, persistent, globalDependencies, globalEnv (+18 more)

### Community 9 - "Driver & Zone Schema"
Cohesion: 0.09
Nodes (25): Driver Endpoints (/v1/drivers), Wallet Endpoints (/v1/drivers/me/wallet), Authentication != Driver Eligibility, city_zones Collection, Concurrency Rules (atomic ride assignment, wallet debit), drivers Collection, pricing_configs Collection, wallets Collection (+17 more)

### Community 10 - "Architecture Boundaries"
Cohesion: 0.09
Nodes (19): Application Boundary, Untrusted Client Security Boundary, Domain Layer Boundary, Mechanical Boundary Enforcement, Authoritative Realtime Boundary, Application Layer Use Cases, Domain Layer Architecture, Infrastructure Layer Adapters (+11 more)

### Community 11 - "Base TypeScript Config"
Cohesion: 0.09
Nodes (22): compilerOptions, declaration, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib, module (+14 more)

### Community 12 - "Shared Config Package"
Cohesion: 0.10
Nodes (20): devDependencies, eslint, eslint-config-prettier, typescript, @typescript-eslint/eslint-plugin, @typescript-eslint/parser, exports, ./eslint.base.cjs (+12 more)

### Community 13 - "Pricing Contracts"
Cohesion: 0.14
Nodes (15): QuoteRequestDto, VehiclePricingConfig, VehicleQuoteOption, CANCELLATION_REASONS, CancellationReason, RIDE_STATUSES, RideDto, RidePricingSnapshot (+7 more)

### Community 14 - "API Dependencies"
Cohesion: 0.12
Nodes (17): dependencies, bullmq, @cabzone/contracts, cookie-parser, cors, dotenv, express, express-rate-limit (+9 more)

### Community 15 - "Production Docker"
Cohesion: 0.25
Nodes (12): API Service (Production), Mongo Service (Production), Mongo Replica Set Init (Production), Redis Service (Production), Next.js Web Service (Production), Background Worker Service (Production), API Service (Staging), Mongo Service (Staging) (+4 more)

### Community 16 - "Contracts Package"
Cohesion: 0.14
Nodes (13): devDependencies, @cabzone/config, typescript, exports, @cabzone/config, typescript, name, private (+5 more)

### Community 17 - "Engineering Docs & Wallet"
Cohesion: 0.21
Nodes (12): Decision Log (ADR), Adding a Module Checklist, Engineering Handbook, Wallet Ledger (Immutable Transactions), Driver Wallet Model, Admin Persona, Driver Persona, Driver Onboarding & KYC Verification (+4 more)

### Community 18 - "Build & Frontend Arch"
Cohesion: 0.20
Nodes (12): esbuild Bundle (server.js + worker.js), Turborepo CI/CD Pipeline, Admin Web Console (Next.js 15 App Router), API Client SDK (HttpSuccessBody / ApiError), apps/api (@cabzone/api), apps/web (@cabzone/web), Clean Architecture Modular Monolith, Monorepo Layout (+4 more)

### Community 19 - "API Scripts"
Cohesion: 0.18
Nodes (11): scripts, build, clean, dev, dev:worker, lint, lint:deps, start (+3 more)

### Community 20 - "API TypeScript Config"
Cohesion: 0.18
Nodes (10): compilerOptions, baseUrl, outDir, paths, rootDir, types, exclude, extends (+2 more)

### Community 21 - "Web TypeScript Config"
Cohesion: 0.18
Nodes (10): compilerOptions, baseUrl, incremental, jsx, paths, plugins, exclude, extends (+2 more)

### Community 22 - "Ride Policies"
Cohesion: 0.24
Nodes (11): D-029: Mid-Trip Extension Workflow Decision, D-032: State-Based Cancellation & No-Show Policy, D-033: Cash Payment Confirmation & Dispute Workflow, State-Based Cancellation Policy, Mid-Trip Extension Workflow, No-Show Policy, Ride Lifecycle Events (Append-Only), Ride Lifecycle (+3 more)

### Community 23 - "React TypeScript Config"
Cohesion: 0.18
Nodes (10): compilerOptions, allowJs, jsx, lib, module, moduleResolution, display, extends (+2 more)

### Community 24 - "Ride Assignment & WebSocket"
Cohesion: 0.20
Nodes (10): D-030: Atomic DB Concurrency for Ride Assignment, MongoDB 7 (Replica Set rs0), Atomic Driver Assignment, WebSocket Contracts LLD, Driver Telemetry and Location Updates, WebSocket Protocol and Envelope, WebSocket Reconnection and Ordering, Ride Offer Real-Time Events (+2 more)

### Community 25 - "Dev Setup Guide"
Cohesion: 0.25
Nodes (7): Admin Controlled Parameters, Environment Isolation Matrix, External Service Categories Requirements, Development Setup Framework, Definition of Development Readiness, Required Workspace Applications, Sequential Domain Development Order

### Community 26 - "Fare & Commission"
Cohesion: 0.29
Nodes (7): D-026: Commission = % of Agreed Fare, D-028: Fare Negotiation Bounds (Floor 80%, Ceiling 150%), Commission Calculation (% of Agreed Fare), Agreed Fare, Integer Paise Money Standard, Rider Proposed Fare, Suggested Fare

### Community 27 - "Testing Strategy"
Cohesion: 0.33
Nodes (6): Critical E2E User Flows, Edge-Case Testing Matrix, Adapter & Infrastructure Integration Testing, Cabzon Testing Pyramid, Business Invariant Regression Mandate, Deterministic Business Logic Unit Testing

### Community 28 - "Contracts TypeScript Config"
Cohesion: 0.29
Nodes (6): compilerOptions, module, moduleResolution, extends, include, @cabzone/config/tsconfig.base.json

### Community 29 - "Zone Engine"
Cohesion: 0.33
Nodes (6): D-025: Vehicle Category Pricing (CAB & E_RICKSHAW), D-027: Buffer Zone Distance (City Override + Global Default), Buffer Distance Fallback Classification, Zone Classification (IN_CITY / OUTSTATION / INTERSTATE), Zone Engine, CityZone Entity

### Community 30 - "Dispatch Engine"
Cohesion: 0.33
Nodes (5): Explicit Distance & Date Standards, Ubiquitous Domain Terminology Naming, Smallest-Unit Integer Money Representation, Sensitive Data Redaction Logging Policy, Structured Error Representation

### Community 31 - "Negotiation & Fare Engine"
Cohesion: 0.33
Nodes (6): Auth Endpoints (/v1/auth/otp), OTP Authentication Flow, Refresh Token (rotating), Session (device-bound, revocable), sessions Collection, users Collection

### Community 32 - "Design Language"
Cohesion: 0.40
Nodes (4): Map Interaction & Zone Visualization Guidelines, Cabzon UI Design Character, Role-Based Interface Priorities, Multi-Modal Status Indicator Standard

### Community 33 - "Shared Packages"
Cohesion: 0.40
Nodes (4): packages/contracts Specification, packages/domain Specification, Shared Package Dependency & Non-Circularity Rules, packages/validation Specification

### Community 34 - "Backend Tech Stack"
Cohesion: 0.50
Nodes (5): BullMQ Background Worker, Redis 7 (Cache & BullMQ), Technology Stack, Turf.js + MongoDB 2dsphere (Geospatial), Point-in-Polygon Classification

### Community 35 - "Immutable Snapshots"
Cohesion: 0.50
Nodes (4): D-034: Immutable Pricing & Zone Snapshots, Pricing Snapshot (Ride), Commission Snapshot Immutability, Zone Configuration Freeze at Ride Creation

### Community 36 - "Interstate Segmentation"
Cohesion: 0.50
Nodes (4): D-035: Interstate Route Segmentation Pricing, Interstate Route Segmentation, StateSegment Interface, ZoneClassification Interface

### Community 37 - "Graphify Integration"
Cohesion: 0.67
Nodes (3): Graphify Always-On Rule, Graphify Workflow, Graphify Knowledge Graph (CLAUDE.md)

### Community 40 - "Admin & RBAC"
Cohesion: 0.67
Nodes (3): Admin Endpoints (/v1/admin), RBAC (Role-Based Access Control), Admin (Actor - SUPER/CITY/SUPPORT/FINANCE)

## Knowledge Gaps
- **367 isolated node(s):** `MODULE_TIERS`, `layeringRules`, `base`, `pkg`, `external` (+362 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 424 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `Health Module` to `API Build Config`, `API App & Container`, `Error Handling`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `dependencies` connect `API Dependencies` to `API Build Config`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `MODULE_TIERS`, `layeringRules`, `base` to the rest of the system?**
  _367 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Web App Config` be split into smaller, more focused modules?**
  _Cohesion score 0.0425531914893617 - nodes in this community are weakly interconnected._
- **Should `Root Package Config` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._
- **Should `API Build Config` be split into smaller, more focused modules?**
  _Cohesion score 0.045454545454545456 - nodes in this community are weakly interconnected._
- **Should `API App & Container` be split into smaller, more focused modules?**
  _Cohesion score 0.08906882591093117 - nodes in this community are weakly interconnected._