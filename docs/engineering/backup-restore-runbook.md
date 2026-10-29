# MongoDB Backup, Isolated Restore Drill, and Redis Recovery Runbook (Step 16 / C06)

## 1. Architecture & Data Safety Principles

1. **MongoDB (`rs0`) is the system of record** for users, KYC metadata, rides, immutable pricing snapshots, payments, wallets, and wallet ledger transactions.
2. **Client-side AES-256-GCM encryption before off-host transfer**:
   - `scripts/ops/backup-mongo.mjs` streams `mongodump --archive --gzip`, encrypts in memory using `aes-256-gcm` (`CBZBK1` header + 96-bit random IV + 128-bit authTag), and writes `<archive>.gz.enc` alongside `<archive>.gz.enc.manifest.json` (`sha256`, `plainByteLength`, `encryptedByteLength`, `createdAt`).
3. **Hard guard against overwriting live/staging databases**:
   - `scripts/ops/restore-mongo-drill.mjs` enforces `assertIsolatedRestoreTarget()`:
     - Rejects `admin`, `local`, `config`, `cabzone_prod`, `cabzone_stage`.
     - Requires target DB name to end with `_restore_drill` (e.g. `cabzone_stage_restore_drill`).
     - Rejects any target DB matching the active database in `MONGO_URI`.

## 2. Backup Execution & Scheduling

```bash
# Generate a 256-bit encryption key (store in secret manager, never in git)
openssl rand -hex 32

# Run encrypted backup and copy to off-host mount / object-storage sync directory
MONGO_URI="mongodb://127.0.0.1:27017/cabzone_prod?replicaSet=rs0" \
BACKUP_ENCRYPTION_KEY_HEX="<64-hex-chars>" \
BACKUP_OUTPUT_DIR="/var/backups/cabzone/local" \
BACKUP_OFFHOST_DIR="/mnt/offhost-object-sync/cabzone-mongo" \
ALERT_WEBHOOK_URL="https://alerts.cabzone.in/hooks/prod" \
node scripts/ops/backup-mongo.mjs
```

Recommended cron schedule on backup runner (off-peak + 6-hourly incremental snapshot cadence):
- `15 */6 * * *` encrypted logical dump to off-host object storage with 30-day retention and object-lock immutability.

## 3. Isolated Restore Drill Procedure

```bash
# 1. Restore encrypted archive into isolated *_restore_drill namespace
MONGO_URI="mongodb://127.0.0.1:27017/cabzone_stage?replicaSet=rs0" \
BACKUP_ENCRYPTION_KEY_HEX="<64-hex-chars>" \
node scripts/ops/restore-mongo-drill.mjs \
  /mnt/offhost-object-sync/cabzone-mongo/cabzone-mongo-cabzone_stage-<timestamp>.archive.gz.enc \
  cabzone_stage_restore_drill
```

Post-restore verification invariants (`verifyRestoredDataInvariants` in `scripts/ops/restore-mongo-drill.mjs` + `ReconcileWalletLedgerUseCase` in `AUDIT` mode):
1. Checksum (`sha256`) and GCM authentication tag pass prior to `mongorestore`.
2. Every wallet's `balancePaise` (`COMMISSION`) and `earningsBalancePaise` (`EARNINGS`) equal the closing balance of its immutable `wallet_transactions` chain.
3. Every `COMPLETED` / `SETTLED` ride has positive fare and intact `pricingSnapshot`.
4. Every `CONFIRMED` payment maps to a restored ride document.
5. Drop `cabzone_stage_restore_drill` after recording drill timing and counts.

## 4. Redis Queue & Presence Loss Recovery Plan

Redis stores ephemeral/rebuildable state (`driver presence GEO/hash`, `BullMQ notifications queue`, `realtime pub/sub`, `route cache`):
1. **Compose persistence**: `docker-compose.stage.yml` and `docker-compose.prod.yml` run Redis with `--appendonly yes`.
2. **If Redis restarts or loses state**:
   - **Realtime sockets**: `assertRealtimeReadyForEnv` prevents multi-node split-brain on startup when Redis is down; once Redis recovers, clients reconnect WebSockets automatically with jittered backoff.
   - **Driver presence**: Active background/foreground drivers send location heartbeats every 15s; if Redis lost their presence key, `POST /api/v1/driver/location` returns `409`, and `background-location.ts` / `ride-context.tsx` automatically re-registers `POST /api/v1/driver/status` (`ONLINE`) with current GPS coordinates.
   - **Active rides & offers**: Source of truth is MongoDB (`rides` collection); `expireOffersUseCase`, `sweepKycExpiry`, and `rideRatingsUseCase.revealExpiredRatings` sweep MongoDB directly on intervals in `server.ts`.

## 5. External Blockers

- **Blocked**: Off-host object-storage bucket credentials (`BACKUP_OFFHOST_DIR` / S3 bucket) + business owner sign-off on formal RPO/RTO targets (recommended target: RPO <= 6h / 15m PITR on managed Atlas, RTO <= 45m); **owner**: Infrastructure / Leadership.
