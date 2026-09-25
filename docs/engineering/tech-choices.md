# Technology Choices

This document records the technology stack and architecture selections for **Cabzon**. Material choices are recorded in [`decision-log.md`](../decision-log.md).

---

## Current Technology Stack

| Area                          | Selected Technology                | Status       | Rationale                                                                   |
| ----------------------------- | ---------------------------------- | ------------ | --------------------------------------------------------------------------- |
| **Runtime & Language**        | Node.js 22 (ESM) + TypeScript 5.7  | Selected     | Native ESM, strict typing, high ecosystem maturity                          |
| **Backend Framework**         | Express 4 + `tsx` / `esbuild`      | Selected     | Minimal HTTP overhead, fast watch mode in dev, single-file bundle in prod   |
| **Background Worker**         | BullMQ + Redis 7                   | Selected     | Durable job queues, retry mechanisms, presence checks (`src/worker.ts`)     |
| **Primary Database**          | MongoDB 7 (Replica Set `rs0`)      | Selected     | Document model with ACID multi-document transaction support                 |
| **Cache & Distributed State** | Redis 7 (Alpine, append-only)      | Selected     | Proximity cache, rate limiting, and BullMQ persistence                      |
| **Admin Web Console**         | Next.js 15 (App Router) + React 19 | Selected     | Standalone Docker output, server-rendered views, fast dev server            |
| **Styling**                   | Tailwind CSS v4                    | Selected     | Modern utility-first styling with zero runtime bundle overhead              |
| **Monorepo Engine**           | pnpm 11 + Turborepo 2              | Selected     | Hoisted workspace resolution (`nodeLinker: hoisted`), task pipeline caching |
| **Shared Contracts**          | `@cabzone/contracts` (Raw TS)      | Selected     | Zero-build live TypeScript sharing between API and frontend                 |
| **Architecture Gate**         | `dependency-cruiser`               | Selected     | Machine-checked 5-layer boundaries and private module internals             |
| **Rider & Driver Mobile**     | React Native / Expo (Roadmap)      | Open         | Cross-platform framework to be finalized during mobile kick-off             |
| **Geospatial Processing**     | MongoDB 2dsphere + Turf.js         | Selected     | GeoJSON point-in-polygon and distance calculations                          |
| **Routing & Distance**        | Google Routes API / OSRM           | Configurable | Server-side matrix computation for outstation band matching                 |
| **SMS / WhatsApp**            | WhatsApp API with SMS fallback     | Configurable | Mock sender in dev; production provider hooks ready                         |

---

## Operational Environments (Three-State Architecture)

CabZone defines three distinct runtime environments:

1. **`development`**:
   - Host-driven runtime (`tsx watch`, `next dev`).
   - Local datastores in Docker via `docker-compose.dev.yml` (Mongo `rs0` on `127.0.0.1:27017` + Redis on `127.0.0.1:6379`).
   - Human-readable logging (`pino-pretty`).
   - Debug stack traces permitted in error responses; optional `DEV_FIXED_OTP=000000`.

2. **`stage` / `staging`**:
   - Production-parity containerized deployment via `docker-compose.stage.yml`.
   - Distinct Docker network and staging volumes (`cabzone-mongo-data-stage`).
   - Sanitized HTTP error responses (`isProdLike = true`, traces omitted).
   - Allows QA test shortcuts (e.g. fixed OTP) **only** when `STAGING_UNSAFE=true` is set.

3. **`production`**:
   - Live environment via `docker-compose.prod.yml`.
   - Closed internal network for MongoDB and Redis (zero host ports exposed).
   - Strict boot validation: `DEV_FIXED_OTP` terminates the process if present.
   - Cryptographically secure 32+ character secrets required for JWT and webhooks.

---

## Selection & Governance Rules

Before introducing a new dependency or architectural pattern:

1. Identify the concrete business problem it solves.
2. Verify if existing stdlib or workspace packages can satisfy the need.
3. Ensure it preserves zero-build package compatibility and clean layering.
4. Record material decisions in [`../decision-log.md`](../decision-log.md).
