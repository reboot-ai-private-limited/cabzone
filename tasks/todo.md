# Three-agent staging completion checklist

## 29 October backend checkpoint

See [completion evidence and exact remaining inputs](../docs/engineering/backend-completion-2026-10-29.md). Older branch-only/environment-unavailable notes below are superseded by this checkpoint; unverified acceptance gates stay unchecked.

- [x] Integrated UI (`c3382a0`) and platform (`54a7916`) branches; repaired integration regressions.
- [x] Provider-verified full refunds before ledger reversal (`80a595f`), evidence/replay tests.
- [x] Shared push endpoint, Redis startup readiness, worker/reconciliation alerts (`b673e49`); scoped push authentication to its own routes.
- [x] Signed toll disclosures and extension API/UI; frozen incremental pricing, expiry/concurrency/full routes/final settlement tests.
- [x] Removed geocoding from ride response waits; bounded background lookup work.
- [x] Production image builds; isolated API/worker/web smoke, Redis fault/recovery and production missing-SMS refusal.
- [x] Encrypted synthetic Mongo dump/restore; exact records, money checks, corruption rejection.
- [x] Read-only history audit: 7 clean cash rides; 8 wallets/7 clean; 3 orphan commission links and 1 disconnected chain recorded.
- [ ] Data owner: approve source-backed recovery or choose clean staging fixtures for four findings.
- [ ] Live providers, off-host backup, alert owner/destination, traffic/SLO, RPO/RTO and deploy/rollback acceptance.
- [ ] Installed two-phone ARTEMIS and authenticated admin browser acceptance.

Validation: `pnpm check` passed all 20 tasks: API 495/495 across 62 files, web 59/59, both mobile unit suites, typechecks, lint and architecture checks. `pnpm build` passed API/web. Provider/device gates are not inferred from unit tests.

Detailed scope, files, dependencies, acceptance criteria, and verification are in [plan.md](plan.md). This checklist tracks execution of that plan; it does not replace the project workbook. Unchecked means acceptance has not been recorded here, including tasks with existing reusable code. Fill the evidence table with a commit/build SHA and actual results before checking a task.

## Wave 0 - Preserve and establish the baseline

- [x] I01 - A: inventory every worktree, including committed but unintegrated Steps 2/3/6/14; preserve owner handoffs and source/tests.
- [ ] I02 - A: integrate policy and establish one common baseline and agent worktrees.
- [ ] I03 - A; B reviews clients; C reviews platform: integrate pricing, KYC, acceptance, push, release-report, money, booking, arrears, and ratings branches one at a time.
- [ ] Gate 0 - A+B+C: existing work is preserved, baseline checks pass, shared-file owners and manifest lock are recorded.

## Agent A - Backend policy, money, contracts, integration

- [ ] A01 - Step 11: finish pricing repair verification, authenticated admin round trip, and safe staging index process.
- [ ] A02 - Steps 5/6: audit historical earnings and verify selected idempotent recovery.
- [ ] A03 - Step 6: finish wallet/provider reconciliation and bucket invariants.
- [ ] A04 - Steps 6/15: closed dispute evidence, refund-review semantics, search and authorization.
- [ ] Gate 1 - A+B+C: foundation integrates; money audit has no unexplained discrepancy and build/OTP blockers are tracked or resolved.
- [ ] A05 - Step 2: resume/test concurrency-safe booking guard, idempotency and duplicate-data migration.
- [ ] A06 - Step 3: cancellation policy configuration and immutable snapshots.
- [ ] A07 - Step 3: atomic rider arrears, compensation, reservation and waiver ledger.
- [ ] A08 - Steps 3/6: once-only cash/online arrears recovery, booking eligibility and failure races.
- [ ] Gate 2 - A+B+C: booking/arrears API and UI agree; concurrency, rollback and money invariants pass.
- [ ] A09 - Step 12: truthful toll/permit metadata and signed quote/ride snapshots.
- [ ] A10 - Step 13: extension proposal, route/zone/delta snapshot and authorization.
- [ ] A11 - Step 13: extension accept/reject, event/payment state and concurrency.
- [ ] Gate 3 - A+B+C: toll and extension journeys pass through final payment and receipt.
- [ ] A12 - Step 14: resume/test unique participant ratings, authorization and hidden-review access.
- [ ] A13 - Step 14: once-only reveal, real aggregates, trust thresholds and sweep/restart recovery.
- [ ] A14 - Step 15: permissions and OpenAPI parity for all new endpoints.
- [ ] A15 - Step 16: load/fault tests and financial/realtime recovery evidence at declared traffic.
- [ ] A16 - Step 17 CONDITIONAL: live provider capture/refund/settlement/payout verification after the commercial gate opens.

## Agent B - Rider, driver and admin interfaces

- [ ] B01 - Steps 4/5/9: preserve honest Finance states, server earnings/history, and recovery-only offer polling.
- [ ] B02 - Step 2: finish existing-booking recovery and canonical-status rider UX.
- [ ] B03 - Step 3: admin cancellation settings and rider/driver arrears/receipt UI.
- [ ] B04 - Steps 6/15: finish Finance/disputes/evidence/refund-review operations in authenticated web.
- [ ] B05 - Step 12: toll/permit disclosure across booking, offer, active ride and receipt.
- [ ] B06 - Step 13: extension request/confirm/reject and relaunch/reconnect app interaction.
- [ ] B07 - Step 14: resume both rating prompts, hidden-state handling and genuine profile/admin display.
- [ ] B08 - Step 16: TalkBack, large text, reduced motion, contrast, touch targets, keyboard and safe-area pass.
- [ ] B09 - Step 16: low-end Android interaction/performance evidence on release-like builds.
- [ ] B10 - Step 8: verify both apps' push token, permission, deep-link and reconnect behavior with C.
- [ ] B11 - Step 17 CONDITIONAL: real UPI app handoff and approved live payment/receipt UI after commercial authorization.

## Agent C - Platform, providers and release systems

- [ ] C01 - Step 16: correct production web/API build configuration and smoke-test built images.
- [ ] C02 - Step 16: dependency reachability triage, compatible remediation and security CI gate.
- [ ] C03 - Step 16: real SMS integration with fail-closed startup and provider/abuse/failure tests.
- [ ] C04 - Steps 10/16: integrated KYC renewal/expiry, vehicle ownership, privacy and document lifecycle.
- [ ] C05 - Step 8: native push projects/credentials/builds, token lifecycle and deep-link setup.
- [ ] C06 - Step 16: encrypted off-host backup and isolated Mongo/Redis restore drill within agreed RPO/RTO.
- [ ] C07 - Step 16: monitoring, alert proof, readiness behavior, deploy smoke and rollback.
- [ ] C08 - Step 18: obtain specialist requirements/sign-off and implement confirmed obligations.
- [ ] C09 - Steps 7/16: background/process-death/force-stop/reboot/network recovery on installed Android builds.

## Joint completion gates

- [ ] J01 - All focused and integrated checks/builds pass on the same SHA, including Mongo integration and native rebuilds when required.
- [ ] J02 - Complete the physical two-phone ride/payment/wallet/arrears/extension/ratings/relaunch matrix with durable-record evidence.
- [ ] J03 - Verify rider/driver native foreground/background/terminated/reconnect push and taps on every target platform.
- [ ] J04 - Demonstrate production-like SMS/images, dependency security, load/failover, backup restore, alerts and rollback.
- [ ] J05 - Record beta versus commercial scope, external owners, finance/legal approval and explicit Step 17 deferral or live evidence.
- [ ] J06 - Update all 19 statuses, tracker workbook/context, docs hub/LLDs/guides, daily log, acceptance evidence and consolidated Graphify output.
- [ ] FINAL - All beta-required rows have passing evidence; remaining commercial work has an explicit owner/deferral. No required untested gate is labelled complete.

## Execution evidence and shared-file handoffs

### System audit repair checkpoint

- [x] Finding 1: verify fare plus arrears with the provider; keep commission on fare only (`fb1180e`).
- [x] Finding 2: reject disconnected wallet transaction chains (`fb1180e`).
- [ ] Finding 3: require verified refund amount/payment evidence before online dispute reversal.
- [x] Finding 4: correct web Docker package filter and copy geo/design-system workspace dependencies (`36b1c86`). Docker engine unavailable; image smoke test remains open.
- [ ] Finding 5: real SMS integration; provider choice requested from the release owner.
- [x] Finding 6: distinguish commission and arrears dispute refunds in duplicate detection (`fb1180e`).
- [x] Finding 7: search beyond 500 dispute candidates (`645996d`).
- [ ] Finding 8: remove address lookup from the ride response critical path and bound concurrent geocoding.

Validation: API typecheck and 452/452 API tests including Mongo passed. Graphify remains blocked by Windows Application Control. Unrelated mobile KYC edits were preserved.

Append one row per task/handoff. Include base/feature SHA, tests and results, downstream schema/event changes, and target environment. Do not include tokens, keys, OTPs or personal data. Use `Blocked: <input>; owner: <role>` for external prerequisites instead of checking the task.

| Task                           | Owner  | Base/feature or installed-build SHA                                                              | Tests / evidence / downstream handoff                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | State                                                            |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Planning baseline              | A+B+C  | Source baseline `5cd0a31`; branch/worktree inventory in plan                                     | Plan created; implementation and external verification are not completed by this document                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ready for execution                                              |
| I01                            | A      | `origin/main` `2d3097d`; integration branch `integration/agent-a-staging`                        | Seven worktrees clean; policy, arrears, booking, ratings and KYC in main; pricing `d14ad1c`, money `5cd0a31`, acceptance `ca88081`, push `960e5ad`, release audit `a379747` remain separate. B/C review is required before integrating their owned surfaces.                                                                                                                                                                                                                                                                       | Inventory complete                                               |
| I02/I03                        | A      | Baseline `2d3097d`; pricing repair `172ebfb`, evidence `5fc5583`; money reconciliation `b1ddfca` | Current policy/booking/arrears/ratings/KYC preserved. Pricing snapshot patch was already in main. API typecheck and 448/448 API tests passed, including Mongo; web typecheck and 49/49 web tests passed. Two-phone acceptance, push, release audit, authenticated browser, and B/C handoffs remain open. Graphify executable was blocked by Windows Application Control; generated graph remains at main's version.                                                                                                                | Partial integration                                              |
| A01                            | A      | `172ebfb`, `5fc5583`                                                                             | 54 focused pricing tests passed (quote/ride 31, repair Mongo 1, zone/admin/activation 22); API typecheck passed. Historical development DB audit is documented; authenticated admin browser and staging DB checks still required before closing.                                                                                                                                                                                                                                                                                   | Code integrated; acceptance open                                 |
| A02-A04                        | A      | `b1ddfca`                                                                                        | Money, arrears and ratings focused suites 12/12; full API 448/448 including Mongo, web 49/49, API/web typechecks. Provider/backup/reviewed historical recovery and authenticated operations evidence still required.                                                                                                                                                                                                                                                                                                               | Existing code integrated; acceptance open                        |
| A04/A08 refund correction      | A      | Follow-up to `b1ddfca`                                                                           | Reproduced full online refund leaving collected arrears cleared. Resolution now restores the actual paid-arrears ledger amount to the rider wallet once, separately from driver earnings reversal. API typecheck and 449/449 API tests including Mongo passed. This records manual refund review; provider execution and staging acceptance remain open.                                                                                                                                                                           | Regression fixed; external evidence open                         |
| Driver KYC/Account keyboard UX | B -> A | `01f69c0` (`integration/agent-a-staging`), `d3e3d0d` (`feature/agent-b-ui-b01`)                  | Added `OnboardingFormScroll` + Android edge-to-edge keyboard padding/scroll helpers across KYC Steps 1-5 and driver account forms. `tsc --noEmit` 0 errors; `onboarding-ux.test.mjs` 4/4 passed. Physical phone check remains under B08/J02.                                                                                                                                                                                                                                                                                       | Code committed; device check open                                |
| B01-B04, B07-B08               | B      | Base `036dcd2`; commits `ba4264d`..`d3e3d0d` on `feature/agent-b-ui-b01`                         | Honest Finance/ledger states, dispute/waiver/idempotent wallet UI, admin cancellation policy UI, rider/driver arrears + single-flight guards + no-show timer + double-blind ratings + a11y pass. Web `59/59`, Rider `57/57`, Driver `45/45`, all `tsc --noEmit` 0 errors. Blocked on authenticated browser pass & physical Android TalkBack/perf (`B08`/`B09`).                                                                                                                                                                    | Branch committed; integration & browser/device open              |
| C01-C09                        | C      | Base `8a3bb63`; commits `2a1bc7b`..`b218762` on `feature/agent-c-platform`                       | Hardened Docker/compose/`pino` staging logger, HTTP SMS gateway + fail-closed prod OTP, private KYC asset cleanup & vehicle-doc ownership, webhook alerting + Redis readiness + AES-256-GCM backup/restore scripts, push Metro stub fix + EAS configs + 409 presence recovery, and prod advisory fixes (`pnpm audit --prod --audit-level high` exit 0; API focused `18/18` + `tsc` 0 errors). External blockers: Docker daemon, DLT/SMS creds, Cloudinary live check, EAS/FCM creds, off-host bucket, and physical Android phones. | Branch committed; Agent A bootstrap wiring & external gates open |
