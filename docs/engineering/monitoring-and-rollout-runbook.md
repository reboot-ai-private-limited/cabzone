# Operational Monitoring, Alerting, and Controlled Rollout Runbook (Step 16 / C07)

## 1. Operational Alert Coverage (`apps/api/src/shared/monitoring/alerting.ts`)

All operational alerts pass through `emitOperationalAlert()`, which enforces:
- **Automatic PII/secret redaction** (`redactAlertMetadata` + `sanitizeAlertText`): strips E.164 phone numbers, OTPs, `Bearer` tokens, `ExpoPushToken[...]` values, query signatures (`?sig=`, `?token=`), cookies, API keys, and storage keys before logging or webhook emission.
- **Deduplication cooldown**: 60s per `dedupeKey` to prevent alert storms during upstream outages.
- **Owner attribution**: stamps `ALERT_OWNER` (default `platform-ops`) and `environment` (`stage` / `production`) on every webhook payload.

| Alert Category | Trigger | Severity | Wired Surface |
| --- | --- | --- | --- |
| `API_5XX` | HTTP status >= 500 or unhandled exception | `critical` | `apps/api/src/shared/http/error-handler.ts` |
| `API_LATENCY` | Request duration >= `API_LATENCY_ALERT_MS` (default `2500ms`) | `warning` | `apps/api/src/shared/http/access-log.middleware.ts` |
| `DATASTORE_HEALTH` | MongoDB or Redis down on `/api/health`, or Redis unavailable at `isProdLike` startup | `critical` | `GetHealthUseCase`, `assertRealtimeReadyForEnv` |
| `QUEUE_HEALTH` | BullMQ `notifications` `failed > 0` or `waiting >= 250` | `critical` / `warning` | `QueueHealthProbe` (`queueHealthProbe.adapter.ts`) |
| `SMS_DELIVERY` | Transactional SMS provider HTTP/timeout failure after bounded retries | `critical` | `HttpSmsGatewayAdapter` (`httpSmsGateway.adapter.ts`) |
| `PUSH_DELIVERY` | Expo push ticket error (excluding `DeviceNotRegistered`) or receipt transport failure | `warning` | `ExpoPushService` (`expoPush.service.ts`) |
| `WALLET_RECONCILIATION` | `ReconcileWalletLedgerUseCase` detects `issues.length > 0` | `critical` | `reportWalletReconciliationDiscrepancies()` helper (Agent A bootstrap checklist) |
| `MOBILE_CRASH` | Uncaught native/JS crash telemetry from `rider-mobile` / `driver-mobile` | `critical` | `reportMobileCrash()` helper |

## 2. Resolving Local-Only Realtime Readiness in `isProdLike`

Previously, `apps/api/src/server.ts` logged a warning and allowed the API process to start with in-memory local-only WebSockets when Redis was unreachable. In staging or production (`isProdLike`), that causes silent split-brain realtime delivery across replicas or missed worker notifications.

`assertRealtimeReadyForEnv(health.ok)` (`apps/api/src/shared/realtime/readiness.ts`) now:
- Emits a `critical` `DATASTORE_HEALTH` alert and throws at startup when `isProdLike && !health.ok && !env.ALLOW_LOCAL_REALTIME_FALLBACK`.
- Preserves single-process local development convenience when `NODE_ENV=development` or when `ALLOW_LOCAL_REALTIME_FALLBACK=true` is explicitly set for an emergency single-node maintenance window.

## 3. Controlled Rollout, Smoke Check, and Rollback

### Pre-Deploy Checklist
1. Confirm CI passed (`pnpm check`, `pnpm audit --prod --audit-level high`, `pnpm build`).
2. Run `scripts/ops/backup-mongo.mjs` and record the manifest `sha256` before any schema/index migration.
3. Record current running `IMAGE_TAG` as `ROLLBACK_IMAGE_TAG`.

### Deploy & Automated Smoke Verification
```bash
IMAGE_TAG=<new-immutable-sha> docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --no-build api worker web

SMOKE_API_BASE_URL=https://admin.cabzone.in/api \
SMOKE_WEB_BASE_URL=https://admin.cabzone.in \
ROLLBACK_IMAGE_TAG=<previous-immutable-sha> \
ALERT_WEBHOOK_URL=https://alerts.cabzone.in/hooks/prod \
node scripts/ops/deploy-smoke-and-rollback.mjs
```

### Bounded Rollback (if smoke check exits non-zero)
```bash
IMAGE_TAG=<previous-immutable-sha> docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --no-build api worker web
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
```

## 4. Agent A Bootstrap Wiring Checklist (`server.ts` & `worker.ts`)

1. **`apps/api/src/server.ts`** (inside `main()` after `const health = await redisHealth();`):
   ```ts
   import { assertRealtimeReadyForEnv } from '@/modules/health/health.public.js';
   // ...
   const health = await redisHealth();
   await assertRealtimeReadyForEnv(health.ok);
   ```
2. **`apps/api/src/worker.ts`** (inside `notificationsWorker.on('failed', ...)`):
   ```ts
   import { emitOperationalAlert } from '@/shared/monitoring/alerting.js';
   // ...
   void emitOperationalAlert({
     category: 'QUEUE_HEALTH',
     severity: 'critical',
     dedupeKey: `QUEUE_HEALTH:notifications:job-failed:${job?.name ?? 'unknown'}`,
     summary: `BullMQ notification job failed (${job?.name ?? 'unknown'})`,
     metadata: { jobId: job?.id ?? null, jobName: job?.name ?? null, err: err.message },
   });
   ```
3. **`apps/api/src/modules/ledger/application/useCases/reconcileWalletLedger.usecase.ts`** (before `return` when `issues.length > 0`):
   ```ts
   import { reportWalletReconciliationDiscrepancies } from '@/shared/monitoring/alerting.js';
   // ...
   await reportWalletReconciliationDiscrepancies({
     checkedWallets: wallets.length,
     issueCount: issues.length,
     issueCodes: [...new Set(issues.map((i) => i.code))],
   });
   ```
