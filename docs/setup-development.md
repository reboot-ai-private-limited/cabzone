# Cabzonee — Development & Infrastructure Setup Guide

Comprehensive setup, architectural mechanics, and operational workflows for the **Cabzonee** platform.

> **Note:** This document is mirrored at the repository root in [setup-development.md](../setup-development.md).

---

## 1. Two Distinct Workflows (Dev vs. Prod)

The repository provides two separate, non-overlapping Docker Compose profiles tailored for developer velocity versus isolated production deployment:

```text
Local Workstation
├── Development (Daily):
│   ├── Docker Compose: Infrastructure only (MongoDB replica set, Redis, optional OSRM)
│   └── Host Machine (pnpm): API (tsx watch) + Admin Web (Next.js HMR) for sub-second hot reload
│
└── Production (Release & CI):
    └── Docker Compose: Full-stack containerized (API, Worker, Admin Web, MongoDB, Redis)
        └── Internal network only; DB ports unexposed to host
```

| Dimension | `docker-compose.dev.yml` (Development) | `docker-compose.prod.yml` (Production) |
| :--- | :--- | :--- |
| **Containers Run** | MongoDB, `mongo-init`, Redis, (optional OSRM) | API, BullMQ Worker, Admin Web, MongoDB, Redis |
| **Application Runtime** | Host OS via `pnpm` (`tsx watch`, `next dev`) | Containerized Docker images (`dist/server.js`, `next start`) |
| **Port Binding** | Strictly `127.0.0.1` (MongoDB: `27017`, Redis: `6379`) | Internal bridge network (`Cabzonee-net`); DB ports closed to host |
| **Hot Reload** | Sub-second native HMR & incremental TS compilation | Disabled (immutable build artifacts) |
| **Environment File** | `apps/api/.env` | `apps/api/.env.prod` |
| **Volumes** | `Cabzonee-mongo-data-dev`, `Cabzonee-redis-data-dev` | `Cabzonee-mongo-data-prod`, `Cabzonee-redis-data-prod` |

> **The Explicit `-f` Rule:**  
> There is **no bare `docker-compose.yml`** in the repository. Requiring `-f docker-compose.dev.yml` or `-f docker-compose.prod.yml` prevents accidental destruction of dev volumes or exposing production workloads to local development host ports.

---

## 2. Prerequisites & Environment

Ensure your local machine satisfies the following prerequisites before booting services:

- **Node.js:** `>= 20.10.0` LTS.
- **pnpm:** Exactly `11.18.0`. Enable Corepack to enforce package manager parity:
  ```bash
  corepack enable
  corepack prepare pnpm@11.18.0 --activate
  ```
  *Why exact pnpm?* Prevents lockfile format churn, dependency hoisting discrepancies, and `nodeLinker` divergence across contributor workstations.
- **Docker & Docker Compose:** Docker Desktop or Docker Engine with Compose v2 (`docker compose version` `>= 2.20.0`).
- **Operating System:** macOS, Linux, or Windows 11 (WSL2 or Git Bash).

---

## 3. Step-by-Step Development Quickstart

Follow these steps to spin up the local development stack from a fresh clone:

### Step 1: Install Workspace Dependencies
```bash
pnpm install
```

### Step 2: Configure Environment Variables
Copy the development environment template into `apps/api/.env`:
```bash
cp apps/api/.env.example apps/api/.env
```
Ensure the default variables in `apps/api/.env` are populated:
```env
PORT=4000
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/Cabzonee_dev?replicaSet=rs0&directConnection=true
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=super-secret-development-jwt-signing-key-32-chars-minimum
JWT_REFRESH_SECRET=super-secret-development-refresh-signing-key-32-chars-minimum
DEV_FIXED_OTP=000000
```

### Step 3: Start Backing Databases
Launch the single-node MongoDB replica set and Redis instance in the background:
```bash
docker compose -f docker-compose.dev.yml up -d
```
Verify that the `mongo-init` container exits cleanly with code `0`:
```bash
docker compose -f docker-compose.dev.yml ps
```

### Step 4: Run Application Stack (API + Admin Web)
```bash
pnpm dev:web
```
This concurrently starts:
- **Fastify / Express API:** `http://localhost:4000` (with Swagger docs at `/api/docs`)
- **Next.js Admin Console:** `http://localhost:3000`

### Step 5: Verify Health
```bash
curl http://localhost:4000/api/health
```
Expected response:
```json
{
  "success": true,
  "data": {
    "status": "UP",
    "timestamp": "2026-09-26T15:00:00.000Z",
    "checks": {
      "mongodb": "CONNECTED",
      "redis": "CONNECTED"
    }
  }
}
```

---

## 4. Architectural Explanations of Dev Configs

### Why Apps Run Outside Docker During Development
Rebuilding Docker containers on every code change takes minutes, breaks TypeScript type feedback in IDEs, and slows developer iterations. Running Node.js and Next.js directly on the host machine enables **sub-second hot-module replacement (HMR)** via `tsx watch` and Next.js Turbopack while leaving heavy database daemons to Docker.

### The Single-Node Replica Set (`rs0`) Requirement
MongoDB is started with `--replSet rs0` and connected via:
```text
mongodb://127.0.0.1:27017/Cabzonee_dev?replicaSet=rs0&directConnection=true
```
*Why?* The Cabzonee core domain relies on **Multi-Document ACID Transactions** (`session.withTransaction()` / atomic concurrency locks) for financial integrity:
1. Ride acceptance & driver wallet balance verification.
2. Commission debit settlement upon trip completion.
3. Cancellation compensation credit allocation.
4. Optimistic geometry version supersession.

MongoDB **strictly rejects transactions on standalone instances**. A replica set is mandatory even locally.

### Why `mongo-init` Exists
When MongoDB boots for the first time with `--replSet rs0`, it starts uninitialized and refuses write commands (`MongoServerError: not primary and secondaryOk=false`).  
The `mongo-init` service is a one-shot container that waits for MongoDB's healthcheck to pass, executes `rs.initiate()`, and terminates cleanly (`restart: 'no'`).

### Localhost Security (`127.0.0.1` Binding)
All ports in `docker-compose.dev.yml` bind explicitly to `127.0.0.1`:
```yaml
ports:
  - '127.0.0.1:${MONGO_PORT:-27017}:27017'
  - '127.0.0.1:${REDIS_PORT:-6379}:6379'
```
*Why?* Defaulting to `0.0.0.0` publishes unauthenticated MongoDB and Redis instances to your local Wi-Fi or office LAN, exposing database volumes to remote network scans.

---

## 5. Running App Combinations (`pnpm dev:*`)

The root `package.json` provides scripts via Turbo for running exact workspace permutations:

```bash
# 1. API Only (Backend HTTP layer on port 4000)
pnpm dev:api

# 2. Backend Only (API + BullMQ Queue Worker)
pnpm dev:backend

# 3. Web + API (Backend API + Next.js Admin Panel)
pnpm dev:web

# 4. Full Monorepo Stack (API + Queue Worker + Admin Web)
pnpm dev:full

# 5. Mobile Applications (Dedicated Terminals Required)
pnpm dev:customer
pnpm dev:driver
```

### Reference Matrix

| Command | API (`4000`) | Worker | Web (`3000`) | Mobile Expo | Use Case |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `pnpm dev:api` | ✓ | — | — | — | Core API endpoint development, unit testing |
| `pnpm dev:backend` | ✓ | ✓ | — | — | Background queue jobs, delayed timeouts, event listeners |
| `pnpm dev:web` | ✓ | — | ✓ | — | Zones management, admin verification, dispatch dashboard |
| `pnpm dev:full` | ✓ | ✓ | ✓ | — | Full platform simulation on workstation |
| `pnpm dev:customer` | — | — | — | ✓ | Rider React Native / Expo development |
| `pnpm dev:driver` | — | — | — | ✓ | Driver React Native / Expo development |

### Why Mobile Apps Cannot Run Under Turbo
Mobile applications built on Expo/React Native **must run in their own dedicated terminal windows**. Turbo's multiplexer aggregates log streams and strips Expo's interactive terminal controls:
- Interactive QR codes for Expo Go.
- Keyboard shortcuts (`a` for Android emulator, `i` for iOS simulator, `r` to reload).
- Interactive prompts when Metro bundler encounters port collisions.

### Physical Device LAN Access
Mobile phones running Expo Go on the same Wi-Fi network **cannot reach `http://localhost:4000`**.  
To test on a physical mobile device:
1. Find your machine's local LAN IP: `ipconfig` (Windows) or `ifconfig` (macOS/Linux) — e.g. `192.168.1.15`.
2. Set `EXPO_PUBLIC_API_URL=http://192.168.1.15:4000/api` in the mobile app environment.
3. Ensure host firewall allows inbound connections on port 4000.

### Worker is Not a Second App
`apps/api/src/worker.ts` and `apps/api/src/server.ts` are **two composition roots over the exact same backend codebase**:
- `server.ts`: Listens on HTTP/WebSocket ports and dispatches requests.
- `worker.ts`: Connects to Redis and processes asynchronous BullMQ queues (dispatch broadcasting, timeout sweeps, SMS gateways).

---

## 6. Full Workspace Verification

Before committing changes or raising a pull request, run the unified verification pipeline:

```bash
pnpm check
```
*(Alias for: `pnpm turbo run typecheck lint test`)*

### Verification Layers
1. **TypeScript Typecheck (`tsc --noEmit`):** Validates contracts, DTOs, and strict null/optional compatibility across `@cabzone/contracts`, `@cabzone/geo`, `@cabzone/api`, and `@cabzone/web`.
2. **ESLint (`eslint src --ext .ts,.tsx`):** Enforces code style, unused variables, and accessibility (`jsx-a11y`) standards.
3. **Architecture Boundary Enforcement (`depcruise`):** Runs `dependency-cruiser` against `.dependency-cruiser.cjs` to enforce Clean Architecture invariants:
   - Domain layers cannot import from infrastructure or interface layers.
   - Modules cannot reach into private internals of sibling modules without using `.public.ts` interfaces.
4. **Automated Vitest Suites (`vitest run`):** Runs all unit and integration test suites:
   - Geometric validity, ring closure, bow-tie self-intersection (`@cabzone/geo`).
   - Domain entity invariants, OTP lockouts, wallet gate, and zone resolution.
   - Real MongoDB atomic claims on replica sets (`test/integration/`).

---

## 7. Production Stack Specifics

To simulate or deploy the production stack locally:

```bash
# 1. Prepare production environment
cp apps/api/.env.prod.example apps/api/.env.prod

# 2. Build and start production containers
docker compose -f docker-compose.prod.yml up -d --build
```

### Critical Production Invariants
1. **Isolated Data Volumes:** Production uses `Cabzonee-mongo-data-prod` and `Cabzonee-redis-data-prod` to avoid polluting development databases.
2. **Build-Time Variable Injection (`NEXT_PUBLIC_API_BASE_URL`):**  
   Next.js bakes `NEXT_PUBLIC_*` environment variables directly into client-side JavaScript bundles **at build time**. Supplying `NEXT_PUBLIC_API_BASE_URL` as a runtime Docker environment variable will fail; it must be supplied as a build argument or declared in the build context.
3. **Closing Database Ports:** In production, MongoDB and Redis do not expose ports on the host machine. They communicate strictly over the internal container network (`Cabzonee-net`).
4. **Tearing Down Production Containers:** To release host ports `3000` and `4000`:
   ```bash
   docker compose -f docker-compose.prod.yml down
   ```

---

## 8. Database Seeding & Testing Automation (`pnpm seed`)

A deterministic database seeder initializes the system with valid test fixtures:

```bash
pnpm seed
```

To reset the database and re-seed from scratch:
```bash
pnpm seed --reset
```
*Note: `pnpm seed --reset` clears the relevant database collections via Mongo queries without destroying your replica set or wiping Docker volumes.*

### Seeded Accounts Matrix

| Role | Phone Number | State / Status | Description |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `+919000000001` | Active, Role: `SUPER_ADMIN` | Has global administrative privileges over zones, KYC, and pricing. |
| **Verified Driver** | `+919000000002` | Active, Approved KYC, Off-Duty | Driver profile complete, vehicle registered, wallet pre-funded with ₹500. |
| **Complete Customer** | `+919000000003` | Active Profile | Customer with profile photo, saved Home/Work addresses, and payment history. |
| **Empty Customer** | `+919000000004` | Phone Only | Fresh rider account with no name or saved locations to test progressive onboarding UX. |

### Seeded Geographic Zones

| Zone Code | Type | Characteristics |
| :--- | :--- | :--- |
| **`SILIGURI`** | `CITY` | Authoritative geographic boundary for Siliguri city with 20 km derived buffer. |
| **`HILL_DARJ`** | `CITY` | Outstation hill territory classifier (Darjeeling municipality). |
| **`HILL_KALIM`** | `CITY` | Outstation hill territory classifier (Kalimpong municipality). |

### Contract-Driven Seeding Invariants
The seeder imports directly from `zones.public.ts`. All seed coordinates and polygon rings are validated against `@cabzone/geo` validation engines (Z-001 through Z-006) before insertion, ensuring corrupt or open polygons are never seeded.

### Fixed Dev OTP Bypass (`DEV_FIXED_OTP`)
In `apps/api/.env`, setting:
```env
DEV_FIXED_OTP=000000
```
allows entering `000000` to verify any phone number instantly in local development without checking console logs or configuring an SMS gateway.  
**Security Guardrail:** The authentication controller strictly ignores `DEV_FIXED_OTP` and throws an error if `NODE_ENV=production`.

---

## 9. Comprehensive Troubleshooting Guide

### 1. `MongoServerError: not primary and secondaryOk=false`
- **Cause:** MongoDB replica set was not initialized, or the `mongo-init` container failed to run.
- **Fix:** Manually execute the replica set initiation command:
  ```bash
  docker compose -f docker-compose.dev.yml exec mongo mongosh --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]})"
  ```

### 2. Host Port Collisions (`27017` or `6379` in use)
- **Cause:** A local PostgreSQL, Redis, or native MongoDB service is already running on your host machine.
- **Fix:** Override the published ports in `apps/api/.env` and your shell:
  ```bash
  export MONGO_PORT=27018
  export REDIS_PORT=6380
  docker compose -f docker-compose.dev.yml up -d
  ```

### 3. Port `3000` or `4000` Already in Use
- **Cause:** Lingering processes or background production Docker containers from a previous run.
- **Fix:** Shut down any running production containers:
  ```bash
  docker compose -f docker-compose.prod.yml down
  ```
  Or kill the lingering host process (Windows):
  ```bash
  netstat -ano | findstr :4000
  taskkill /PID <PID> /F
  ```
  Or (macOS/Linux):
  ```bash
  lsof -ti :4000 | xargs kill -9
  ```

### 4. Zod Boot-Time Environment Validation Failure
- **Error:** `Validation error: MONGO_URI is required`
- **Cause:** Missing or unpopulated `.env` file in `apps/api/`.
- **Fix:** Copy `apps/api/.env.example` to `apps/api/.env` and ensure `MONGO_URI` and `JWT_SECRET` are declared.

### 5. `ERR_PNPM_IGNORED_BUILDS` During `pnpm install`
- **Cause:** pnpm v11 blocks native compilation scripts (e.g. `esbuild`, `sharp`, `mongodb-memory-server`) unless explicitly allowed.
- **Fix:** Check `pnpm-workspace.yaml` under `allowBuilds`:
  ```yaml
  allowBuilds:
    esbuild: true
    sharp: true
    mongodb-memory-server: true
  ```

### 6. Module Resolution Failure in Expo / Metro
- **Cause:** Stale cache or conflicting dependency hoisting.
- **Fix:**
  ```bash
  pnpm --filter=@cabzone/customer start --reset-cache
  ```
  Ensure `pnpm-workspace.yaml` preserves `nodeLinker: hoisted`.

### 7. Resetting a Corrupt or Out-of-Sync Database
- **Cause:** Incompatible schemas or interrupted replica set transactions.
- **Fix:** Completely tear down dev containers and destroy attached Docker volumes:
  ```bash
  docker compose -f docker-compose.dev.yml down -v
  docker compose -f docker-compose.dev.yml up -d
  pnpm seed
  ```

---

## 10. OSRM (Open Source Routing Machine)

The platform supports an optional self-hosted **Open Source Routing Machine (OSRM)** container for calculating exact road distances, durations, and state border crossings:

```text
Host App -> OSRM Engine (port 5000) -> Exact Road Route Polyline + Real Driving Distance
```

### Resource Requirements
- **Memory:** Requires at least **8 GB RAM** allocated to Docker Desktop.
- **Data File:** Requires downloading an OpenStreetMap extract (`.osm.pbf`) for India or West Bengal and preprocessing it with the car profile:
  ```bash
  osrm-extract -p /opt/car.lua /data/west-bengal-latest.osm.pbf
  osrm-partition /data/west-bengal-latest.osrm
  osrm-customize /data/west-bengal-latest.osrm
  ```

### Why OSRM is Disabled by Default in Dev
Because OSM road graph extracts consume substantial memory and take 15+ minutes to partition, OSRM is **commented out by default** in `docker-compose.dev.yml`.  
For local development, the backend automatically falls back to high-performance **Haversine Great-Circle distance with road winding curvature factors** (or configured Google Routes API credentials), ensuring developers can build and test pricing immediately on low-spec workstations.
