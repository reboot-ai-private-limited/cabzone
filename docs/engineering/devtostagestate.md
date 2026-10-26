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
| The one-active-rider-ride rule is approved | **Confirmed in [D-043](../decision-log.md#d-043--one-active-ride-booking-guard--canonical-booking-blocking-statuses)** on 26 October 2026 across all 9 active/settlement statuses per `bookerRiderId`. Implement the server guard in [createRide.usecase.ts](../../apps/api/src/modules/rides/application/useCases/createRide.usecase.ts) and add `PAYMENT_CONFIRMED` to `isRideActive()` in Step 2. |
| Rider push is always stubbed | Both mobile Metro configs use a stub by default and use real `expo-notifications` when `EXPO_USE_PUSH=1`. Build configuration and device delivery still need verification. [Expo requires a development build for remote push](https://docs.expo.dev/push-notifications/faq/). |

## Ordered next steps

### 1. Decide the target release and settle open scope — **Resolved (26 October 2026)**

**Completed in [D-042–D-046](../decision-log.md); policy-dependent work unblocked:**
- **Release target ([D-042](../decision-log.md#d-042--internal-beta--test-staging-target--launch-exclusions)):** **Internal Beta / Test Staging** — Razorpay test UPI & manual admin cashout review, manual KYC review, fail-closed non-dev SMS/OTP, and existing rider active-ride safety actions (`Share Trip`, emergency contact call, `112` dial). Live merchant UPI, automated payouts, external KYC (Surepass/Cashfree), and full SOS workflow remain deferred to the commercial launch gate.
- **One-active-ride rule ([D-043](../decision-log.md#d-043--one-active-ride-booking-guard--canonical-booking-blocking-statuses)):** Enforce per `bookerRiderId` across all **9** active/settlement statuses (`REQUESTED`, `OFFERING`, `DRIVER_ASSIGNED`, `DRIVER_EN_ROUTE`, `DRIVER_ARRIVED`, `TRIP_STARTED`, `TRIP_COMPLETED`, `PAYMENT_PENDING`, `PAYMENT_CONFIRMED`); `SETTLED`, `CANCELLED`, `EXPIRED`, and `PAYMENT_DISPUTED` do not block.
- **Cancellation & no-show fee funding ([D-044](../decision-log.md#d-044--rider-cancellation--no-show-fee-arrears-ledger--configurable-policy)):** Move fee/grace/wait fields onto `PricingConfig` (defaults ₹50 = ₹35 driver + ₹15 platform, 2m grace, 5m wait), record rider `CANCELLATION_FEE_ARREARS`, attach itemized `arrearsPaise` to the next ride (settled via Razorpay UPI or collecting-driver wallet debit on cash confirmation), and block new cash bookings when unpaid arrears `>= ₹50`.
- **Tolls & permits ([D-045](../decision-log.md#d-045--highway-toll--interstate-permit-quoteride-treatment)):** Separate non-commissioned estimate (`tollSnapshot` from `RouteProvider`, never converting unknown tolls to `₹0`), excluded from `suggestedFarePaise` / `agreedFarePaise` / commission, payable by rider at actuals.
- **Post-ride ratings ([D-046](../decision-log.md#d-046--double-blind-post-ride-ratings--trust-score-display-threshold)):** Double-blind 1–5 star ratings (+ optional tags) on `SETTLED` rides within a 7-day window; reveal and aggregate when both submit or 7 days expire; display `"New"` until `ratingCount >= 5`.

### 2. Enforce one active rider booking (Approved — D-043)

**Unblocked by D-043.** Add a server-owned, concurrency-safe booking guard per `bookerRiderId` across the 9 canonical booking-blocking statuses (`409 ACTIVE_RIDE_EXISTS` with `rideId`), with idempotent retries, and align `isRideActive()` in `apps/rider-mobile/src/services/rider-helpers.ts` to include `PAYMENT_CONFIRMED`. Test simultaneous requests and restart behavior; a disabled app button is insufficient. Source: [D-043](../decision-log.md#d-043--one-active-ride-booking-guard--canonical-booking-blocking-statuses), [create ride code](../../apps/api/src/modules/rides/application/useCases/createRide.usecase.ts).

### 3. Fund rider cancellation and no-show fees (Approved — D-044)

**Unblocked by D-044.** Move fee/grace/wait parameters onto `PricingConfig` + `RidePricingSnapshot`, record `CANCELLATION_FEE_ARREARS` in [cancelRide.usecase.ts](../../apps/api/src/modules/rides/application/useCases/cancelRide.usecase.ts), surface `arrearsPaise` on next-ride quotes/settlements, recover via online UPI or collecting-driver wallet debit on cash confirmation, and block further cash bookings when unpaid arrears `>= ₹50`. Test grace periods, no-shows, duplicate requests, disputes/waivers, and ledger reconciliation. Source: [D-044](../decision-log.md#d-044--rider-cancellation--no-show-fee-arrears-ledger--configurable-policy), [D-032](../decision-log.md#d-032--state-based-cancellation--no-show-policy).

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

**26 October verification:** See [pricing verification](pricing-verification-2026-10-26.md). The development database had no duplicate ACTIVE scopes and already had the unique index; code regressions cover fallback, interstate rates, and saved ride snapshots. The authenticated admin browser and staging database checks remain open.

### 12. Implement toll and permit quote disclosure (Approved — D-045)

**Unblocked by D-045.** Snapshot `TollInfo` from `RouteProvider` onto signed quotes and `RideEntity` as a separate non-commissioned estimate payable by the rider at actuals, never coercing unknown tolls (`exists: true, estimatedAmountPaise: null`) into `₹0`, and display across rider/driver quote, offer, active-ride, and receipt views. Source: [D-045](../decision-log.md#d-045--highway-toll--interstate-permit-quoteride-treatment), [OQ-022](../LLD/open-questions.md).

### 13. Build mid-trip destination extension

**New from gap report; decided behavior.** Implement [D-029](../decision-log.md) across request, route/zone/fare recalculation, driver confirmation, payment snapshot, events, and both apps. Verify acceptance, rejection, retries, multiple extensions, and outstation/state transitions.

### 14. Build double-blind post-ride ratings (Approved — D-046)

**Unblocked by D-046.** Implement one immutable 1–5 star (+ optional tags) rating per participant on `SETTLED` rides within 7 days, double-blind reveal on mutual submission or 7-day expiry, aggregate `ratingAverage` / `ratingCount` updates on reveal, `"New"` display when `ratingCount < 5`, and deterministic trust-score inputs. Source: [D-046](../decision-log.md#d-046--double-blind-post-ride-ratings--trust-score-display-threshold), [OQ-018 / OQ-019](../LLD/open-questions.md).

### 15. Finish essential admin operations and permission review

**Tracker plus gap report.** Keep the existing Finance cashout queue; add the refund/dispute evidence and audit/health surfaces operators need for the chosen release. Review every admin route against role and city scope, and reconcile API/OpenAPI paths. Treat dashboard, settings, and other placeholder navigation items as separate scope decisions, not automatic blockers. Source: [gap report](real-world-gap-analysis-report.md), [audit](../../audit.md).

### 16. Close mobile, security, and infrastructure release checks

**Already in tracker.** Verify rider/driver accessibility and low-end Android performance, driver background location and app-kill recovery, KYC privacy, production SMS/OTP fail-closed behavior, backup/restore, load, and rollout monitoring. Confirm any production FCM credentials in the actual native builds. Source: [rider MVP gate](rider-app-architecture-and-implementation-plan.md), [driver release gate](driver-app-architecture-and-implementation-plan.md), [audit](../../audit.md).

### 17. Prepare live payment and cashout (Deferred past Internal Beta per D-042)

**Deferred external gate for Commercial Launch.** Internal Beta runs on Razorpay test UPI and manual test cashout ([D-042](../decision-log.md#d-042--internal-beta--test-staging-target--launch-exclusions)). Before promoting to Live Paid Staging / Commercial Launch, obtain merchant live UPI QR access and separate credentials; test actual app handoff, webhook retry, exact-fare capture, refund handling, and settlement reconciliation; and decide whether driver cashout remains manually reviewed or moves to verified beneficiary/payout rails. Test wallet balances must never migrate into withdrawable real funds. Source: [UPI guide](razorpay-upi-test-checkout.md), [wallet plan](driver-wallet-money-movement.md), [Razorpay test-mode guidance](https://razorpay.com/docs/server-integration/python/test-app/).

### 18. Validate invoices, tax, and other launch obligations

**New from gap report; requires specialist review.** Have finance/legal confirm the actual invoice and tax obligations for Cabzone's business and payment model before specifying server invoices or tax fields. The report's precise tax prescription was not independently validated here. Also review document retention, support escalation, and rider/driver terms for the chosen geography and release.

### 19. Synchronize documentation and tracker after evidence lands

**Already in tracker.** Update the stale UPI guide, pricing/state LLDs, mobile docs hub, acceptance matrix, and this work order only after tests or decisions change the baseline. Assign owners and dates in the workbook; then refresh [Graphify tracker context](project-tracker-graph-context.md). The current work log and graph headings are snapshots, not live status.

## Explicitly deferred or optional

- Automated third-party KYC remains deferred until product selects and approves a provider; manual review and document safeguards still need completion.
- Automated bank payouts and live wallet funding are separate from the implemented test recharge/manual cashout flow.
- Full SOS escalation, masked calling/chat, embedded turn-by-turn navigation, and every disabled admin navigation page need an explicit release decision. Existing rider safety actions and external-map navigation should not be mistaken for absent UI.

**Verification limit:** This comparison inspected the cited high-impact paths but did not run tests, device flows, payment-provider calls, or a legal review. The gap report's percentages and test count are not adopted as verified completion measures.
