# Graph Report - cabzonenew  (2026-09-25)

## Corpus Check
- 243 files · ~62,060 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 5, .example 5, .css 1)

## Summary
- 1697 nodes · 3629 edges · 119 communities (92 shown, 27 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 52 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `129bf3e1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- web/package.json
- package.json
- api/package.json
- kyc-vehicle.test.ts
- response.util.ts
- health.container.ts
- worker.ts
- Cabzone Platform
- tasks
- Ride (Central Transactional Aggregate)
- docs/engineering/clean-architecture-and-solid.md
- compilerOptions
- config/package.json
- pricingConfig.model.ts
- dependencies
- docker-compose.prod.yml
- contracts/package.json
- SessionEntity
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
- Technology Stack
- docs/engineering/coding-standards.md
- OTP Authentication Flow
- docs/engineering/design-language.md
- requestOtp.usecase.ts
- identity.test.ts
- AdminUserEntity
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
- identity.container.ts
- Auth Invariants
- JWT Access Token
- idempotency_keys Collection
- System (Automated Backend Actor)
- Wallet Top-Up Flow
- driver.location.updated Event
- Negotiable Fares (Differentiator)
- Zone-Based Pricing Model
- ZoneRepositoryPort
- user.model.ts
- identity.validation.ts
- my-notes.md
- adminUser.model.ts
- docs/engineering/boundaries-and-enforcement.md
- RiderEntity
- mongoose
- 2. Complete User Journey & Screen Flows (Curated from Mobbin)
- driverDocument.model.ts
- kyc.validation.ts
- AppError
- identity/domain/index.ts
- DriverDocumentEntity
- VehicleEntity
- zone.container.ts
- src/index.ts
- ZoneEntity
- DriverApplicationEntity
- zone-pricing.test.ts
- ride-negotiation.test.ts
- driver-onboarding-api.test.ts
- DriverRepositoryPort
- driverApplication.model.ts
- fareNegotiation.model.ts
- UserEntity
- app.ts
- ride.model.ts
- payment.model.ts
- walletTransaction.model.ts
- buildIdentityContainer
- rideExtension.model.ts
- zone-resolution.test.ts
- access-log.middleware.ts
- statePricing.model.ts
- wallet-ledger.test.ts
- rideEvent.model.ts
- authenticate.middleware.ts
- resolveZones.usecase.ts
- express
- ledger.validation.ts
- env.ts
- ledger/domain/index.ts
- rides.validation.ts
- vehicle.model.ts
- verifyOtp.usecase.ts
- scripts
- VehicleCategory
- health.ts
- pricing.validation.ts
- rides.ts
- esbuild.config.mjs
- driver.routes.ts

## God Nodes (most connected - your core abstractions)
1. `buildIdentityContainer()` - 42 edges
2. `ZoneEntity` - 36 edges
3. `DriverRepositoryPort` - 31 edges
4. `AppError` - 31 edges
5. `DriverApplicationEntity` - 29 edges
6. `SessionEntity` - 29 edges
7. `createTestApp()` - 28 edges
8. `express` - 27 edges
9. `DriverEntity` - 27 edges
10. `DriverDocumentEntity` - 27 edges

## Surprising Connections (you probably didn't know these)
- `ResolveZonesInput` --references--> `GeoPoint`  [EXTRACTED]
  apps/api/src/modules/zone/application/useCases/resolveZones.usecase.ts → packages/contracts/src/zones.ts
- `Cabzone Platform` --references--> `Ride (Central Transactional Aggregate)`  [INFERRED]
  README.md → docs/LLD/domain-model.md
- `RegisterDriverVehicleDto` --references--> `VehicleCategory`  [EXTRACTED]
  apps/api/src/modules/identity/application/useCases/registerDriverVehicle.usecase.ts → packages/contracts/src/vehicles.ts
- `ReviewDriverApplicationDto` --references--> `RejectionType`  [EXTRACTED]
  apps/api/src/modules/identity/application/useCases/reviewDriverApplication.usecase.ts → packages/contracts/src/kyc.ts
- `UploadDriverDocumentDto` --references--> `DocumentType`  [EXTRACTED]
  apps/api/src/modules/identity/application/useCases/uploadDriverDocument.usecase.ts → packages/contracts/src/kyc.ts

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

## Communities (119 total, 27 thin omitted)

### Community 0 - "web/package.json"
Cohesion: 0.04
Nodes (41): config, dependencies, @cabzone/contracts, lucide-react, next, react, react-dom, devDependencies (+33 more)

### Community 1 - "package.json"
Cohesion: 0.04
Nodes (45): devDependencies, @cabzone/config, eslint, eslint-config-prettier, eslint-plugin-jsx-a11y, eslint-plugin-react, eslint-plugin-react-hooks, prettier (+37 more)

### Community 2 - "api/package.json"
Cohesion: 0.08
Nodes (23): @cabzone/config, @cabzone/contracts, @types/node, typescript, vitest, name, private, type (+15 more)

### Community 3 - "kyc-vehicle.test.ts"
Cohesion: 0.12
Nodes (15): apps_api_src_modules_identity_index_candriverreapply, apps_api_src_modules_identity_index_cansubmitapplication, apps_api_src_modules_identity_index_createvehicleschema, apps_api_src_modules_identity_index_driverapplicationentity, apps_api_src_modules_identity_index_driverapplicationmodel, apps_api_src_modules_identity_index_driverdocumententity, apps_api_src_modules_identity_index_driverdocumentmodel, apps_api_src_modules_identity_index_isdocumentvalid (+7 more)

### Community 4 - "response.util.ts"
Cohesion: 0.12
Nodes (15): isProdLike, meta(), ApiError, NetworkError, request(), RequestOptions, HttpBody, HttpErrorBody (+7 more)

### Community 5 - "health.container.ts"
Cohesion: 0.16
Nodes (16): GetHealthUseCase, DependencyHealth, DependencyStatus, HealthReport, summarise(), HealthProbePort, buildHealthContainer(), HealthContainer (+8 more)

### Community 6 - "worker.ts"
Cohesion: 0.25
Nodes (16): env, loadEnv(), main(), CONNECTION_STATES, connectMongo(), disconnectMongo(), logger, closeQueues() (+8 more)

### Community 7 - "Cabzone Platform"
Cohesion: 0.14
Nodes (21): MongoDB Dev Service (docker-compose.dev.yml), Redis Dev Service (docker-compose.dev.yml), Decision Log (ADR), Adding a Module Checklist, Ride Module Reference Structure, Module Encapsulation and Access Rules, Standard Module Anatomy, Engineering Handbook (+13 more)

### Community 8 - "tasks"
Cohesion: 0.07
Nodes (26): dependsOn, outputs, cache, persistent, cache, persistent, globalDependencies, globalEnv (+18 more)

### Community 9 - "Ride (Central Transactional Aggregate)"
Cohesion: 0.05
Nodes (42): Driver Endpoints (/v1/drivers), Ride Endpoints (/v1/rides), Wallet Endpoints (/v1/drivers/me/wallet), Authentication != Driver Eligibility, city_zones Collection, Concurrency Rules (atomic ride assignment, wallet debit), drivers Collection, fare_negotiations Collection (+34 more)

### Community 10 - "docs/engineering/clean-architecture-and-solid.md"
Cohesion: 0.38
Nodes (6): Application Layer Use Cases, Domain Layer Architecture, Infrastructure Layer Adapters, Interface Presentation Layer, Offline Domain Testability Rule, SOLID Architecture Application

### Community 11 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, declaration, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib, module (+14 more)

### Community 12 - "config/package.json"
Cohesion: 0.10
Nodes (20): devDependencies, eslint, eslint-config-prettier, typescript, @typescript-eslint/eslint-plugin, @typescript-eslint/parser, exports, ./eslint.base.cjs (+12 more)

### Community 13 - "pricingConfig.model.ts"
Cohesion: 0.21
Nodes (10): calculateBaseFareEstimate(), isPricingConfigEffective(), PricingConfigEntity, PricingConfigDocument, PricingConfigModel, pricingConfigSchema, packages_contracts_src_index_pricing_config_statuses, packages_contracts_src_index_pricingconfigstatus (+2 more)

### Community 14 - "dependencies"
Cohesion: 0.06
Nodes (31): dependencies, bullmq, @cabzone/contracts, cookie-parser, cors, dotenv, express, express-rate-limit (+23 more)

### Community 15 - "docker-compose.prod.yml"
Cohesion: 0.25
Nodes (12): API Service (Production), Mongo Service (Production), Mongo Replica Set Init (Production), Redis Service (Production), Next.js Web Service (Production), Background Worker Service (Production), API Service (Staging), Mongo Service (Staging) (+4 more)

### Community 16 - "contracts/package.json"
Cohesion: 0.14
Nodes (13): devDependencies, @cabzone/config, typescript, exports, @cabzone/config, typescript, name, private (+5 more)

### Community 17 - "SessionEntity"
Cohesion: 0.07
Nodes (11): LogoutDeps, isSessionActive(), SessionEntity, SessionRepositoryPort, MongoSessionRepository, SessionDocument, SessionModel, sessionSchema (+3 more)

### Community 18 - "Monorepo Layout"
Cohesion: 0.20
Nodes (12): esbuild Bundle (server.js + worker.js), Turborepo CI/CD Pipeline, Admin Web Console (Next.js 15 App Router), API Client SDK (HttpSuccessBody / ApiError), apps/api (@cabzone/api), apps/web (@cabzone/web), Clean Architecture Modular Monolith, Monorepo Layout (+4 more)

### Community 19 - "identity.ts"
Cohesion: 0.13
Nodes (16): DriverDocument, AdminUserDto, AUTH_ROLES, AuthenticatedUserSummary, DriverDto, DriverKycStatus, DriverOperationalStatus, DriverStatus (+8 more)

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

### Community 29 - "Technology Stack"
Cohesion: 0.20
Nodes (11): D-025: Vehicle Category Pricing (CAB & E_RICKSHAW), D-027: Buffer Zone Distance (City Override + Global Default), BullMQ Background Worker, Redis 7 (Cache & BullMQ), Technology Stack, Turf.js + MongoDB 2dsphere (Geospatial), Buffer Distance Fallback Classification, Point-in-Polygon Classification (+3 more)

### Community 30 - "docs/engineering/coding-standards.md"
Cohesion: 0.33
Nodes (5): Explicit Distance & Date Standards, Ubiquitous Domain Terminology Naming, Smallest-Unit Integer Money Representation, Sensitive Data Redaction Logging Policy, Structured Error Representation

### Community 31 - "OTP Authentication Flow"
Cohesion: 0.33
Nodes (6): Auth Endpoints (/v1/auth/otp), OTP Authentication Flow, Refresh Token (rotating), Session (device-bound, revocable), sessions Collection, users Collection

### Community 32 - "docs/engineering/design-language.md"
Cohesion: 0.18
Nodes (8): Map Interaction & Zone Visualization Guidelines, Cabzon UI Design Character, Role-Based Interface Priorities, Multi-Modal Status Indicator Standard, packages/contracts Specification, packages/domain Specification, Shared Package Dependency & Non-Circularity Rules, packages/validation Specification

### Community 33 - "requestOtp.usecase.ts"
Cohesion: 0.13
Nodes (9): RequestOtpDeps, apps_api_src_modules_identity_domain_index_otprecord, apps_api_src_modules_identity_domain_index_otpstoreport, apps_api_src_modules_identity_domain_index_smsgatewayport, OtpRecord, OtpStorePort, SmsGatewayPort, MemoryOtpStoreAdapter (+1 more)

### Community 34 - "identity.test.ts"
Cohesion: 0.11
Nodes (18): apps_api_src_modules_identity_index_adminuserentity, apps_api_src_modules_identity_index_adminusermodel, apps_api_src_modules_identity_index_canadminmanagezone, apps_api_src_modules_identity_index_candrivergoonline, apps_api_src_modules_identity_index_canuserauthenticate, apps_api_src_modules_identity_index_createadminuserschema, apps_api_src_modules_identity_index_createdriverprofileschema, apps_api_src_modules_identity_index_driverentity (+10 more)

### Community 35 - "AdminUserEntity"
Cohesion: 0.24
Nodes (5): AdminUserEntity, IdentityContainerDeps, ConsoleSmsGatewayAdapter, MongoAdminUserRepository, MemoryAdminUserRepository

### Community 36 - "Interstate Route Segmentation"
Cohesion: 0.50
Nodes (4): D-035: Interstate Route Segmentation Pricing, Interstate Route Segmentation, StateSegment Interface, ZoneClassification Interface

### Community 37 - "Graphify Always-On Rule"
Cohesion: 0.67
Nodes (3): Graphify Always-On Rule, Graphify Workflow, Graphify Knowledge Graph (CLAUDE.md)

### Community 40 - "RBAC (Role-Based Access Control)"
Cohesion: 0.67
Nodes (3): Admin Endpoints (/v1/admin), RBAC (Role-Based Access Control), Admin (Actor - SUPER/CITY/SUPPORT/FINANCE)

### Community 53 - "identity.container.ts"
Cohesion: 0.08
Nodes (22): CreateDriverApplicationUseCase, CreateDriverProfileUseCase, GetDriverProfileUseCase, apps_api_src_modules_identity_application_usecases_index_createdriverapplicationusecase, apps_api_src_modules_identity_application_usecases_index_createdriverprofileusecase, apps_api_src_modules_identity_application_usecases_index_getdriverprofileusecase, apps_api_src_modules_identity_application_usecases_index_registerdrivervehicleusecase, apps_api_src_modules_identity_application_usecases_index_reviewdriverapplicationusecase (+14 more)

### Community 64 - "ZoneRepositoryPort"
Cohesion: 0.15
Nodes (16): CreateZoneDeps, GetZoneDeps, ListZonesDeps, UpdateZoneDeps, apps_api_src_modules_zone_domain_index_zoneentitytodto, apps_api_src_modules_zone_domain_index_zonefilter, apps_api_src_modules_zone_domain_index_zonerepositoryport, zoneEntityToDto() (+8 more)

### Community 65 - "user.model.ts"
Cohesion: 0.31
Nodes (7): UserDocument, UserModel, userSchema, USER_STATUSES, UserStatus, packages_contracts_src_index_user_statuses, packages_contracts_src_index_userstatus

### Community 66 - "identity.validation.ts"
Cohesion: 0.10
Nodes (23): DriverModel, driverSchema, adminStatusSchema, createAdminUserSchema, createDriverProfileSchema, driverKycStatusSchema, driverStatusSchema, phoneE164Schema (+15 more)

### Community 67 - "my-notes.md"
Cohesion: 0.15
Nodes (12): 10. What happens if the wallet reaches zero during an active ride?, 11. What happens when a ride crosses a state?, 12. What happens if pricing changes after a rider requests a ride?, 1. What problem does Cabzon solve?, 2. Who are the three users/platforms?, 3. What happens when a rider requests a ride?, 4. What is Suggested Fare?, 5. What is Rider Proposed Fare? (+4 more)

### Community 68 - "adminUser.model.ts"
Cohesion: 0.20
Nodes (11): AdminUserDocument, AdminUserModel, adminUserSchema, ADMIN_ROLES, ADMIN_STATUSES, AdminRole, AdminStatus, packages_contracts_src_index_admin_roles (+3 more)

### Community 69 - "docs/engineering/boundaries-and-enforcement.md"
Cohesion: 0.17
Nodes (10): Application Boundary, Untrusted Client Security Boundary, Domain Layer Boundary, Mechanical Boundary Enforcement, Authoritative Realtime Boundary, Rider and Driver Mobile Applications, Driver Mobile Responsibilities, Rider Mobile Responsibilities (+2 more)

### Community 70 - "RiderEntity"
Cohesion: 0.20
Nodes (7): RiderEntity, MongoRiderRepository, emergencyContactSchema, RiderDocument, RiderModel, riderSchema, MemoryRiderRepository

### Community 71 - "mongoose"
Cohesion: 0.17
Nodes (8): PaymentEventDocument, PaymentEventModel, paymentEventSchema, WalletModel, walletSchema, packages_contracts_src_index_wallet_statuses, packages_contracts_src_index_walletstatus, mongoose

### Community 72 - "2. Complete User Journey & Screen Flows (Curated from Mobbin)"
Cohesion: 0.12
Nodes (16): 1. Executive Overview & Core Value Proposition, 2.1 Authentication & Onboarding, 2.2 Home Screen & Discovery, 2.3 Ride Request & The Fare Bidding Engine, 2.4 Active Ride & Tracking, 2.5 Trip Completion & History, 2.6 Intercity ("City to City") Booking Flow, 2.7 Courier & Freight Service Flows (+8 more)

### Community 73 - "driverDocument.model.ts"
Cohesion: 0.18
Nodes (13): UploadDriverDocumentDto, isDocumentValid(), DriverDocumentDocument, DriverDocumentModel, driverDocumentSchema, packages_contracts_src_index_document_types, packages_contracts_src_index_document_verification_statuses, packages_contracts_src_index_documenttype (+5 more)

### Community 76 - "kyc.validation.ts"
Cohesion: 0.13
Nodes (14): createVehicleSchema, documentTypeSchema, documentVerificationStatusSchema, driverApplicationStatusSchema, registerVehicleRequestSchema, reviewApplicationRequestSchema, reviewDriverApplicationSchema, submitDriverApplicationSchema (+6 more)

### Community 77 - "AppError"
Cohesion: 0.17
Nodes (14): CreateDriverApplicationDeps, ReviewDriverApplicationDeps, SubmitDriverApplicationDeps, UploadDriverDocumentDeps, DriverDocumentRepositoryPort, apps_api_src_modules_identity_domain_index_cansubmitapplication, apps_api_src_modules_identity_domain_index_driverapplicationentity, apps_api_src_modules_identity_domain_index_driverapplicationrepositoryport (+6 more)

### Community 78 - "identity/domain/index.ts"
Cohesion: 0.11
Nodes (19): RefreshTokenDeps, VerifyOtpDeps, AdminRole, AdminStatus, canAdminManageZone(), AdminUserRepositoryPort, canDriverGoOnline(), DriverEligibilityResult (+11 more)

### Community 79 - "DriverDocumentEntity"
Cohesion: 0.19
Nodes (3): DriverDocumentEntity, MongoDriverDocumentRepository, MemoryDriverDocumentRepository

### Community 80 - "VehicleEntity"
Cohesion: 0.18
Nodes (5): RegisterDriverVehicleDeps, VehicleEntity, VehicleRepositoryPort, MongoVehicleRepository, MemoryVehicleRepository

### Community 81 - "zone.container.ts"
Cohesion: 0.11
Nodes (23): CreateZoneUseCase, GetZoneUseCase, apps_api_src_modules_zone_application_usecases_index_createzoneusecase, apps_api_src_modules_zone_application_usecases_index_getzoneusecase, apps_api_src_modules_zone_application_usecases_index_listzonesusecase, apps_api_src_modules_zone_application_usecases_index_resolvezonesusecase, apps_api_src_modules_zone_application_usecases_index_updatezoneusecase, ListZonesUseCase (+15 more)

### Community 82 - "src/index.ts"
Cohesion: 0.14
Nodes (24): CityZoneEntity, CityZoneDocument, cityZoneSchema, polygonSchema, apps_api_src_modules_zone_domain_index_zoneentity, ZoneFilter, polygonSchema, ZoneDocument (+16 more)

### Community 83 - "ZoneEntity"
Cohesion: 0.20
Nodes (6): isPointInPolygon(), ZoneEntity, MemoryZoneRepository, MongoZoneRepository, setupRepo(), GeoPoint

### Community 84 - "DriverApplicationEntity"
Cohesion: 0.19
Nodes (6): DriverProfileDetail, GetDriverProfileDeps, DriverApplicationEntity, DriverApplicationRepositoryPort, MongoDriverApplicationRepository, MemoryDriverApplicationRepository

### Community 85 - "zone-pricing.test.ts"
Cohesion: 0.11
Nodes (17): getEffectiveBufferDistance(), apps_api_src_modules_pricing_index_calculatebasefareestimate, apps_api_src_modules_pricing_index_cityzoneentity, apps_api_src_modules_pricing_index_cityzonemodel, apps_api_src_modules_pricing_index_createcityzoneschema, apps_api_src_modules_pricing_index_createpricingconfigschema, apps_api_src_modules_pricing_index_createstatepricingschema, apps_api_src_modules_pricing_index_geteffectivebufferdistance (+9 more)

### Community 86 - "ride-negotiation.test.ts"
Cohesion: 0.17
Nodes (11): apps_api_src_modules_rides_index_cancancelride, apps_api_src_modules_rides_index_cancelrideschema, apps_api_src_modules_rides_index_cantransitionride, apps_api_src_modules_rides_index_farenegotiationmodel, apps_api_src_modules_rides_index_isnegotiationwithinbounds, apps_api_src_modules_rides_index_proposefareschema, apps_api_src_modules_rides_index_requestrideschema, apps_api_src_modules_rides_index_rideentity (+3 more)

### Community 87 - "driver-onboarding-api.test.ts"
Cohesion: 0.09
Nodes (30): apps_api_src_modules_identity_domain_index_adminuserentity, apps_api_src_modules_identity_domain_index_riderentity, apps_api_src_modules_identity_domain_index_riderrepositoryport, apps_api_src_modules_identity_domain_index_sessionentity, apps_api_src_modules_identity_domain_index_userentity, apps_api_src_modules_identity_domain_index_userrepositoryport, apps_api_src_modules_identity_index_buildadmindriverrouter, apps_api_src_modules_identity_index_buildauthrouter (+22 more)

### Community 88 - "DriverRepositoryPort"
Cohesion: 0.15
Nodes (8): CreateDriverProfileDeps, DriverEntity, DriverRepositoryPort, apps_api_src_modules_identity_domain_index_driverentity, apps_api_src_modules_identity_domain_index_driverrepositoryport, MongoDriverRepository, MemoryDriverRepository, MemoryDriverRepository

### Community 89 - "driverApplication.model.ts"
Cohesion: 0.15
Nodes (19): ReviewDriverApplicationDto, canDriverReapply(), DriverApplicationDocument, DriverApplicationModel, driverApplicationSchema, packages_contracts_src_index_driver_application_statuses, packages_contracts_src_index_driverapplicationstatus, packages_contracts_src_index_rejection_types (+11 more)

### Community 90 - "fareNegotiation.model.ts"
Cohesion: 0.20
Nodes (13): FareNegotiationEntity, isNegotiationWithinBounds(), FareNegotiationDocument, FareNegotiationModel, fareNegotiationSchema, packages_contracts_src_index_negotiation_actions, packages_contracts_src_index_negotiation_actors, packages_contracts_src_index_negotiationaction (+5 more)

### Community 91 - "UserEntity"
Cohesion: 0.18
Nodes (6): canUserAuthenticate(), UserEntity, UserStatus, UserRepositoryPort, MongoUserRepository, MemoryUserRepository

### Community 92 - "app.ts"
Cohesion: 0.22
Nodes (12): createApp(), AppContainers, buildContainers(), buildApiRouter(), causeChain(), errorHandler(), notFoundHandler(), Express (+4 more)

### Community 93 - "ride.model.ts"
Cohesion: 0.16
Nodes (20): canCancelRide(), canTransitionRide(), LocationPoint, PassengerInfo, RideEntity, RouteSnapshot, VALID_RIDE_TRANSITIONS, ZoneSnapshot (+12 more)

### Community 94 - "payment.model.ts"
Cohesion: 0.18
Nodes (15): isPaymentSettled(), PaymentEntity, PaymentDocument, PaymentModel, paymentSchema, packages_contracts_src_index_payment_methods, packages_contracts_src_index_payment_statuses, packages_contracts_src_index_paymentmethod (+7 more)

### Community 95 - "walletTransaction.model.ts"
Cohesion: 0.27
Nodes (10): WalletTransactionEntity, WalletTransactionDocument, WalletTransactionModel, walletTransactionSchema, packages_contracts_src_index_transaction_reference_types, packages_contracts_src_index_transactionreferencetype, packages_contracts_src_index_wallet_transaction_types, packages_contracts_src_index_wallettransactiontype (+2 more)

### Community 96 - "buildIdentityContainer"
Cohesion: 0.28
Nodes (18): ReviewDriverApplicationUseCase, buildIdentityContainer(), IdentityContainer, makeLogoutController(), makeCreateDriverApplicationController(), makeCreateDriverProfileController(), makeGetDriverProfileController(), makeRegisterDriverVehicleController() (+10 more)

### Community 97 - "rideExtension.model.ts"
Cohesion: 0.16
Nodes (10): LocationCoordinates, RideExtensionEntity, pointSchema, RideExtensionDocument, RideExtensionModel, rideExtensionSchema, packages_contracts_src_index_extension_statuses, packages_contracts_src_index_extensionstatus (+2 more)

### Community 98 - "zone-resolution.test.ts"
Cohesion: 0.12
Nodes (16): ServiceClassificationUseCase, apps_api_src_modules_zone_index_createzoneschema, apps_api_src_modules_zone_index_geojsonpolygonschema, apps_api_src_modules_zone_index_memoryzonerepository, apps_api_src_modules_zone_index_resolvezonesrequestschema, apps_api_src_modules_zone_index_resolvezonesusecase, apps_api_src_modules_zone_index_serviceclassificationusecase, apps_api_src_modules_zone_index_zoneentity (+8 more)

### Community 99 - "access-log.middleware.ts"
Cohesion: 0.19
Nodes (12): accessLogMiddleware(), isSilent(), SILENT_PATHS, getRequestId(), RequestContext, runWithContext(), storage, REQUEST_ID_HEADER (+4 more)

### Community 100 - "statePricing.model.ts"
Cohesion: 0.17
Nodes (9): isStatePricingEffective(), StatePricingEntity, StatePricingDocument, StatePricingModel, statePricingSchema, packages_contracts_src_index_state_pricing_statuses, packages_contracts_src_index_statepricingstatus, STATE_PRICING_STATUSES (+1 more)

### Community 101 - "wallet-ledger.test.ts"
Cohesion: 0.11
Nodes (19): calculateNewBalance(), isDriverEligibleForNewRides(), isWalletActive(), WalletEntity, apps_api_src_modules_ledger_index_adminadjustwalletschema, apps_api_src_modules_ledger_index_calculatenewbalance, apps_api_src_modules_ledger_index_isdrivereligiblefornewrides, apps_api_src_modules_ledger_index_ispaymentsettled (+11 more)

### Community 102 - "rideEvent.model.ts"
Cohesion: 0.22
Nodes (12): RideEventEntity, RideEventDocument, RideEventModel, rideEventSchema, packages_contracts_src_index_ride_event_actors, packages_contracts_src_index_ride_statuses, packages_contracts_src_index_rideeventactor, packages_contracts_src_index_ridestatus (+4 more)

### Community 103 - "authenticate.middleware.ts"
Cohesion: 0.12
Nodes (14): apps_api_src_modules_identity_domain_index_issessionactive, apps_api_src_modules_identity_domain_index_tokensignerport, apps_api_src_modules_identity_domain_index_tokenverifierport, TokenVerifierPort, Express, Request, AuthenticateDeps, AuthContext (+6 more)

### Community 104 - "resolveZones.usecase.ts"
Cohesion: 0.13
Nodes (17): ResolveZonesDeps, ResolveZonesInput, ClassifyServiceInput, apps_api_src_modules_zone_domain_index_distancetopolygonm, apps_api_src_modules_zone_domain_index_geteffectivebufferdistance, apps_api_src_modules_zone_domain_index_ispointinpolygon, distanceToPolygonM(), getEffectiveBufferDistance() (+9 more)

### Community 105 - "express"
Cohesion: 0.12
Nodes (16): apps_api_src_modules_identity_application_usecases_index_logoutusecase, apps_api_src_modules_identity_application_usecases_index_refreshtokenusecase, apps_api_src_modules_identity_application_usecases_index_requestotpusecase, apps_api_src_modules_identity_application_usecases_index_verifyotpusecase, LogoutUseCase, RefreshTokenUseCase, RequestOtpUseCase, VerifyOtpUseCase (+8 more)

### Community 106 - "ledger.validation.ts"
Cohesion: 0.15
Nodes (13): adminAdjustWalletSchema, paymentMethodSchema, paymentStatusSchema, rechargeWalletSchema, recordPaymentSchema, transactionReferenceTypeSchema, walletStatusSchema, walletTransactionTypeSchema (+5 more)

### Community 107 - "env.ts"
Cohesion: 0.18
Nodes (10): allowDevShortcuts, isDevelopment, isProduction, isStaging, isTest, parsed, schema, REDACTED_PATHS (+2 more)

### Community 109 - "rides.validation.ts"
Cohesion: 0.17
Nodes (11): cancellationReasonSchema, cancelRideSchema, locationPointSchema, negotiationActionSchema, passengerSchema, proposeFareSchema, requestRideSchema, respondNegotiationSchema (+3 more)

### Community 110 - "vehicle.model.ts"
Cohesion: 0.14
Nodes (15): isVehicleApproved(), VehicleDocument, VehicleModel, vehicleSchema, packages_contracts_src_index_vehicle_categories, packages_contracts_src_index_vehicle_verification_statuses, packages_contracts_src_index_vehiclecategory, packages_contracts_src_index_vehicleverificationstatus (+7 more)

### Community 111 - "verifyOtp.usecase.ts"
Cohesion: 0.14
Nodes (12): apps_api_src_modules_identity_domain_index_resolveuserrole, apps_api_src_modules_identity_domain_index_sessionrepositoryport, resolveUserRole(), newUuid(), VerifyOtpRequestDto, VerifyOtpResponseDto, packages_contracts_src_index_logoutresponsedto, packages_contracts_src_index_refreshtokenrequestdto (+4 more)

### Community 112 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, clean, dev, dev:worker, lint, lint:deps, start (+3 more)

### Community 113 - "VehicleCategory"
Cohesion: 0.29
Nodes (9): RegisterDriverVehicleDto, calculateCommissionPaise(), calculateNegotiationBounds(), PricingConfigDto, QuoteRequestDto, StatePricingDto, VehiclePricingConfig, VehicleQuoteOption (+1 more)

### Community 114 - "health.ts"
Cohesion: 0.50
Nodes (3): DependencyHealth, DependencyStatus, HealthReport

### Community 115 - "pricing.validation.ts"
Cohesion: 0.29
Nodes (6): createCityZoneSchema, createPricingConfigSchema, createStatePricingSchema, geoJsonPolygonSchema, updateCityZoneSchema, zod

### Community 116 - "rides.ts"
Cohesion: 0.29
Nodes (6): CANCELLATION_REASONS, FareNegotiationDto, RideDto, RideEventDto, RideExtensionDto, StateSegmentDto

### Community 117 - "esbuild.config.mjs"
Cohesion: 0.40
Nodes (4): external, pkg, esbuild, ref_node_fs

### Community 118 - "driver.routes.ts"
Cohesion: 0.40
Nodes (4): AdminDriverRouterDeps, buildAdminDriverRouter(), buildDriverRouter(), DriverRouterDeps

## Knowledge Gaps
- **476 isolated node(s):** `MODULE_TIERS`, `layeringRules`, `base`, `pkg`, `external` (+471 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 692 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `express` to `buildIdentityContainer`, `api/package.json`, `access-log.middleware.ts`, `response.util.ts`, `health.container.ts`, `authenticate.middleware.ts`, `identity/domain/index.ts`, `zone.container.ts`, `identity.container.ts`, `driver.routes.ts`, `driver-onboarding-api.test.ts`, `app.ts`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `mongoose` connect `mongoose` to `api/package.json`, `worker.ts`, `pricingConfig.model.ts`, `SessionEntity`, `user.model.ts`, `identity.validation.ts`, `adminUser.model.ts`, `RiderEntity`, `driverDocument.model.ts`, `src/index.ts`, `driverApplication.model.ts`, `fareNegotiation.model.ts`, `ride.model.ts`, `payment.model.ts`, `walletTransaction.model.ts`, `rideExtension.model.ts`, `statePricing.model.ts`, `rideEvent.model.ts`, `vehicle.model.ts`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **What connects `MODULE_TIERS`, `layeringRules`, `base` to the rest of the system?**
  _476 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._
- **Should `api/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `kyc-vehicle.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._