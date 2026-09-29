# Monorepo Layout

## Directory Topology

```text
Cabzone/
├── apps/                       Deployable applications
│   ├── api/                    Node.js Express ESM REST/WebSocket API (port 4000)
│   │                           + BullMQ queue worker process (src/worker.ts)
│   └── web/                    Next.js 15 App Router Admin Console (port 3000)
│
├── packages/                   Shared internal libraries
│   ├── config/                 Shared base tsconfig and ESLint configs
│   └── contracts/              Wire envelopes, API interfaces, domain models, error codes
│
├── docs/                       Architecture & Engineering Handbook
│   ├── README.md               Documentation index and reading order
│   ├── prd.md                  Product Requirements Document
│   ├── decision-log.md         Append-only Architecture Decision Record (ADR)
│   ├── setup-development.md    Developer onboarding & 3-state environment workflows
│   ├── LLD/                    Low-level design specifications
│   └── engineering/            Engineering handbook & architecture standards
│
├── docker-compose.dev.yml      Local development infrastructure (Mongo rs0 + Redis)
├── docker-compose.stage.yml    Staging pre-production containerized stack
├── docker-compose.prod.yml     Production containerized stack
├── package.json                Root workspace orchestrator (pnpm 11 + Turborepo 2)
├── pnpm-workspace.yaml         pnpm workspace package declarations & overrides
├── tsconfig.json               Base root TypeScript config
└── turbo.json                  Turborepo pipeline and task caching rules
```

## Brand vs Scope Naming Standard

- **Product / Commercial Brand**: **Cabzone** (used in product copy, PRD, mobile app titles, and documentation).
- **Package Scope**: `@cabzone/*` (e.g. `@cabzone/api`, `@cabzone/web`, `@cabzone/contracts`, `@cabzone/config`).
- **Monorepo / Docker Namespace**: `Cabzone` (e.g. root `package.json`, volume names `Cabzone-mongo-data-*`).

## Core Rules

- **`apps/*`**: Deployable units that produce Docker images or standalone artifacts. Apps can depend on `packages/*`, but apps may **never** depend on other apps.
- **`packages/*`**: Shared libraries consumed at build time. They export raw TypeScript source (`exports: "./src/index.ts"`). There are no intermediate `dist/` builds for packages—consumers compile them directly (`transpilePackages` in Next.js, `esbuild` in API), ensuring zero stale build issues.
- **Clean Architecture Modular Monolith**: `apps/api` is structured into feature modules with strict domain, application, infrastructure, and interface separation, enforced at build time via `dependency-cruiser`.
- **Zero-Leakage Invariant**: API-only infrastructure (Mongoose, Redis, BullMQ) is strictly encapsulated and must not leak into shared contracts or client applications.

## Future Roadmap Applications & Packages

As the platform scales to mobile clients and additional shared services, the monorepo is architected to accommodate:

- `apps/rider-mobile`: Cross-platform React Native / Expo application for riders.
- `apps/driver-mobile`: Dedicated Android application for drivers featuring foreground location services and realtime ringing dispatch.
- `packages/ui`: Shared design system component library if web and mobile share design tokens.
- `packages/domain`: Dedicated shared domain package if pure algorithmic domain engines (fare, zones) are extracted beyond `@cabzone/contracts`.
