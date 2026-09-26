# Build and Deploy

## Operational Environments (Three-State Architecture)

cabzone defines three distinct runtime environments:

1. **`development`**: Local developer environment. Infrastructure (MongoDB replica set `rs0` + Redis) runs in Docker via `docker-compose.dev.yml` bound to `127.0.0.1`. Applications run on the host with hot reload (`tsx watch`, `next dev`).
2. **`stage` / `staging`**: Pre-production environment running containerized services via `docker-compose.stage.yml`. Used for QA, end-to-end verification, and validating production container artifacts.
3. **`production`**: Hardened, live environment running containerized services via `docker-compose.prod.yml`. Internal datastore ports are closed from host exposure, strict CORS is enforced, and debug details are stripped from API error envelopes.

---

## Artifact Generation

The monorepo uses Turborepo to coordinate builds across packages:

- **`apps/api` (`@cabzone/api`)**:
  - Validates types via `tsc --noEmit`.
  - Bundles via `esbuild.config.mjs` into `dist/server.js` (HTTP & WebSocket API) and `dist/worker.js` (BullMQ background worker).
  - Shared workspace packages (`@cabzone/*`) are bundled in-line; external third-party dependencies remain external for native node_modules resolution.
- **`apps/web` (`@cabzone/web`)**:
  - Compiles via `next build` with `output: 'standalone'`, creating a minimal traced production server artifact at `apps/web/.next/standalone`.
- **`packages/*`**:
  - Zero-build architecture. Raw TypeScript source is exported (`./src/index.ts`) and compiled on-the-fly by consumer build tools.

---

## Service Deployment Topology

A deployed stack (Staging or Production) consists of four primary runtime components:

| Service  | Container Image Source | Entrypoint Command              | Internal Port | Description                                              |
| -------- | ---------------------- | ------------------------------- | ------------- | -------------------------------------------------------- |
| `api`    | `apps/api/Dockerfile`  | `node dist/server.js`           | `4000`        | Express REST API, health probes, WebSockets              |
| `worker` | `apps/api/Dockerfile`  | `node dist/worker.js`           | N/A           | BullMQ background queue consumer                         |
| `web`    | `apps/web/Dockerfile`  | `node apps/web/server.js`       | `3000`        | Next.js standalone Admin Console                         |
| `mongo`  | `mongo:7`              | `--replSet rs0 --bind_ip_all`   | `27017`       | MongoDB replica set for multi-document ACID transactions |
| `redis`  | `redis:7-alpine`       | `redis-server --appendonly yes` | `6379`        | Queue persistence, caching, and rate limiting            |

---

## Compose Workflows

- **Local Development**:
  ```bash
  docker compose -f docker-compose.dev.yml up -d
  pnpm dev:web
  ```
- **Staging Verification**:
  ```bash
  cp apps/api/.env.stage.example apps/api/.env.stage
  docker compose -f docker-compose.stage.yml up -d --build
  ```
- **Production Deployment**:
  ```bash
  cp apps/api/.env.prod.example apps/api/.env.prod
  docker compose -f docker-compose.prod.yml up -d --build
  ```

---

## CI / CD Verification Pipeline

Every Pull Request must pass the automated gate before merge:

```text
Developer Branch
      ↓
Pull Request
      ↓
Turborepo CI Pipeline:
  ├── pnpm turbo run typecheck   (Static type safety across all packages)
  ├── pnpm --filter @cabzone/api lint:deps (dependency-cruiser architecture gate)
  ├── pnpm turbo run lint        (ESLint across all apps and packages)
  ├── pnpm turbo run test        (Vitest unit test suites)
  └── pnpm turbo run build       (Production artifact compilation)
      ↓
Deploy to Staging → Automated QA
      ↓
Promote to Production
```
