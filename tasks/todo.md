# Two-agent staging completion checklist

Detailed scope, files, dependencies, acceptance criteria, and verification are in [plan.md](plan.md). This checklist tracks execution of that plan; it does not replace the project workbook. Unchecked means acceptance has not been recorded here, including tasks with existing reusable code. Fill the evidence table with a commit/build SHA and actual results before checking a task.

## Wave 0 - Preserve and establish the baseline

- [ ] I01 - A: inventory every worktree, including uncommitted Steps 2/3/6/14; preserve owner handoffs and source/tests.
- [ ] I02 - A: integrate policy and establish one common baseline and agent worktrees.
- [ ] I03 - A; B reviews clients: integrate reusable pricing, KYC, acceptance, push, release-report, and reviewed money branches one at a time.
- [ ] C0 - Both: existing work is preserved, baseline checks pass, shared-file owners and manifest lock are recorded.

## Agent A - Backend policy, money, contracts, integration

- [ ] A01 - Step 11: finish pricing repair verification, authenticated admin round trip, and safe staging index process.
- [ ] A02 - Steps 5/6: audit historical earnings and verify selected idempotent recovery.
- [ ] A03 - Step 6: finish wallet/provider reconciliation and bucket invariants.
- [ ] A04 - Steps 6/15: closed dispute evidence, refund-review semantics, search and authorization.
- [ ] C1A - A+B: foundation integrates; money audit has no unexplained discrepancy and build/OTP blockers are tracked or resolved.
- [ ] A05 - Step 2: resume/test concurrency-safe booking guard, idempotency and duplicate-data migration.
- [ ] A06 - Step 3: cancellation policy configuration and immutable snapshots.
- [ ] A07 - Step 3: atomic rider arrears, compensation, reservation and waiver ledger.
- [ ] A08 - Steps 3/6: once-only cash/online arrears recovery, booking eligibility and failure races.
- [ ] C2A - A+B: booking/arrears API and UI agree; concurrency, rollback and money invariants pass.
- [ ] A09 - Step 12: truthful toll/permit metadata and signed quote/ride snapshots.
- [ ] A10 - Step 13: extension proposal, route/zone/delta snapshot and authorization.
- [ ] A11 - Step 13: extension accept/reject, event/payment state and concurrency.
- [ ] C3A - A+B: toll and extension journeys pass through final payment and receipt.
- [ ] A12 - Step 14: resume/test unique participant ratings, authorization and hidden-review access.
- [ ] A13 - Step 14: once-only reveal, real aggregates, trust thresholds and sweep/restart recovery.
- [ ] A14 - Step 15: permissions and OpenAPI parity for all new endpoints.
- [ ] A15 - Step 16: load/fault tests and financial/realtime recovery evidence at declared traffic.
- [ ] A16 - Step 17 CONDITIONAL: live provider capture/refund/settlement/payout verification after the commercial gate opens.

## Agent B - Apps, web, identity/push, infrastructure

- [ ] B01 - Step 16: correct production web/API build configuration and smoke-test built images.
- [ ] B02 - Step 16: dependency reachability triage, compatible remediation and security CI gate.
- [ ] B03 - Step 16: real SMS integration with fail-closed startup and provider/abuse/failure tests.
- [ ] B04 - Steps 10/16: integrated KYC renewal/expiry, vehicle ownership, privacy and document lifecycle.
- [ ] B05 - Step 8: native push projects/credentials/builds, token lifecycle and deep-link setup.
- [ ] B06 - Steps 4/5/9: preserve honest Finance states, server earnings/history, and recovery-only offer polling.
- [ ] B07 - Step 2: finish existing-booking recovery and canonical-status rider UX.
- [ ] B08 - Step 3: admin cancellation settings and rider/driver arrears/receipt UI.
- [ ] B09 - Steps 6/15: finish Finance/disputes/evidence/refund-review operations in authenticated web.
- [ ] B10 - Step 12: toll/permit disclosure across booking, offer, active ride and receipt.
- [ ] B11 - Step 13: extension request/confirm/reject and relaunch/reconnect app interaction.
- [ ] B12 - Step 14: resume both rating prompts, hidden-state handling and genuine profile/admin display.
- [ ] B13 - Step 16: TalkBack, large text, reduced motion, contrast, touch targets, keyboard and safe-area pass.
- [ ] B14 - Steps 7/16: Android background/process-death/reboot/network recovery and low-end performance evidence.
- [ ] B15 - Step 16: encrypted off-host backup and isolated Mongo/Redis restore drill within agreed RPO/RTO.
- [ ] B16 - Step 16: monitoring, alert proof, readiness behavior, deploy smoke and rollback.
- [ ] B17 - Step 18: obtain specialist requirements/sign-off and implement confirmed obligations.
- [ ] B18 - Step 17 CONDITIONAL: real UPI app handoff and approved live payment/receipt UI after commercial authorization.

## Joint completion gates

- [ ] J01 - All focused and integrated checks/builds pass on the same SHA, including Mongo integration and native rebuilds when required.
- [ ] J02 - Complete the physical two-phone ride/payment/wallet/arrears/extension/ratings/relaunch matrix with durable-record evidence.
- [ ] J03 - Verify rider/driver native foreground/background/terminated/reconnect push and taps on every target platform.
- [ ] J04 - Demonstrate production-like SMS/images, dependency security, load/failover, backup restore, alerts and rollback.
- [ ] J05 - Record beta versus commercial scope, external owners, finance/legal approval and explicit Step 17 deferral or live evidence.
- [ ] J06 - Update all 19 statuses, tracker workbook/context, docs hub/LLDs/guides, daily log, acceptance evidence and consolidated Graphify output.
- [ ] FINAL - All beta-required rows have passing evidence; remaining commercial work has an explicit owner/deferral. No required untested gate is labelled complete.

## Execution evidence and shared-file handoffs

Append one row per task/handoff. Include base/feature SHA, tests and results, downstream schema/event changes, and target environment. Do not include tokens, keys, OTPs or personal data. Use `Blocked: <input>; owner: <role>` for external prerequisites instead of checking the task.

| Task              | Owner | Base/feature or installed-build SHA                          | Tests / evidence / downstream handoff                                                     | State               |
| ----------------- | ----- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------- |
| Planning baseline | A+B   | Source baseline `08a963e`; branch/worktree inventory in plan | Plan created; implementation and external verification are not completed by this document | Ready for execution |
