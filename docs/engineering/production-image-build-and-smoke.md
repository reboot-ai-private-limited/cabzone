# Production & Staging Image Build and Smoke Guide (Step 16 / C01)

## 1. Root-Cause Defects Fixed in C01

1. **`apps/web/Dockerfile` package filter & workspace manifests**:
   - Fixed `@Cabzonee/web` filter typo (`@cabzone/web`).
   - Added missing workspace `package.json` manifests (`driver-mobile`, `rider-mobile`, `design-system`, `geo`) and build sources (`packages/design-system`, `packages/geo`) so `pnpm install --frozen-lockfile` succeeds inside clean multi-stage builds.
2. **Browser-reachable HTTPS `NEXT_PUBLIC_API_BASE_URL` build contract**:
   - Next.js inline-bakes `NEXT_PUBLIC_API_BASE_URL` into client bundles at `next build` time, not runtime.
   - `apps/web/Dockerfile` now requires `ARG NEXT_PUBLIC_API_BASE_URL`, rejects internal container hostnames (`http://api:*`), and enforces `https://...` or `/api` same-origin proxy unless `ALLOW_NON_HTTPS_WEB_API_URL=true` is explicitly passed for local smoke testing.
   - `apps/web/next.config.ts` supports `/api/:path*` same-origin proxy rewrites when `API_UPSTREAM_ORIGIN=http://api:4000` is set at runtime.
3. **`apps/api/Dockerfile` workspace manifest completeness**:
   - Added all monorepo workspace `package.json` manifests to the `deps` stage so `pnpm install --frozen-lockfile` never diverges from `pnpm-lock.yaml`.
4. **Staging logger boot crash (`apps/api/src/shared/logging/logger.ts`)**:
   - Previously enabled `pino-pretty` whenever `!isProduction`. Because `pnpm deploy --prod` strips `devDependencies`, `NODE_ENV=stage` crashed at container startup (`Cannot find package 'pino-pretty'`). `pino-pretty` now runs strictly when `NODE_ENV=development`.
5. **Compose parity (`docker-compose.stage.yml`, `docker-compose.prod.yml`)**:
   - Wired `NEXT_PUBLIC_API_BASE_URL` build args, `API_UPSTREAM_ORIGIN` runtime upstream, `NODE_ENV: production` on Next standalone `web`, and `worker` liveness healthchecks.

## 2. Build & Boot Commands

```bash
# 1. Prepare environment file from template
cp .env.stage.example .env.stage

# 2. Build api, worker, and web images
docker compose --env-file .env.stage -f docker-compose.stage.yml build

# 3. Boot stack and wait for healthchecks
docker compose --env-file .env.stage -f docker-compose.stage.yml up -d

# 4. Run automated deployment smoke check
SMOKE_API_BASE_URL=http://127.0.0.1:4000/api \
SMOKE_WEB_BASE_URL=http://127.0.0.1:3000 \
node scripts/ops/deploy-smoke-and-rollback.mjs
```

## 3. Verification Status on Current Host

- **Workspace builds verified without Docker**:
  - `@cabzone/api` TypeScript compilation (`pnpm --filter @cabzone/api build`) — verified.
  - `@cabzone/web` standalone Next.js production build with HTTPS `NEXT_PUBLIC_API_BASE_URL=https://stage-admin.cabzone.example/api` (`pnpm --filter @cabzone/web build`) — verified.
- **Container engine status (`Blocked`)**:
  - `docker info` on this workstation returned `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`.
  - **Blocked**: Running Linux Docker engine (`docker build` / `docker compose up`) to capture live container healthcheck logs; **owner**: DevOps / workstation operator with Docker Desktop Linux engine active.
