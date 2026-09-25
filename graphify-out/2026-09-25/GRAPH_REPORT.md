# Graph Report - cabzonenew  (2026-09-25)

## Corpus Check
- 131 files · ~38,509 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 5, .example 5, .css 1)

## Summary
- 882 nodes · 1274 edges · 76 communities (50 shown, 26 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `43582e0c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- web/package.json
- package.json
- api/package.json
- app.ts
- auth-middleware.test.ts
- health.container.ts
- worker.ts
- Cabzone Platform
- tasks
- Ride (Central Transactional Aggregate)
- docs/engineering/clean-architecture-and-solid.md
- compilerOptions
- config/package.json
- rides.ts
- dependencies
- docker-compose.prod.yml
- contracts/package.json
- domain/index.ts
- Monorepo Layout
- identity.ts
- compilerOptions
- compilerOptions
- Ride Lifecycle
- compilerOptions
- WebSocket Contracts LLD
- docs/setup-development.md
- Product Requirements Document (PRD)
- docs/engineering/testing.md
- contracts/tsconfig.json
- Zone Engine
- docs/engineering/coding-standards.md
- OTP Authentication Flow
- docs/engineering/design-language.md
- docs/engineering/shared-packages.md
- identity.test.ts
- mongoAdminUser.repository.ts
- Interstate Route Segmentation
- Graphify Always-On Rule
- .dependency-cruiser.cjs
- api/.eslintrc.cjs
- RBAC (Role-Based Access Control)
- tsconfig.json
- CI Pipeline
- next-env.d.ts
- D-036: Driver Dispatch Eligibility 10-Point Criteria
- FCM Push Notification Fallback
- D-031: Ride Expiration & Immutable Offer History
- Three-State Environment Architecture (dev/stage/prod)
- Node.js 22 + Express 4 Backend
- API Invariants
- devDependencies
- Auth Invariants
- JWT Access Token
- idempotency_keys Collection
- System (Automated Backend Actor)
- Wallet Top-Up Flow
- driver.location.updated Event
- Negotiable Fares (Differentiator)
- Zone-Based Pricing Model
- logger.ts
- src/index.ts
- identity.validation.ts
- my-notes.md
- adminUser.model.ts
- docs/engineering/boundaries-and-enforcement.md
- env.ts
- persistence/index.ts
- request-id.middleware.ts
- esbuild.config.mjs

## God Nodes (most connected - your core abstractions)
1. `Cabzone Platform` - 24 edges
2. `compilerOptions` - 19 edges
3. `express` - 16 edges
4. `Engineering Handbook` - 15 edges
5. `Cabzon Documentation Hub` - 15 edges
6. `AppError` - 14 edges
7. `scripts` - 14 edges
8. `Product Requirements Document (PRD)` - 13 edges
9. `scripts` - 11 edges
10. `Ride Lifecycle` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Cabzone Platform` --references--> `Ride (Central Transactional Aggregate)`  [INFERRED]
  README.md → docs/LLD/domain-model.md
- `Cabzone Platform` --references--> `Product Requirements Document (PRD)`  [EXTRACTED]
  README.md → docs/prd.md
- `pnpm Workspace Configuration` --references--> `apps/api (@cabzone/api)`  [INFERRED]
  pnpm-workspace.yaml → docs/engineering/monorepo-layout.md
- `pnpm Workspace Configuration` --references--> `apps/web (@cabzone/web)`  [INFERRED]
  pnpm-workspace.yaml → docs/engineering/monorepo-layout.md
- `pnpm Workspace Configuration` --references--> `Monorepo Layout`  [INFERRED]
  pnpm-workspace.yaml → docs/engineering/monorepo-layout.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Driver Eligibility Gate (Wallet + KYC + Dispatch)** — docs_lld_dispatch_engine_driver_eligibility, docs_lld_domain_model_wallet, docs_lld_auth_driver_eligibility_vs_auth [EXTRACTED 1.00]
- **Fare Negotiation Triangle: Suggested, Proposed, and Agreed Fare** — docs_prd_suggested_fare, docs_prd_rider_proposed_fare, docs_prd_agreed_fare [EXTRACTED 1.00]
- **Monorepo Deployable Units: API, Web, Contracts** — docs_engineering_monorepo_layout_apps_api, docs_engineering_monorepo_layout_apps_web, docs_engineering_monorepo_layout_packages_contracts [EXTRACTED 1.00]
- **Immutable Pricing Snapshot Pattern (Zone + Config + Ride)** — docs_lld_domain_model_pricing_snapshot, docs_lld_fare_engine_fare_snapshot, docs_lld_database_schema_rides_collection, docs_lld_open_questions_blocking_resolved [EXTRACTED 1.00]
- **Core Ride Flow (Fare + Negotiation + Dispatch)** — docs_lld_domain_model_ride_aggregate, docs_lld_fare_engine_base_formula, docs_lld_negotiation_engine_negotiation_state, docs_lld_dispatch_engine_dispatch_flow [EXTRACTED 1.00]
- **Domain Development and Verification Workflow** — docs_setup_development_workflow, docs_engineering_testing_unit_tests [INFERRED 0.85]
- **Architectural Boundary Enforcement Triangle** — docs_engineering_boundaries_and_enforcement_domain_boundary, docs_engineering_clean_architecture_and_solid_domain_layer, docs_engineering_module_anatomy_rules [INFERRED 0.95]
- **Core Ride Processing: Zone Engine + Fare Snapshot + State Machine** — docs_lld_ride_lifecycle_ride_state_machine, docs_lld_ride_lifecycle_pricing_snapshot, docs_lld_zone_engine_zone_classification [INFERRED 0.95]

## Communities (76 total, 26 thin omitted)

### Community 0 - "web/package.json"
Cohesion: 0.04
Nodes (42): config, dependencies, @cabzone/contracts, lucide-react, next, react, react-dom, devDependencies (+34 more)

### Community 1 - "package.json"
Cohesion: 0.04
Nodes (45): devDependencies, @cabzone/config, eslint, eslint-config-prettier, eslint-plugin-jsx-a11y, eslint-plugin-react, eslint-plugin-react-hooks, prettier (+37 more)

### Community 2 - "api/package.json"
Cohesion: 0.08
Nodes (23): @cabzone/config, @cabzone/contracts, @types/node, typescript, vitest, name, private, type (+15 more)

### Community 3 - "app.ts"
Cohesion: 0.19
Nodes (14): createApp(), AppContainers, buildContainers(), buildHealthContainer(), buildApiRouter(), causeChain(), errorHandler(), notFoundHandler() (+6 more)

### Community 4 - "auth-middleware.test.ts"
Cohesion: 0.06
Nodes (37): makeGetHealthController(), apps_api_src_modules_identity_domain_index_canadminmanagezone, apps_api_src_modules_identity_domain_index_issessionactive, isSessionActive(), Express, Request, makeAuthenticate(), apps_api_src_modules_identity_interface_middlewares_index_makeauthenticate (+29 more)

### Community 5 - "health.container.ts"
Cohesion: 0.16
Nodes (14): GetHealthUseCase, DependencyHealth, DependencyStatus, HealthReport, summarise(), HealthProbePort, HealthContainer, HealthPublicContract (+6 more)

### Community 6 - "worker.ts"
Cohesion: 0.25
Nodes (16): env, loadEnv(), main(), CONNECTION_STATES, connectMongo(), disconnectMongo(), logger, closeQueues() (+8 more)

### Community 7 - "Cabzone Platform"
Cohesion: 0.16
Nodes (21): MongoDB Dev Service (docker-compose.dev.yml), Redis Dev Service (docker-compose.dev.yml), Decision Log (ADR), Adding a Module Checklist, Engineering Handbook, BullMQ Background Worker, Redis 7 (Cache & BullMQ), Technology Stack (+13 more)

### Community 8 - "tasks"
Cohesion: 0.07
Nodes (26): dependsOn, outputs, cache, persistent, cache, persistent, globalDependencies, globalEnv (+18 more)

### Community 9 - "Ride (Central Transactional Aggregate)"
Cohesion: 0.05
Nodes (42): Driver Endpoints (/v1/drivers), Ride Endpoints (/v1/rides), Wallet Endpoints (/v1/drivers/me/wallet), Authentication != Driver Eligibility, city_zones Collection, Concurrency Rules (atomic ride assignment, wallet debit), drivers Collection, fare_negotiations Collection (+34 more)

### Community 10 - "docs/engineering/clean-architecture-and-solid.md"
Cohesion: 0.20
Nodes (10): Domain Layer Boundary, Application Layer Use Cases, Domain Layer Architecture, Infrastructure Layer Adapters, Interface Presentation Layer, Offline Domain Testability Rule, SOLID Architecture Application, Ride Module Reference Structure (+2 more)

### Community 11 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, declaration, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib, module (+14 more)

### Community 12 - "config/package.json"
Cohesion: 0.10
Nodes (20): devDependencies, eslint, eslint-config-prettier, typescript, @typescript-eslint/eslint-plugin, @typescript-eslint/parser, exports, ./eslint.base.cjs (+12 more)

### Community 13 - "rides.ts"
Cohesion: 0.14
Nodes (15): QuoteRequestDto, VehiclePricingConfig, VehicleQuoteOption, CANCELLATION_REASONS, CancellationReason, RIDE_STATUSES, RideDto, RidePricingSnapshot (+7 more)

### Community 14 - "dependencies"
Cohesion: 0.07
Nodes (28): dependencies, bullmq, @cabzone/contracts, cookie-parser, cors, dotenv, express, express-rate-limit (+20 more)

### Community 15 - "docker-compose.prod.yml"
Cohesion: 0.25
Nodes (12): API Service (Production), Mongo Service (Production), Mongo Replica Set Init (Production), Redis Service (Production), Next.js Web Service (Production), Background Worker Service (Production), API Service (Staging), Mongo Service (Staging) (+4 more)

### Community 16 - "contracts/package.json"
Cohesion: 0.14
Nodes (13): devDependencies, @cabzone/config, typescript, exports, @cabzone/config, typescript, name, private (+5 more)

### Community 17 - "domain/index.ts"
Cohesion: 0.07
Nodes (26): canDriverGoOnline(), DriverEligibilityResult, DriverEntity, DriverKycStatus, DriverOperationalStatus, DriverStatus, apps_api_src_modules_identity_domain_index_sessionentity, apps_api_src_modules_identity_domain_index_sessionrepositoryport (+18 more)

### Community 18 - "Monorepo Layout"
Cohesion: 0.20
Nodes (12): esbuild Bundle (server.js + worker.js), Turborepo CI/CD Pipeline, Admin Web Console (Next.js 15 App Router), API Client SDK (HttpSuccessBody / ApiError), apps/api (@cabzone/api), apps/web (@cabzone/web), Clean Architecture Modular Monolith, Monorepo Layout (+4 more)

### Community 19 - "identity.ts"
Cohesion: 0.11
Nodes (23): DriverDocument, DriverModel, driverSchema, AdminUserDto, AUTH_ROLES, DRIVER_KYC_STATUSES, DRIVER_OPERATIONAL_STATUSES, DRIVER_STATUSES (+15 more)

### Community 20 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, baseUrl, outDir, paths, rootDir, types, exclude, extends (+2 more)

### Community 21 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, baseUrl, incremental, jsx, paths, plugins, exclude, extends (+2 more)

### Community 22 - "Ride Lifecycle"
Cohesion: 0.16
Nodes (15): D-029: Mid-Trip Extension Workflow Decision, D-032: State-Based Cancellation & No-Show Policy, D-033: Cash Payment Confirmation & Dispute Workflow, D-034: Immutable Pricing & Zone Snapshots, State-Based Cancellation Policy, Mid-Trip Extension Workflow, No-Show Policy, Pricing Snapshot (Ride) (+7 more)

### Community 23 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, allowJs, jsx, lib, module, moduleResolution, display, extends (+2 more)

### Community 24 - "WebSocket Contracts LLD"
Cohesion: 0.20
Nodes (10): D-030: Atomic DB Concurrency for Ride Assignment, MongoDB 7 (Replica Set rs0), Atomic Driver Assignment, WebSocket Contracts LLD, Driver Telemetry and Location Updates, WebSocket Protocol and Envelope, WebSocket Reconnection and Ordering, Ride Offer Real-Time Events (+2 more)

### Community 25 - "docs/setup-development.md"
Cohesion: 0.25
Nodes (7): Admin Controlled Parameters, Environment Isolation Matrix, External Service Categories Requirements, Development Setup Framework, Definition of Development Readiness, Required Workspace Applications, Sequential Domain Development Order

### Community 26 - "Product Requirements Document (PRD)"
Cohesion: 0.20
Nodes (12): D-026: Commission = % of Agreed Fare, D-028: Fare Negotiation Bounds (Floor 80%, Ceiling 150%), Commission Calculation (% of Agreed Fare), Admin Persona, Agreed Fare, Driver Onboarding & KYC Verification, Integer Paise Money Standard, Product Requirements Document (PRD) (+4 more)

### Community 27 - "docs/engineering/testing.md"
Cohesion: 0.33
Nodes (6): Critical E2E User Flows, Edge-Case Testing Matrix, Adapter & Infrastructure Integration Testing, Cabzon Testing Pyramid, Business Invariant Regression Mandate, Deterministic Business Logic Unit Testing

### Community 28 - "contracts/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, module, moduleResolution, extends, include, @cabzone/config/tsconfig.base.json

### Community 29 - "Zone Engine"
Cohesion: 0.25
Nodes (8): D-025: Vehicle Category Pricing (CAB & E_RICKSHAW), D-027: Buffer Zone Distance (City Override + Global Default), Turf.js + MongoDB 2dsphere (Geospatial), Buffer Distance Fallback Classification, Point-in-Polygon Classification, Zone Classification (IN_CITY / OUTSTATION / INTERSTATE), Zone Engine, CityZone Entity

### Community 30 - "docs/engineering/coding-standards.md"
Cohesion: 0.33
Nodes (5): Explicit Distance & Date Standards, Ubiquitous Domain Terminology Naming, Smallest-Unit Integer Money Representation, Sensitive Data Redaction Logging Policy, Structured Error Representation

### Community 31 - "OTP Authentication Flow"
Cohesion: 0.33
Nodes (6): Auth Endpoints (/v1/auth/otp), OTP Authentication Flow, Refresh Token (rotating), Session (device-bound, revocable), sessions Collection, users Collection

### Community 32 - "docs/engineering/design-language.md"
Cohesion: 0.40
Nodes (4): Map Interaction & Zone Visualization Guidelines, Cabzon UI Design Character, Role-Based Interface Priorities, Multi-Modal Status Indicator Standard

### Community 33 - "docs/engineering/shared-packages.md"
Cohesion: 0.40
Nodes (4): packages/contracts Specification, packages/domain Specification, Shared Package Dependency & Non-Circularity Rules, packages/validation Specification

### Community 34 - "identity.test.ts"
Cohesion: 0.09
Nodes (21): canUserAuthenticate(), UserEntity, UserStatus, apps_api_src_modules_identity_index_adminuserentity, apps_api_src_modules_identity_index_adminusermodel, apps_api_src_modules_identity_index_canadminmanagezone, apps_api_src_modules_identity_index_candrivergoonline, apps_api_src_modules_identity_index_canuserauthenticate (+13 more)

### Community 35 - "mongoAdminUser.repository.ts"
Cohesion: 0.18
Nodes (10): AdminRole, AdminStatus, AdminUserEntity, canAdminManageZone(), AdminUserRepositoryPort, apps_api_src_modules_identity_domain_index_adminuserentity, apps_api_src_modules_identity_domain_index_adminuserrepositoryport, AdminUserModel (+2 more)

### Community 36 - "Interstate Route Segmentation"
Cohesion: 0.50
Nodes (4): D-035: Interstate Route Segmentation Pricing, Interstate Route Segmentation, StateSegment Interface, ZoneClassification Interface

### Community 37 - "Graphify Always-On Rule"
Cohesion: 0.67
Nodes (3): Graphify Always-On Rule, Graphify Workflow, Graphify Knowledge Graph (CLAUDE.md)

### Community 40 - "RBAC (Role-Based Access Control)"
Cohesion: 0.67
Nodes (3): Admin Endpoints (/v1/admin), RBAC (Role-Based Access Control), Admin (Actor - SUPER/CITY/SUPPORT/FINANCE)

### Community 53 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, @cabzone/config, dependency-cruiser, esbuild, pino-pretty, supertest, tsx, @types/cookie-parser (+6 more)

### Community 64 - "logger.ts"
Cohesion: 0.20
Nodes (11): isProduction, accessLogMiddleware(), isSilent(), SILENT_PATHS, getRequestId(), RequestContext, storage, REDACTED_PATHS (+3 more)

### Community 65 - "src/index.ts"
Cohesion: 0.17
Nodes (10): UserDocument, UserModel, userSchema, DependencyHealth, DependencyStatus, HealthReport, USER_STATUSES, UserStatus (+2 more)

### Community 66 - "identity.validation.ts"
Cohesion: 0.15
Nodes (12): adminStatusSchema, createAdminUserSchema, createDriverProfileSchema, driverKycStatusSchema, driverStatusSchema, phoneE164Schema, requestOtpSchema, updateDriverOperationalStatusSchema (+4 more)

### Community 67 - "my-notes.md"
Cohesion: 0.15
Nodes (12): 10. What happens if the wallet reaches zero during an active ride?, 11. What happens when a ride crosses a state?, 12. What happens if pricing changes after a rider requests a ride?, 1. What problem does Cabzon solve?, 2. Who are the three users/platforms?, 3. What happens when a rider requests a ride?, 4. What is Suggested Fare?, 5. What is Rider Proposed Fare? (+4 more)

### Community 68 - "adminUser.model.ts"
Cohesion: 0.22
Nodes (10): AdminUserDocument, adminUserSchema, ADMIN_ROLES, ADMIN_STATUSES, AdminRole, AdminStatus, packages_contracts_src_index_admin_roles, packages_contracts_src_index_admin_statuses (+2 more)

### Community 69 - "docs/engineering/boundaries-and-enforcement.md"
Cohesion: 0.18
Nodes (9): Application Boundary, Untrusted Client Security Boundary, Mechanical Boundary Enforcement, Authoritative Realtime Boundary, Rider and Driver Mobile Applications, Driver Mobile Responsibilities, Rider Mobile Responsibilities, Mobile Zero-Trust Security (+1 more)

### Community 70 - "env.ts"
Cohesion: 0.22
Nodes (8): allowDevShortcuts, isDevelopment, isProdLike, isStaging, isTest, parsed, schema, dotenv

### Community 71 - "persistence/index.ts"
Cohesion: 0.22
Nodes (4): emergencyContactSchema, RiderDocument, RiderModel, riderSchema

### Community 72 - "request-id.middleware.ts"
Cohesion: 0.43
Nodes (5): runWithContext(), REQUEST_ID_HEADER, requestIdMiddleware(), newRequestId(), uuid

### Community 73 - "esbuild.config.mjs"
Cohesion: 0.40
Nodes (4): external, pkg, esbuild, ref_node_fs

## Knowledge Gaps
- **407 isolated node(s):** `MODULE_TIERS`, `layeringRules`, `base`, `pkg`, `external` (+402 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 499 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `auth-middleware.test.ts` to `logger.ts`, `api/package.json`, `app.ts`, `health.container.ts`, `request-id.middleware.ts`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `mongoose` connect `domain/index.ts` to `src/index.ts`, `api/package.json`, `adminUser.model.ts`, `worker.ts`, `persistence/index.ts`, `identity.ts`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `MODULE_TIERS`, `layeringRules`, `base` to the rest of the system?**
  _407 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.0425531914893617 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._
- **Should `api/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `auth-middleware.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05576923076923077 - nodes in this community are weakly interconnected._