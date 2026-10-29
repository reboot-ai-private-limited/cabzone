# Backend checkpoint — 29 October 2026

Target: controlled staging/internal beta. This is implementation evidence, not commercial launch approval.

| Area                  | Completed                                                                                                                                                  | Still required                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Integration           | UI/platform branches integrated; conflicts and public-route authentication regression fixed.                                                               | Authenticated admin browser and installed-app acceptance.                                                              |
| Financial correctness | Provider-matched refund/payment IDs, processed status, INR and full fare-plus-arrears required before ledger reversal. Retry-safe refund/arrears handling. | Four historical findings below; actual staging online-payment/refund evidence.                                         |
| Product features      | Signed toll snapshots and separate disclosures; extension API and rider/driver UI through final settlement.                                                | Real routing and physical-app verification.                                                                            |
| Performance           | Immediate ride/offer data; background names capped at four concurrent lookups and 200 cache/queue entries. Existing four-second request abort retained.    | Release-device timing and agreed traffic/SLO.                                                                          |
| Production setup      | SMS adapter, fail-closed config, alert wiring, image builds, isolated container/fault smoke and encrypted fixture restore.                                 | Live credentials, off-host backup/retention, actual-data restore, on-call/alerts, RPO/RTO, deploy/rollback acceptance. |
| Devices               | ADB/ARTEMIS diagnosis and Android 17 emulator boot.                                                                                                        | Neither Cabzone APK installed; two authorized physical phones and matching builds required.                            |

## Contracts implemented

Extensions compare two driving routes from the same fresh GPS fix: current position to agreed drop versus current position to proposed drop. With 8 km remaining and 13 km proposed, charge only 5 km. Do not recharge base/minimum fare or buffer surcharge. Keep original pricing/cancellation snapshots frozen. Allocate extra metres among states gaining route distance at frozen rates; reject newly encountered states without frozen tariffs. Fetch full updated road geometry separately for maps. Legacy rides without adequate frozen tariffs may require a new booking.

Only the booking rider proposes and assigned driver resolves. One unexpired proposal is allowed; expiry is two minutes. Request IDs protect retries, and versioned Mongo transactions serialize proposals, acceptance/rejection and completion. Invalid/stale GPS, invalid geometry, Haversine-only routing and absent tariffs fail closed. Acceptance updates destination/fare/route once; rejection/expiry retain the agreement. Tests verify settlement of the extended fare plus arrears, with commission on fare only.

Tolls/permits remain outside fare, negotiation bounds and commission. Unknown cost stays `null`; legacy unrecorded metadata remains distinguishable. Signed quotes freeze toll snapshots onto rides. After extension, disclosures identify the original quote and additional actuals. Live tolls/extensions need Google Routes credentials/billing; development Haversine routes cannot qualify extensions.

## Read-only historical audit

Ran `pnpm --filter @cabzone/api exec tsx src/scripts/auditBackendMoney.ts` with auto-indexing/collection creation disabled and both modes fixed to `AUDIT`; provider mode was test. No balances, transactions, refunds or recovery operations were written.

- Seven settled cash rides passed earnings checks.
- Eight wallets checked; seven clean. Wallet `…000030` has two disconnected commission-chain starts/ends; balance −27,500 paise.
- Three commission references lack rides: `REF_MS_01`, `REF_000055`, `REF_000053`.
- `seed.ts` contains that wallet and `REF_MS_01`, explaining seeded history but not authorizing changes to the existing database.

The data/finance owner must choose clean staging fixtures or approve recovery from original source records. Restore missing records or use approved compensating entries; do not delete immutable history or fabricate payments. Rerun both audits. Clean cash rides do not prove online refund acceptance.

## Evidence

- Full workspace `check` passed: types, lint, architecture, API/Mongo, web and both mobile unit suites. API: 495/495 across 62 files; web: 59/59; all 20 workspace tasks passed.
- Extension tests include participant access, incremental pricing, retry/expiry, corrupt GPS/geometry, concurrency, reconstruction, completion races and final settlement.
- Production API and web images built. Web's smoke-only build uses a localhost HTTP API origin.
- `node scripts/ops/verify-container-smoke.mjs`: API/web 200, worker startup, protected 401/public 200, Redis outage readiness 503/recovery 200, production refusal without real SMS. Labelled resources are cleaned up. Uses isolated `STAGING_UNSAFE=true` and dummy providers; live login/storage/routing remain unqualified.
- `node scripts/ops/verify-isolated-recovery.mjs`: real dump → AES-256-GCM → decrypt → restore in disposable Mongo. Wallet/transaction/ride/payment records matched, financial checks passed, altered balances and corrupt archives were rejected. Fixture restore about 1.1 seconds is not production RTO.
- Production dependency audit passed the configured policy; aggregate counts retain the documented ignored Zod advisory. This is not a zero-advisory claim.

## Exact inputs to close the remaining gates

1. **Data/finance:** disposition of four findings, selected staging dataset, actual provider payment/refund references.
2. **Providers:** SMS account/provider, approved sender/DLT template and secrets; Google Routes key/billing; live private-storage qualification. Configure secrets locally or in a secret manager, never chat.
3. **Platform:** off-host target/key custody/schedule/retention; alert webhook/on-call owner; staging host/origins; traffic/SLO and RPO/RTO. Then execute actual-data restore, load/failure/alert delivery and rollout/rollback drills.
4. **Mobile:** install both apps on two phones, finish native credentials, run ARTEMIS booking/negotiation/OTP/location/extension/cash/test-UPI/arrears/wallet/ratings/relaunch/background/network/permission matrix and inspect durable records.
5. **Release:** authenticated admin pricing/dispute/refund review and applicable finance/legal approvals. Live money remains a separate commercial gate.

ARTEMIS trace `86032c34-a0f6-411c-bbf0-9964a4ff589d` was stopped after provider 503/timeouts prevented exploration. Subsequent diagnosis was ready; ADB independently confirmed no Cabzone APK. Device acceptance was not marked complete.

Provider references: [Razorpay refund response](https://github.com/razorpay/razorpay-python/blob/master/documents/refund.md), [Google Routes TollInfo](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TollInfo).

Code checkpoint: `ccfb1b5` on `integration/agent-a-staging`; operations `5ae3f35`, response performance `839b36f`, provider refunds `80a595f`. Concurrent EAS manifest edits remain outside these commits.

`graphify update .` was attempted, but Windows Application Control blocked `graphify.exe`. Generated graphs were not refreshed; an administrator-approved executable/policy change is needed for that documentation gate.

Final images from the code checkpoint passed the same isolated smoke matrix: `cabzone-api:backend-closeout-20261029` and `cabzone-web:backend-closeout-20261029`. These are local images, not a staging deployment. The documented Zod audit exception still needs security-owner review before commercial launch.
