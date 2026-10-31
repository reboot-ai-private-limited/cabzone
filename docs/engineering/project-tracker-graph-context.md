# Cabzone Project Tracker — Graphify context

Source workbook: `artifacts/Cabzone_Project_Tracker.xlsx`. Snapshot: 30 October 2026. This file makes the workbook's task register searchable in Graphify; the workbook remains the editable tracker. Status and priority below reflect verified code, automated tests, authenticated Admin Console acceptance, and physical two-phone Android acceptance as of 30 October 2026; external vendor credentials, live merchant onboarding, and staging off-host operational drills remain explicitly `In Progress` or `At Risk`. Owners and task dates remain unassigned, so the Gantt has no task bars. Refresh this context after editing the workbook.

The workbook has 27 tasks: 17 Complete, 5 In Progress, 3 At Risk, and 2 Not Started. The 20-week Gantt view begins 26 October 2026; that date is a display anchor, not a promised launch date. See the [29 October backend checkpoint](backend-completion-2026-10-29.md) and [30 October acceptance checkpoint](acceptance-checkpoint-2026-10-30.md) for detailed evidence.

## Product and documentation

### Confirm beta scope and launch exclusions
Complete · P0. Internal Beta / Controlled Test Staging target, launch exclusions, one-active-ride 9-status guard, next-ride cancellation arrears ledger, non-commissioned toll estimates, and double-blind 7-day ratings are recorded in [D-042–D-046](../decision-log.md), [Step 1 of dev-to-staging](devtostagestate.md), and [Step 18 launch register](step18-legal-finance-launch-register.md).

### Resolve live wallet provider launch scope
At Risk · P1. Internal Beta scope is locked (`D-042`: Razorpay test recharge + manual Finance/Super Admin cashout review), while commercial live wallet funding and automated bank payouts (`RazorpayX`) remain gated on external merchant/payout prerequisites. Source: [driver wallet money movement](driver-wallet-money-movement.md).

### Sync D-039 pricing and state-routing specs
Complete · P1. D-039 (`CITY → STATE → GLOBAL` hierarchy and interstate state-segment pricing) and D-045 (separate non-commissioned `tollSnapshot` payable at actuals) are synchronized across [`decision-log.md`](../decision-log.md), [`fare-engine.md`](../LLD/fare-engine.md), [`geo-reference-and-routing.md`](../LLD/geo-reference-and-routing.md), and [`step18-legal-finance-launch-register.md`](step18-legal-finance-launch-register.md).

### Sync UPI guide and mobile docs hub
Complete · P1. [`razorpay-upi-test-checkout.md`](razorpay-upi-test-checkout.md) (including online net wallet earnings credit, cashout/refund status, and the Razorpay Test Dashboard UPI toggle requirement) and [`docs/README.md`](../README.md) (`apps/rider-mobile` and `apps/driver-mobile`) are synchronized.

### Graphify all 71 project documents
Complete · P1 as recorded when the workbook was created. Source: [documentation review](../../graphify-out/documentation/DOCUMENTATION_REVIEW.md). The document corpus has since grown; this is a historical task label, not a live document count.

## Financials and admin web

### Backend: reconcile historical ride money
At Risk · P0. Read-only `auditBackendMoney.ts` and provider-verified refund/settlement reconciliation are implemented (`10/10` settled cash rides and `8/8` real wallets pass cleanly, including 30 Oct acceptance rides, arrears, cashout, and dispute commission refund). Four pre-existing seeded discrepancies (`01900000-0000-7000-8000-000000000030` broken chain and orphan `RIDE_COMMISSION` refs `REF_MS_01`, `REF_000055`, `REF_000053`) await data/finance owner choice between clean staging fixtures (`seed.ts` hardened so `--reset` produces zero audit issues) vs approved compensating entries. Source: [30 October acceptance checkpoint](acceptance-checkpoint-2026-10-30.md).

### Backend: server earnings totals and paging
Complete · P0. Server-owned IST period totals, paginated history, and explicit separation of `PAYMENT_PENDING`, `PAYMENT_DISPUTED`, and `CANCELLATION_COMPENSATION` amounts are implemented and verified on physical Driver hardware (`34bedf2c`). Source: [driver app slice 4](driver-app-architecture-and-implementation-plan.md).

### Web: remove sample Finance figures
Complete · P0. Illustrative fallback figures are removed; failed stats surface explicit unavailable banners (`Finance summary unavailable`) and authenticated `/finance` renders live double-entry ledger rows and cashout review actions.

### Backend: closed disputes and receipt evidence
Complete · P1. Unbounded closed-dispute search, receipt/provider order evidence, processed provider refund verification (`80a595f`), and live Admin `RIDER_WINS` commission refund (`DISPUTE_REFUND`) + closed archive verification are complete. Source: [D-041](../decision-log.md), [30 October acceptance checkpoint](acceptance-checkpoint-2026-10-30.md).

### Implement test recharge and cashout
Complete · P0. Implemented and verified with route-precedence regression coverage for public `/api/v1/driver/wallet/recharge-checkout`. Source: [driver wallet money movement](driver-wallet-money-movement.md).

### Implement rider/driver QR and webhook flow
Complete · P0 for the documented implementation; real UPI app handoff needs live merchant access. Source: [UPI checkout guide](razorpay-upi-test-checkout.md).

## Identity, KYC and security

### Backend: review KYC storage and ownership
Complete · P0. Vehicle document ownership enforcement, private signed-URL/proxy access, and orphan KYC asset cleanup are implemented and covered by automated tests (`6ed186d`, `2d3097d`).

### Driver: document expiry and renewal flow
Complete · P1. Acceptance-time document expiry enforcement, scheduled expiry notifications, and driver renewal UI are implemented and tested (`2d3097d`).

### Verify production SMS and OTP fail closed
In Progress · P0. Transactional HTTP SMS adapter (`56df13f`) and fail-closed production boot checks (`verify-container-smoke.mjs`) are verified; live staging SMS provider credentials and approved DLT sender/template remain to be provisioned. Source: [D-040](../decision-log.md).

### Verify KYC preview and upload privacy
In Progress · P0. Private preview/ownership guards are verified in automated suites; live staging private Cloudinary bucket qualification remains pending credentials.

### Implement admin original KYC preview
Complete · P1 for the documented implementation; live staging storage qualification is tracked under `Verify KYC preview and upload privacy`.

## Ride, realtime and mobile acceptance

### Backend: durable ride notifications
Complete · P0. BullMQ `notifications` worker, shared `/api/v1/push-token` registration, Expo/FCM token exchange, and remote background FCM delivery (`ride-offers` and `ride-updates`, with `pickupOtp` excluded from push payloads) are verified on two physical Android phones.

### Driver: background and app-kill recovery
Complete · P0. Verified on Realme X2 Pro (`34bedf2c`): `Allow all the time` GPS permission, foreground location service notification, remote FCM offer delivery while backgrounded, notification-tap deep-linking, 5s Wi-Fi disconnect/reconnect recovery, and `am force-stop` cold-relaunch recovery across active rides and wallet operations.

### Rider: relaunch recovery in each ride state
Complete · P0. Verified on Samsung Galaxy A55 (`RZCY90S42YL`): live `/ws?access_token=...` WebSocket recovery, `am force-stop` cold-relaunch recovery across `DRIVER_ASSIGNED` (`pickupOtp` preserved) and `PAYMENT_PENDING` (arrears + cash-block preserved), plus terminal `EXPIRED` UI synchronization.

### Backend: reconcile API and OpenAPI routes
Complete · P1. Routes, Admin RBAC enforcement (`15/15` live role checks across `SUPER_ADMIN`, `CITY_ADMIN`, `SUPPORT_ADMIN`, `FINANCE_ADMIN`), `/v1/driver/wallet` route precedence, and OpenAPI docs are reconciled and tested.

### Repair duplicate active pricing before index
Complete · P0. Duplicate active pricing repair (`172ebfb`), unique active index, and authenticated Admin `/pricing` save-to-quote propagation (`pricingConfigVersion` `2 → 3 → 4`) are verified.

### Phone: full ride, QR, cash and UPI pass
In Progress · P0. Two-phone physical pass completed for booking, `+₹10` driver counter negotiation, OTP pickup, mid-trip extension fail-closed guard (`EXTENSION_ROUTE_UNAVAILABLE` under Haversine), Driver QR & Rider UPI order creation, switch-to-cash & two-step confirmation, `-₹7.40` commission debit, double-blind 5★ ratings reveal, PDF receipt spooler, post-arrival cancellation arrears (`-₹50` rider / `+₹35` driver) + next-ride `₹132.55` itemization & cash block, and live dispute resolution. End-to-end Razorpay test-UPI capture awaits enabling UPI (`"upi": true`) on the Razorpay Test Dashboard merchant account.

### Phone: recharge and cashout recovery pass
In Progress · P0. Driver `₹100` cashout reservation (`upi9002@ybl`), `am force-stop` cold-relaunch Wallet/activity recovery, Admin Console `Record test transfer` (`TEST-UTR-20261030-01`), and `/api/v1/driver/wallet/recharge-checkout` `200 text/html` fix are verified; end-to-end test-UPI recharge capture awaits enabling UPI on the Razorpay Test Dashboard merchant account.

### Validate live UPI QR after merchant access
At Risk · P0 because activated live Razorpay merchant credentials, QR Codes capability, and live webhook signing secret are external prerequisites (`D-042`).

## Release and experience

### Verify backup, restore and load gates
In Progress · P0. Production Docker builds, `verify-container-smoke.mjs` (including Redis outage/recovery and fail-closed SMS refusal), and `verify-isolated-recovery.mjs` (AES-256-GCM dump/decrypt/restore + tamper rejection) pass locally; off-host backup target, retention schedule, alert webhook/on-call roster, actual-data restore RTO/RPO, load/SLO run, and staging deployment/rollback drills remain.

### Rider accessibility and low-end Android pass
Not Started · P1. Source: [rider testing and MVP gate](rider-app-architecture-and-implementation-plan.md).

### Driver accessibility and low-end Android pass
Not Started · P1. Source: [driver release gate](driver-app-architecture-and-implementation-plan.md).
