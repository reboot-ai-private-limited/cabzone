# Graph Report - cabzonenew  (2026-09-24)

## Corpus Check
- 686 files · ~25,000 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 686 nodes · 957 edges · 47 communities (37 shown, 10 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 37 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Express App & Runtime Infrastructure
- Health Check Domain & Probes
- Domain Errors & HTTP Client
- Next.js Web Frontend & Vitest
- API Build Tooling & ESBuild Config
- Root Dev Dependencies & Linting
- API Dependencies & Queue Pipeline
- Contracts Package & Tooling
- API Build & Dev Scripts
- API TypeScript Configuration
- React TypeScript Configuration
- Web TypeScript Configuration
- Web Dev Dependencies & ESLint React
- Contracts TypeScript Configuration
- Dependency Boundaries & Layer Rules
- API ESLint Configuration
- Shared Config TSConfig Extends
- Next.js Environment Typings
- Turborepo Build Pipeline
- Base TypeScript Configuration
- Development Docker Environment
- Graphify Rules & Workflows
- pnpm Workspace Configuration
- Dispatch Engine & Driver Ranking
- Engineering Invariants & Open Questions
- REST API Contracts & JWT Architecture
- Ride Negotiation Lifecycle & Concurrency Locks
- Testing Pyramid & Module Workflows
- Geofence Zones & Buffer Surcharges
- Mobile App Boundaries & Architecture
- Design System & Frontend Architecture
- Monorepo Packages & Layout
- Product Personas & Anti-Fraud Rules
- Fare Engine & Pricing Formulas
- Clean Architecture Layering
- Wallet Ledger & Commission Engine
- Coding Standards & Money Representation
- CI/CD & Observability Controls
- Documentation Map & Rules Hierarchy
- Module Anatomy & Encapsulation Rules
- Production Docker & Multi-Service Compose
- MongoDB Schema & Collections Specification

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 19 edges
2. `Decision Log` - 16 edges
3. `Database Schema LLD` - 15 edges
4. `scripts` - 14 edges
5. `Open Questions & Engineering Decisions` - 13 edges
6. `express` - 12 edges
7. `scripts` - 11 edges
8. `HealthProbePort` - 10 edges
9. `AppError` - 10 edges
10. `createApp()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Domain Layer Architecture` --conceptually_related_to--> `Standard Module Anatomy`  [INFERRED]
  docs/engineering/clean-architecture-and-solid.md → docs/engineering/module-anatomy.md
- `AppError` --references--> `FaultCode`  [EXTRACTED]
  apps/api/src/shared/errors/AppError.ts → packages/contracts/src/errors.ts
- `ApiError` --references--> `FaultCode`  [EXTRACTED]
  apps/web/src/lib/api/ApiError.ts → packages/contracts/src/errors.ts
- `Candidate Driver Discovery ($geoNear)` --references--> `Driver API Endpoints`  [EXTRACTED]
  docs/LLD/dispatch-engine.md → docs/LLD/api-contracts.md
- `Ride Lifecycle Real-Time Events` --references--> `Ride Finite State Machine`  [EXTRACTED]
  docs/LLD/websocket-contracts.md → docs/LLD/ride-lifecycle.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Containerized Multi-Environment Infrastructure** — docs_engineering_build_and_deploy_environments, docker_compose_prod, docker_compose_stage [EXTRACTED 1.00]
- **Driver Compliance, Verification, and Dispatch Gate Mechanism** — docs_prd_driver_onboarding_kyc, docs_lld_auth_role_based_access_control, docs_lld_wallet_and_commission_dispatch_eligibility_gate, docs_lld_dispatch_engine_candidate_discovery [EXTRACTED 1.00]
- **Geospatial Polygon Classification and Dynamic Fare Calculation System** — docs_lld_fare_engine_fare_calculation_formula, docs_lld_zone_engine_polygon_classification, docs_lld_zone_engine_interstate_route_detection, docs_decision_log_d_003_three_fare_concepts [EXTRACTED 1.00]
- **End-to-End Ride Request, Negotiation, Dispatch & Settlement Flow** — docs_lld_ride_lifecycle_finite_state_machine, docs_lld_negotiation_engine_bidding_lifecycle, docs_lld_dispatch_engine_dispatch_pipeline, docs_lld_wallet_and_commission_commission_deduction_model [EXTRACTED 1.00]
- **Domain Development and Verification Workflow** — docs_setup_development_workflow, docs_engineering_adding_a_module_workflow, docs_engineering_testing_unit_tests [INFERRED 0.85]
- **Architectural Boundary Enforcement Triangle** — docs_engineering_boundaries_and_enforcement_domain_boundary, docs_engineering_clean_architecture_and_solid_domain_layer, docs_engineering_module_anatomy_rules [INFERRED 0.95]

## Communities (47 total, 10 thin omitted)

### Community 0 - "Express App & Runtime Infrastructure"
Cohesion: 0.06
Nodes (55): Env, AppContainers, Request, RequestContext, QueueName, createApp(), loadEnv(), buildContainers() (+47 more)

### Community 4 - "Health Check Domain & Probes"
Cohesion: 0.14
Nodes (18): GetHealthUseCase, DependencyHealth, DependencyStatus, HealthReport, HealthProbePort, HealthContainer, HealthPublicContract, HealthReportContract (+10 more)

### Community 5 - "Domain Errors & HTTP Client"
Cohesion: 0.08
Nodes (17): AppError, ApiError, NetworkError, RequestOptions, FaultCode, DependencyHealth, DependencyStatus, HealthReport (+9 more)

### Community 2 - "Next.js Web Frontend & Vitest"
Cohesion: 0.04
Nodes (42): config, dependencies, @cabzone/contracts, lucide-react, next, react, react-dom, devDependencies (+34 more)

### Community 1 - "API Build Tooling & ESBuild Config"
Cohesion: 0.04
Nodes (45): external, pkg, devDependencies, @cabzone/config, dependency-cruiser, esbuild, pino-pretty, supertest (+37 more)

### Community 10 - "Root Dev Dependencies & Linting"
Cohesion: 0.10
Nodes (20): devDependencies, eslint, eslint-config-prettier, typescript, @typescript-eslint/eslint-plugin, @typescript-eslint/parser, exports, ./eslint.base.cjs (+12 more)

### Community 11 - "API Dependencies & Queue Pipeline"
Cohesion: 0.12
Nodes (17): dependencies, bullmq, @cabzone/contracts, cookie-parser, cors, dotenv, express, express-rate-limit (+9 more)

### Community 15 - "Contracts Package & Tooling"
Cohesion: 0.14
Nodes (13): devDependencies, @cabzone/config, typescript, exports, name, private, scripts, lint (+5 more)

### Community 18 - "API Build & Dev Scripts"
Cohesion: 0.18
Nodes (11): scripts, build, clean, dev, dev:worker, lint, lint:deps, start (+3 more)

### Community 19 - "API TypeScript Configuration"
Cohesion: 0.18
Nodes (10): compilerOptions, baseUrl, outDir, paths, rootDir, types, exclude, extends (+2 more)

### Community 25 - "React TypeScript Configuration"
Cohesion: 0.18
Nodes (10): compilerOptions, allowJs, jsx, lib, module, moduleResolution, display, extends (+2 more)

### Community 27 - "Web TypeScript Configuration"
Cohesion: 0.22
Nodes (8): compilerOptions, baseUrl, paths, plugins, exclude, extends, include, @cabzone/config/tsconfig.react.json

### Community 3 - "Web Dev Dependencies & ESLint React"
Cohesion: 0.04
Nodes (45): devDependencies, @cabzone/config, eslint, eslint-config-prettier, eslint-plugin-jsx-a11y, eslint-plugin-react, eslint-plugin-react-hooks, prettier (+37 more)

### Community 30 - "Contracts TypeScript Configuration"
Cohesion: 0.29
Nodes (6): compilerOptions, module, moduleResolution, extends, include, @cabzone/config/tsconfig.base.json

### Community 8 - "Turborepo Build Pipeline"
Cohesion: 0.07
Nodes (26): dependsOn, outputs, cache, persistent, cache, persistent, globalDependencies, globalEnv (+18 more)

### Community 9 - "Base TypeScript Configuration"
Cohesion: 0.09
Nodes (22): compilerOptions, declaration, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib, module (+14 more)

### Community 34 - "Development Docker Environment"
Cohesion: 0.67
Nodes (3): Mongo rs0 Initializer Service, Mongo 7 Replica Set Service, Redis 7 Alpine Service

### Community 36 - "Graphify Rules & Workflows"
Cohesion: 0.67
Nodes (3): Graphify Agent Rule, Graphify Workflow, Graphify Knowledge Graph Rules

### Community 12 - "Dispatch Engine & Driver Ranking"
Cohesion: 0.19
Nodes (15): Candidate Driver Discovery ($geoNear), Dispatch Pipeline Flow, Driver Scoring and Ranking Algorithm, Direct Ride Offer Delivery, OQ-007 Offer Expiration Workflow, OQ-012 Driver Dispatch Eligibility Gate, Driver Minimum Balance Dispatch Gate, Driver Telemetry and Location Updates (+7 more)

### Community 13 - "Engineering Invariants & Open Questions"
Cohesion: 0.19
Nodes (15): Engineering Defaults and Invariants, OQ-001 Vehicle Type Pricing Variation, OQ-005 Mid-Trip Extension Policy, OQ-008 Cancellation Policy and Penalties, OQ-009 Cash Payment Confirmation, OQ-011 Interstate Route Pricing, Cancellation and Driver No-Show Mechanics, Ride Finite State Machine (+7 more)

### Community 14 - "REST API Contracts & JWT Architecture"
Cohesion: 0.16
Nodes (14): Admin API Endpoints, API Success and Error Envelopes, Auth API Endpoints, Driver API Endpoints, Rider API Endpoints, JWT Access and Refresh Token Architecture, Phone OTP Authentication, Role-Based Access Control (+6 more)

### Community 16 - "Ride Negotiation Lifecycle & Concurrency Locks"
Cohesion: 0.21
Nodes (12): Ride API Endpoints, Refresh Token Rotation and Reuse Detection, Distributed Concurrency Lock for Ride Assignment, Fare Negotiation Bidding Lifecycle, Driver Offer Acceptance and Race Condition Handling, Negotiation Fraud and Anomalous Bidding Detection, Counter-Offer Bounds Validation, OQ-004 Fare Negotiation Limits (+4 more)

### Community 17 - "Testing Pyramid & Module Workflows"
Cohesion: 0.20
Nodes (10): Module Minimum Testing Requirements, Adding a Module Workflow, Critical E2E User Flows, Edge-Case Testing Matrix, Adapter & Infrastructure Integration Testing, Cabzon Testing Pyramid, Deterministic Business Logic Unit Testing, Sequential Domain Development Order (+2 more)

### Community 20 - "Geofence Zones & Buffer Surcharges"
Cohesion: 0.29
Nodes (11): Buffer Surcharge Computation, OQ-003 Buffer Zone Distance, Buffer Zone Radial Fallback, Immutable Zone Configuration Freeze, Interstate Border Crossing Detection, Polygon Geofence Classification ($geoIntersects), Multi-State Route Segmentation and Pricing, Zone Engine LLD (+3 more)

### Community 21 - "Mobile App Boundaries & Architecture"
Cohesion: 0.18
Nodes (9): Application Boundary, Mechanical Boundary Enforcement, Rider and Driver Mobile Applications, Driver Mobile Responsibilities, Rider Mobile Responsibilities, Untrusted Client Security Boundary, Authoritative Realtime Boundary, Mobile Zero-Trust Security (+1 more)

### Community 22 - "Design System & Frontend Architecture"
Cohesion: 0.18
Nodes (9): Map Interaction & Zone Visualization Guidelines, Cabzon UI Design Character, Role-Based Interface Priorities, Admin Web Feature Modular Architecture, Frontend API Abstraction Boundary, Frontend Realtime Contract Consumption, Multi-Modal Status Indicator Standard, Feature Ownership Boundary (+1 more)

### Community 23 - "Monorepo Packages & Layout"
Cohesion: 0.20
Nodes (8): Monorepo Proposed Directory Structure, Cabzon Engineering Handbook, packages/contracts Specification, packages/domain Specification, packages/validation Specification, Monorepo Package & App Isolation Rules, Source Boundary Rule, Shared Package Dependency & Non-Circularity Rules

### Community 24 - "Product Personas & Anti-Fraud Rules"
Cohesion: 0.18
Nodes (11): Anti-Fraud Loopholes and Defenses, Driver Onboarding and KYC Verification, Driver Wallet and Commission, Admin Persona, Driver Persona, Rider Persona, Ratings, Trust and History, Ride Request and Negotiation (+3 more)

### Community 26 - "Fare Engine & Pricing Formulas"
Cohesion: 0.29
Nodes (10): Base Route Fare Calculation Formula, Immutable Fare Snapshotting, Included Kilometres Rule, Negotiation Floor and Ceiling Computation, Decision Log, Fare Engine LLD, D-003 Three Fare Concepts, D-004 Route-Based Fare Calculation (+2 more)

### Community 28 - "Clean Architecture Layering"
Cohesion: 0.28
Nodes (8): Application Layer Use Cases, Domain Layer Architecture, Infrastructure Layer Adapters, Interface Presentation Layer, Domain Layer Boundary, Offline Domain Testability Rule, SOLID Architecture Application, Monorepo Dependency Direction Flow

### Community 29 - "Wallet Ledger & Commission Engine"
Cohesion: 0.36
Nodes (8): Wallet API Endpoints, OQ-002 Driver Commission Calculation, Wallet Balance Invariant, Platform Commission Snapshot and Post-Ride Deduction, Immutable Double-Entry Ledger, Wallet Top-up and Dispute Reversals, Wallet & Commission LLD, D-016 Commission Model

### Community 31 - "Coding Standards & Money Representation"
Cohesion: 0.33
Nodes (5): Explicit Distance & Date Standards, Ubiquitous Domain Terminology Naming, Structured Error Representation, Smallest-Unit Integer Money Representation, Sensitive Data Redaction Logging Policy

### Community 32 - "CI/CD & Observability Controls"
Cohesion: 0.40
Nodes (4): Automated Pull Request Verification Flow, Production Observability Minimums, Database Migration and Rollback Controls, Reproducible Build Principles

### Community 33 - "Documentation Map & Rules Hierarchy"
Cohesion: 0.40
Nodes (5): Core Fare Rule, Core Zone Rule, Cabzon Documentation Map, Source of Truth Hierarchy, Cabzon Documentation Hub

### Community 35 - "Module Anatomy & Encapsulation Rules"
Cohesion: 0.50
Nodes (3): Ride Module Reference Structure, Standard Module Anatomy, Module Encapsulation and Access Rules

### Community 6 - "Production Docker & Multi-Service Compose"
Cohesion: 0.11
Nodes (23): API Service (Production), Mongo Service (Production), Mongo Replica Set Init (Production), Redis Service (Production), Next.js Web Service (Production), Background Worker Service (Production), API Service (Staging), Mongo Service (Staging) (+15 more)

### Community 7 - "MongoDB Schema & Collections Specification"
Cohesion: 0.11
Nodes (27): audit_logs Collection, driver_applications Collection, driver_documents Collection, drivers Collection, fare_snapshots Collection, pricing_configs Collection, reviews Collection, ride_offers Collection (+19 more)

## Knowledge Gaps
- **323 isolated node(s):** `Request`, `RequestContext`, `QueueName`, `DependencyStatus`, `RequestOptions` (+318 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 367 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `Health Check Domain & Probes` to `Express App & Runtime Infrastructure`, `API Build Tooling & ESBuild Config`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `dependencies` connect `API Dependencies & Queue Pipeline` to `API Build Tooling & ESBuild Config`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `Request`, `RequestContext`, `QueueName` to the rest of the system?**
  _323 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Express App & Runtime Infrastructure` be split into smaller, more focused modules?**
  _Cohesion score 0.06278538812785388 - nodes in this community are weakly interconnected._
- **Should `Health Check Domain & Probes` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `Domain Errors & HTTP Client` be split into smaller, more focused modules?**
  _Cohesion score 0.08235294117647059 - nodes in this community are weakly interconnected._
- **Should `Next.js Web Frontend & Vitest` be split into smaller, more focused modules?**
  _Cohesion score 0.0425531914893617 - nodes in this community are weakly interconnected._