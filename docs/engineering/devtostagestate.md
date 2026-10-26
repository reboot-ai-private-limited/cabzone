# Development to staging state: gap analysis and work order

**Snapshot:** 26 October 2026. **Inputs:** [real-world gap analysis](real-world-gap-analysis-report.md), [project tracker context](project-tracker-graph-context.md), [decision log](../decision-log.md), [documentation review](../../graphify-out/documentation/DOCUMENTATION_REVIEW.md), and the cited code. This is a comparison and ordered backlog, not a new production-readiness score. The tracker workbook remains the editable task register: `artifacts/Cabzone_Project_Tracker.xlsx`. No owners or deadlines have been assigned.

The tracker has 27 tasks focused on financial accuracy, device testing, KYC, notifications, and release checks. The gap report raises additional ride-policy and product-feature work. Its recommendations should be reconciled with current code and approved decisions before being added to the tracker.

## Corrections to the gap report

| Report statement | Current finding and action |
| --- | --- |
| Admin cannot configure outstation fare tiers | [PricingConfigDialog](../../apps/web/src/features/pricing/components/PricingConfigDialog.tsx) has outstation base, per-km, and minimum inputs. Verify a save/quote round trip; do not rebuild the form. |
| Cashout approval screen is absent | [Finance CashoutQueue](../../apps/web/src/features/finance/components/CashoutQueue.tsx) supports manual test request review. Automated bank payout is a separate live-money decision. |
| Neither app offers safety actions | The [rider active-ride screen](../../apps/rider-mobile/src/app/(rider)/ride/[rideId].tsx) offers sharing, emergency-contact calling, and emergency dialing. A full SOS workflow is [deferred as OQ-029](../LLD/open-questions.md). Verify the existing actions on a device. |
| All admins have super-admin power | API roles and [city-scoped middleware](../../apps/api/src/modules/identity/interface/middlewares/requireAdminScope.middleware.ts) exist. Audit route coverage rather than assuming no RBAC. |
| Expired documents always leave drivers eligible | [Ride acceptance](../../apps/api/src/container.ts) checks documents outside the development bypass. Expiry reminders, renewal, and an automatic status sweep remain to do. |
| The one-active-rider-ride rule is approved | The backend [create use case](../../apps/api/src/modules/rides/application/useCases/createRide.usecase.ts) has no rider-active check, but the [rider plan](rider-app-architecture-and-implementation-plan.md) marks that rule **Proposed**. Confirm the product rule first. |
| Rider push is always stubbed | Both mobile Metro configs use a stub by default and use real `expo-notifications` when `EXPO_USE_PUSH=1`. Build configuration and device delivery still need verification. [Expo requires a development build for remote push](https://docs.expo.dev/push-notifications/faq/). |

## Ordered next steps

### 1. Decide the target release and settle open scope

**Product gate, before dependent implementation.** Choose an internal test beta or live paid staging/launch target. Confirm the proposed one-active-ride status set, rider cancellation-fee collection method, ratings visibility, toll/permit treatment, and whether safety extensions are in scope. Keep external KYC, automated payouts, and full SOS separate unless product approves them. Source: [open questions](../LLD/open-questions.md), [rider plan](rider-app-architecture-and-implementation-plan.md), [test wallet boundaries](driver-wallet-money-movement.md).

### 2. Enforce one active rider booking if approved

**New from gap report.** Add a server-owned, concurrency-safe booking guard using the confirmed booking-blocking statuses, with idempotent retries and a link to the existing ride on conflict. Test simultaneous requests and restart behavior; a disabled app button is insufficient. Source: [create ride code](../../apps/api/src/modules/rides/application/useCases/createRide.usecase.ts), [proposed rule](rider-app-architecture-and-implementation-plan.md).

### 3. Fund rider cancellation and no-show fees

**New from gap report.** The [cancel use case](../../apps/api/src/modules/rides/application/useCases/cancelRide.usecase.ts) calculates a fee and credits driver compensation, but does not collect the rider's amount. Choose collection or arrears policy before coding. Test grace periods, no-shows, duplicate requests, disputes, and ledger reconciliation. Source: [D-032](../decision-log.md), [gap report](real-world-gap-analysis-report.md).

### 4. Remove fabricated Finance values

**Already in tracker.** Replace the [FinanceScreen sample fallback](../../apps/web/src/features/finance/components/FinanceScreen.tsx) with a real loading, unavailable, or empty state. Never show invented balances or driver counts after a failed query.

### 5. Make driver earnings and history server-owned

**Already in tracker.** Provide period totals, counts, gross/commission/net breakdowns, and paginated ride/ledger history. The [driver app](../../apps/driver-mobile/src/context/duty-context.tsx) currently calculates from its latest 100 rides. Verify totals against cash, UPI, pending payment, cashout reservations, and commission refunds. Source: [driver plan, slice 4](driver-app-architecture-and-implementation-plan.md).

### 6. Reconcile historical money and complete payment operations

**Tracker plus gap report.** Reconcile already-settled online rides before any earnings backfill; add searchable closed disputes and receipt evidence; define manual online-refund review and provider-to-ledger settlement reconciliation. Keep one credit/debit per event under retries. Source: [audit next sequence](../../audit.md), [driver wallet plan](driver-wallet-money-movement.md), [UPI guide](razorpay-upi-test-checkout.md).

### 7. Run the two-phone ride and wallet acceptance pass

**Already in tracker.** On real devices, cover booking to settlement, QR/test checkout, switching to cash, cancellation, failed/repeated payment, wallet recharge/cashout recovery, rider/driver relaunch in each active status, and duplicate/reordered events. Record exact results and defects. Test mode does not demonstrate real UPI app handoff. Source: [rider test matrix](rider-app-architecture-and-implementation-plan.md), [driver release gate](driver-app-architecture-and-implementation-plan.md).

### 8. Enable and test real push in development builds

**Tracker item made concrete by gap report.** Configure rider and driver native build credentials, ensure the production build does not resolve to the Metro stub, and test foreground/background/terminated delivery plus deep links and reconnect recovery. Check driver FCM configuration and both apps' notification registration. Expo Go cannot verify remote push. Source: [realtime plan](driver-realtime-websocket-fcm-plan.md), [Expo setup](https://docs.expo.dev/push-notifications/push-notifications-setup/).

### 9. Stop redundant driver offer polling

**New from gap report.** [Driver ride context](../../apps/driver-mobile/src/context/ride-context.tsx) polls offers every three seconds even when `socketConnected` is true. Poll as a recovery path when disconnected, then reconcile after reconnect. Verify no missed offers, duplicate cards, or battery-heavy steady-state loop.

### 10. Complete KYC expiry, renewal, and document privacy

**Tracker plus gap report.** Add expiry warnings, renewal/reapplication, and an automatic status sweep; keep the acceptance-time validity check. Audit private upload and admin preview across every document type, and decide vehicle-document ownership when a vehicle changes. Source: [audit](../../audit.md), [onboarding audit](driver-onboarding-flow-audit.md), [OQ-013 and OQ-021](../LLD/open-questions.md).

### 11. Repair and verify pricing configuration

**Already in tracker.** Repair duplicate active-pricing data before the unique index deployment; verify city → state → global fallback and D-039 interstate segments against signed quotes and saved rides. Run a real admin outstation-tier save/quote check rather than implementing the report's stale UI finding. Sync conflicting pricing docs after verification. Source: [D-039](../decision-log.md), [audit](../../audit.md).

**26 October verification:** See [pricing verification](pricing-verification-2026-10-26.md). The development database has no duplicate ACTIVE scopes and already has the unique index; code regressions cover fallback, interstate rates, and saved ride snapshots. The authenticated admin browser check remains open.

### 12. Decide toll and permit quote treatment

**New from gap report; product question open.** [OQ-022](../LLD/open-questions.md) calls for a separate, visible treatment but is not final. Decide provider availability, estimated-versus-final amounts, unavailable data behavior, and who pays. Then implement backend quote/ride snapshots and rider/driver display if required for staging.

### 13. Build mid-trip destination extension

**New from gap report; decided behavior.** Implement [D-029](../decision-log.md) across request, route/zone/fare recalculation, driver confirmation, payment snapshot, events, and both apps. Verify acceptance, rejection, retries, multiple extensions, and outstation/state transitions.

### 14. Define and build post-ride ratings

**New from gap report.** Confirm the open review visibility/timing rule, then add one review per participant per ride, persistence, API, both app prompts/history, and trust-score inputs. Do not infer an average from fabricated/default stars. Source: [OQ-019](../LLD/open-questions.md), [PRD](../prd.md).

### 15. Finish essential admin operations and permission review

**Tracker plus gap report.** Keep the existing Finance cashout queue; add the refund/dispute evidence and audit/health surfaces operators need for the chosen release. Review every admin route against role and city scope, and reconcile API/OpenAPI paths. Treat dashboard, settings, and other placeholder navigation items as separate scope decisions, not automatic blockers. Source: [gap report](real-world-gap-analysis-report.md), [audit](../../audit.md).

### 16. Close mobile, security, and infrastructure release checks

**Already in tracker.** Verify rider/driver accessibility and low-end Android performance, driver background location and app-kill recovery, KYC privacy, production SMS/OTP fail-closed behavior, backup/restore, load, and rollout monitoring. Confirm any production FCM credentials in the actual native builds. Source: [rider MVP gate](rider-app-architecture-and-implementation-plan.md), [driver release gate](driver-app-architecture-and-implementation-plan.md), [audit](../../audit.md).

### 17. Prepare live payment and cashout only if live launch is selected

**Conditional external gate.** Obtain merchant live UPI QR access and separate credentials; test actual app handoff, webhook retry, exact-fare capture, refund handling, and settlement reconciliation. Decide whether driver cashout remains manually reviewed or moves to verified beneficiary/payout rails. Test wallet balances must never migrate into withdrawable real funds. Source: [UPI guide](razorpay-upi-test-checkout.md), [wallet plan](driver-wallet-money-movement.md), [Razorpay test-mode guidance](https://razorpay.com/docs/server-integration/python/test-app/).

### 18. Validate invoices, tax, and other launch obligations

**New from gap report; requires specialist review.** Have finance/legal confirm the actual invoice and tax obligations for Cabzone's business and payment model before specifying server invoices or tax fields. The report's precise tax prescription was not independently validated here. Also review document retention, support escalation, and rider/driver terms for the chosen geography and release.

### 19. Synchronize documentation and tracker after evidence lands

**Already in tracker.** Update the stale UPI guide, pricing/state LLDs, mobile docs hub, acceptance matrix, and this work order only after tests or decisions change the baseline. Assign owners and dates in the workbook; then refresh [Graphify tracker context](project-tracker-graph-context.md). The current work log and graph headings are snapshots, not live status.

## Explicitly deferred or optional

- Automated third-party KYC remains deferred until product selects and approves a provider; manual review and document safeguards still need completion.
- Automated bank payouts and live wallet funding are separate from the implemented test recharge/manual cashout flow.
- Full SOS escalation, masked calling/chat, embedded turn-by-turn navigation, and every disabled admin navigation page need an explicit release decision. Existing rider safety actions and external-map navigation should not be mistaken for absent UI.

**Verification limit:** This comparison inspected the cited high-impact paths but did not run tests, device flows, payment-provider calls, or a legal review. The gap report's percentages and test count are not adopted as verified completion measures.
