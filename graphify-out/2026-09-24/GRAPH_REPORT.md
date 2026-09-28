# Graph Report - Cabzonenew  (2026-09-24)

## Corpus Check
- Corpus is ~7,483 words - fits in a single context window. You may not need a graph.

## Summary
- 492 nodes · 681 edges · 30 communities (22 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Infrastructure & Architecture Docs
- Express App & DI Container
- Health Module & Use Cases
- Web Frontend Dependencies
- Error Handling & AppError Domain
- Build Tooling & ESBuild Config
- Contracts Package & Tooling
- Environment Config & Validation
- Turborepo Build Pipeline
- Base TypeScript Configuration
- Root Dev Dependencies & Linting
- API Dependencies & Queue Pipeline
- API Dev Dependencies & Testing
- Shared Config Package Definition
- Web Dev Dependencies & ESLint React
- API Build & Dev Scripts
- API TypeScript Configuration
- React TypeScript Configuration
- Web App Configuration & Layout
- Web TypeScript Configuration
- Contracts TypeScript Configuration
- Graphify Agent Rules & Workflows
- Architecture Boundaries & Dep Cruiser
- ESLint Base Configuration
- Shared Config TSConfig Extends

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 19 edges
2. `scripts` - 14 edges
3. `express` - 12 edges
4. `scripts` - 11 edges
5. `createApp()` - 10 edges
6. `HealthProbePort` - 10 edges
7. `buildHealthContainer()` - 10 edges
8. `AppError` - 10 edges
9. `Tech Choices Architectural Guide` - 9 edges
10. `DependencyHealth` - 8 edges

## Surprising Connections (you probably didn't know these)
- `MongoDB 7 Replica Set rs0` --conceptually_related_to--> `Mongo 7 Replica Set Service`  [INFERRED]
  docs/engineering/tech-choices.md → docker-compose.dev.yml
- `Redis 7 + BullMQ` --conceptually_related_to--> `Redis 7 Alpine Service`  [INFERRED]
  docs/engineering/tech-choices.md → docker-compose.dev.yml
- `pnpm Hoisted Node Linker Configuration` --conceptually_related_to--> `pnpm & Turborepo Selection`  [INFERRED]
  pnpm-workspace.yaml → docs/engineering/tech-choices.md
- `AppError` --references--> `FaultCode`  [EXTRACTED]
  apps/api/src/shared/errors/AppError.ts → packages/contracts/src/errors.ts
- `ApiError` --references--> `FaultCode`  [EXTRACTED]
  apps/web/src/lib/api/ApiError.ts → packages/contracts/src/errors.ts

## Import Cycles
- None detected.

## Communities (30 total, 8 thin omitted)

### Community 0 - "Infrastructure & Architecture Docs"
Cohesion: 0.06
Nodes (41): Mongo rs0 Initializer Service, Mongo 7 Replica Set Service, Redis 7 Alpine Service, Architectural Decision Log, Monorepo Architecture & Stack Initialization Decision, dependency-cruiser Graph Enforcement, Boundaries and Enforcement Guide, Machine-Enforced Architectural Rules (+33 more)

### Community 1 - "Express App & DI Container"
Cohesion: 0.09
Nodes (28): createApp(), AppContainers, buildContainers(), buildApiRouter(), accessLogMiddleware(), isSilent(), SILENT_PATHS, causeChain() (+20 more)

### Community 2 - "Health Module & Use Cases"
Cohesion: 0.14
Nodes (19): GetHealthUseCase, DependencyHealth, DependencyStatus, HealthReport, summarise(), HealthProbePort, buildHealthContainer(), HealthContainer (+11 more)

### Community 3 - "Web Frontend Dependencies"
Cohesion: 0.05
Nodes (36): dependencies, @Cabzone/contracts, lucide-react, next, react, react-dom, devDependencies, @Cabzone/config (+28 more)

### Community 4 - "Error Handling & AppError Domain"
Cohesion: 0.08
Nodes (17): AppError, ApiError, NetworkError, request(), RequestOptions, FAULT_CODES, FaultCode, DependencyHealth (+9 more)

### Community 5 - "Build Tooling & ESBuild Config"
Cohesion: 0.06
Nodes (32): external, pkg, @Cabzone/config, @Cabzone/contracts, @types/node, typescript, vitest, name (+24 more)

### Community 6 - "Contracts Package & Tooling"
Cohesion: 0.06
Nodes (32): engines, node, @Cabzone/config, eslint, eslint-config-prettier, typescript, @typescript-eslint/eslint-plugin, @typescript-eslint/parser (+24 more)

### Community 7 - "Environment Config & Validation"
Cohesion: 0.19
Nodes (21): env, isProduction, isTest, loadEnv(), parsed, schema, main(), CONNECTION_STATES (+13 more)

### Community 8 - "Turborepo Build Pipeline"
Cohesion: 0.07
Nodes (26): dependsOn, outputs, cache, persistent, cache, persistent, globalDependencies, globalEnv (+18 more)

### Community 9 - "Base TypeScript Configuration"
Cohesion: 0.09
Nodes (22): compilerOptions, declaration, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib, module (+14 more)

### Community 10 - "Root Dev Dependencies & Linting"
Cohesion: 0.10
Nodes (20): devDependencies, eslint, eslint-config-prettier, typescript, @typescript-eslint/eslint-plugin, @typescript-eslint/parser, exports, ./eslint.base.cjs (+12 more)

### Community 11 - "API Dependencies & Queue Pipeline"
Cohesion: 0.12
Nodes (17): dependencies, bullmq, @Cabzone/contracts, cookie-parser, cors, dotenv, express, express-rate-limit (+9 more)

### Community 12 - "API Dev Dependencies & Testing"
Cohesion: 0.14
Nodes (14): devDependencies, @Cabzone/config, dependency-cruiser, esbuild, pino-pretty, supertest, tsx, @types/cookie-parser (+6 more)

### Community 13 - "Shared Config Package Definition"
Cohesion: 0.14
Nodes (13): devDependencies, @Cabzone/config, typescript, exports, @Cabzone/config, typescript, name, private (+5 more)

### Community 14 - "Web Dev Dependencies & ESLint React"
Cohesion: 0.15
Nodes (13): devDependencies, @Cabzone/config, eslint, eslint-config-prettier, eslint-plugin-jsx-a11y, eslint-plugin-react, eslint-plugin-react-hooks, prettier (+5 more)

### Community 15 - "API Build & Dev Scripts"
Cohesion: 0.18
Nodes (11): scripts, build, clean, dev, dev:worker, lint, lint:deps, start (+3 more)

### Community 16 - "API TypeScript Configuration"
Cohesion: 0.18
Nodes (10): compilerOptions, baseUrl, outDir, paths, rootDir, types, exclude, extends (+2 more)

### Community 17 - "React TypeScript Configuration"
Cohesion: 0.18
Nodes (10): compilerOptions, allowJs, jsx, lib, module, moduleResolution, display, extends (+2 more)

### Community 18 - "Web App Configuration & Layout"
Cohesion: 0.20
Nodes (6): config, apps_web_src_app_globals, metadata, next, ref_node_url, ref_vitest

### Community 19 - "Web TypeScript Configuration"
Cohesion: 0.22
Nodes (8): compilerOptions, baseUrl, paths, plugins, exclude, extends, include, @Cabzone/config/tsconfig.react.json

### Community 20 - "Contracts TypeScript Configuration"
Cohesion: 0.29
Nodes (6): compilerOptions, module, moduleResolution, extends, include, @Cabzone/config/tsconfig.base.json

### Community 21 - "Graphify Agent Rules & Workflows"
Cohesion: 0.67
Nodes (3): Graphify Agent Rule, Graphify Knowledge Graph Rules, Graphify Workflow

## Knowledge Gaps
- **270 isolated node(s):** `MODULE_TIERS`, `layeringRules`, `base`, `pkg`, `external` (+265 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 307 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `Health Module & Use Cases` to `Express App & DI Container`, `Build Tooling & ESBuild Config`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `next` connect `Web App Configuration & Layout` to `Web Frontend Dependencies`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Why does `dependencies` connect `API Dependencies & Queue Pipeline` to `Build Tooling & ESBuild Config`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **What connects `MODULE_TIERS`, `layeringRules`, `base` to the rest of the system?**
  _270 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Infrastructure & Architecture Docs` be split into smaller, more focused modules?**
  _Cohesion score 0.05647840531561462 - nodes in this community are weakly interconnected._
- **Should `Express App & DI Container` be split into smaller, more focused modules?**
  _Cohesion score 0.09446693657219973 - nodes in this community are weakly interconnected._
- **Should `Health Module & Use Cases` be split into smaller, more focused modules?**
  _Cohesion score 0.13813813813813813 - nodes in this community are weakly interconnected._