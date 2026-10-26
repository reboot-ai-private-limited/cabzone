# Cabzone Platform — Real-World Application Gap Analysis & Production Readiness Report

**Date:** October 26, 2026
**Audited Target:** Entire monorepo (`apps/api`, `apps/web`, `apps/driver-mobile`, `apps/rider-mobile`, `packages/*`) against PRD v0.1, LLD documents, and commercial ride-hailing production standards (Uber / Ola / Rapido / Namma Yatri parity).
**Methodology:** Direct AST and source code inspection across domain entities, use cases, API controllers, database models, mobile contexts, and web administration screens (without relying on graph summaries).

---

## Executive Summary & Production Readiness Score

The Cabzone platform demonstrates **exceptional core domain architecture**:
- Clean Architecture / DDD separation with explicit ports and adapters.
- Pure integer-paise financial precision and immutable pricing snapshots.
- Atomic concurrency guards in MongoDB preventing double-assignment races.
- Comprehensive unit/integration test suite (581+ passing tests).

However, evaluated strictly **as a real-world commercial production application ready to take real paying passengers and drivers on the street**, there are significant architectural, operational, and UX gaps where:
1. Features documented in the PRD or decision logs exist only as stubs, database models, or "Coming soon" placeholders.
2. Production invariants (e.g., rider payment of cancellation fees, concurrent ride restrictions, background document expiry) are unenforced in code.
3. Mobile hardware capabilities (rider push notifications, production FCM credentials, battery-efficient realtime sync) are disconnected or stubbed.

### Readiness Scorecard by Domain

| Domain | Production Readiness | Primary Blocker / Gap |
|---|:---:|---|
| **Ride Lifecycle & Concurrency** | 75% | No concurrent ride prevention; mid-trip extension has no use cases; no post-ride rating submission. |
| **Pricing & Geographic Routing** | 85% | Web Admin cannot configure outstation rate tiers; no toll/permit line items. |
| **Financials & Settlements** | 80% | Rider cancellation fees are absorbed by platform; no tax invoice / GST compliance; Razorpay test-only. |
| **Realtime, Location & Push** | 65% | Rider push is a stub (`expo-notifications-stub.js`); driver app still unconditionally polls REST every 3s. |
| **Driver Onboarding & KYC** | 70% | Manual-only verification (no Cashfree/Surepass); no document expiry worker/auto-suspension. |
| **Mobile Applications** | 70% | No SOS/safety trigger; no in-app calling/masking; no rider push notifications. |
| **Admin Operations & Control** | 60% | Nav items `/dashboard`, `/payouts`, `/refunds`, `/audit` are non-functional "Coming soon" items. |
| **Security, DevOps & SRE** | 65% | Rate limits bypass local/staging; no central audit trail; missing production FCM config. |

---

## 1. Ride Lifecycle & State Machine Gaps

### 1.1 Concurrent Active Ride Creation (Critical)
- **Documented Invariant:** PRD §5.2 and Rider App Plan §2 require that a rider may have at most one booking-blocking active ride at any time. If an active ride exists, `POST /api/v1/rides` must return `409 ACTIVE_RIDE_EXISTS`.
- **Actual Code (`apps/api/src/modules/rides/application/useCases/createRide.usecase.ts`):** There is **zero check** for existing active rides for `input.riderId`. A rider can fire multiple booking requests and have concurrent rides offering and dispatching simultaneously.

### 1.2 Mid-Trip Destination Extension (Decided in PRD, Missing in API)
- **Documented Decision (D-029 / OQ-005):** Rider can request a drop extension in-app; routing recalculates distance, pricing snapshot calculates added fare, and driver confirms.
- **Actual Code:** `RideExtensionModel` exists in MongoDB (`apps/api/src/modules/rides/infrastructure/persistence/rideExtension.model.ts`), but there are **zero use cases, controllers, routes, or mobile UI implementations** for `requestExtension` or `respondExtension`.

### 1.3 Post-Ride Rating & Review Submission
- **Documented Feature (PRD §5.7, OQ-018, OQ-019):** Both rider and driver rate each other (1–5 stars) after ride completion with double-blind visibility.
- **Actual Code:**
  - `rider.entity.ts` and `driver.entity.ts` define `ratingAverage` and `ratingCount`.
  - `trustScore.calculator.ts` contains a deterministic formula incorporating ratings.
  - **Gap:** There is **no endpoint** (`POST /v1/rides/:id/rating` or `/v1/reviews`), no review repository, and neither mobile app prompts for or submits ratings upon trip completion.

### 1.4 Uncollected Rider Cancellation Fees
- **Documented Policy (D-032 / OQ-008):** Cancellations after grace period incur ₹50 cancellation fee (₹35 driver compensation + ₹15 platform fee).
- **Actual Code (`cancelRide.usecase.ts` & `cancellationFee.service.ts`):**
  - When a rider cancels late, the server correctly credits ₹35 to the driver's prepaid wallet (`walletRepo.recordTransaction`).
  - **Gap:** The ₹50 fee is **never charged or collected from the rider**. The platform absorbs this cost as a cash drain because riders have neither a wallet nor an arrears ledger billed on the next ride.

### 1.5 Dispute Resolution Tickets
- **Documented Requirement (PRD §4.3, OQ-009):** Admin dispute resolution center.
- **Actual Code:** Disputing a cash payment transitions `status` to `PAYMENT_DISPUTED` and writes a `PAYMENT_DISPUTED` event. However, there is no standalone `Dispute` ticket entity, no admin dispute inbox/queue, and no SLA tracking.

---

## 2. Pricing & Geographic Serviceability Gaps

### 2.1 Outstation Rate Tiers in Web Admin
- **Actual Code:** The API domain (`PricingConfigEntity`) and `CreateRideUseCase` support `outstationBaseFarePaise`, `outstationRatePerKmPaise`, and `outstationMinimumFarePaise`.
- **Gap in Admin UI (`apps/web/src/features/pricing/components/PricingConfigDialog.tsx`):** The admin pricing configuration modal only exposes fields for `baseFarePaise`, `ratePerKmPaise`, and `minimumFarePaise`. Administrators cannot configure distinct outstation rate tiers through the dashboard.

### 2.2 Toll & State Permit Transparency (OQ-022)
- **Documented Requirement:** Highway tolls and inter-state permit charges must be estimated, itemized separately from distance rates, and displayed upfront.
- **Actual Code:** Neither `CreateQuoteUseCase` nor routing adapters calculate or return toll charges. Fares are purely `Base + (Distance × Rate) + Buffer`.

---

## 3. Financials, Payments & Driver Wallets

### 3.1 Razorpay Production Hardening
- **Current State:** Added Razorpay UPI test checkout and webhook signature verification (`rideUpiWebhook.controller.ts`).
- **Real-World Gaps:**
  - Automated dispute refunds for online UPI payments are explicitly blocked with a 409 error ("Online UPI disputes require manual review in Razorpay").
  - No automated daily reconciliation job comparing Razorpay settlement transfers against platform transaction ledgers.
  - Only test keys configured.

### 3.2 Formal Tax Invoicing (GST Compliance)
- **Current State:** `apps/rider-mobile` generates client-side HTML/PDF receipts.
- **Real-World Gap:** In India, commercial transport platforms must issue formal GST tax invoices with SAC code (9964), platform GSTIN, driver GSTIN (if applicable), CGST/SGST/IGST breakdown, and consecutive invoice numbering. No server-side invoice generation or PDF archival exists.

---

## 4. Realtime Infrastructure, Push & Mobile Sync

### 4.1 Rider Mobile Push Notifications are Stubbed Out
- **Critical Finding (`apps/rider-mobile/src/lib/expo-notifications-stub.js`):**
  Rider mobile replaces `expo-notifications` with a no-op stub:
  ```js
  module.exports = {
    getExpoPushTokenAsync: async () => ({ data: '' }),
    // all listeners are no-ops
  };
  ```
- **Consequence:** Riders receive **no background push notifications** when a driver accepts, arrives, or cancels. The rider only sees updates if the app remains in the foreground.

### 4.2 Driver Push FCM Configuration Missing
- **Current State (`apps/driver-mobile/app.json`):**
  Permissions and plugins for notifications are defined, but under `android`, `"googleServicesFile"` is missing. Standalone production Android builds (APK/AAB) cannot receive Firebase Cloud Messaging notifications without this file.

### 4.3 Inefficient Realtime Sync in Driver Mobile
- **Current State (`apps/driver-mobile/src/context/ride-context.tsx`):**
  WebSocket `/ws` is attached, but an unconditional `setInterval(() => refreshOffers(), 3000)` continues to poll REST every 3 seconds even while the WebSocket connection is active (`socketConnected === true`). This drains battery and creates redundant server load.

---

## 5. Driver Onboarding, Identity & KYC Gaps

### 5.1 No Third-Party KYC Integration (Cashfree / Surepass)
- **Documented PRD Goal (§2, §5.1):** Real-time automated verification of Driving License and Government ID via Cashfree or Surepass.
- **Actual Code:** Applications are strictly manual. Documents are uploaded to Cloudinary, and human admins must inspect thumbnails in `DocumentPreviewDialog.tsx` to approve or reject.

### 5.2 Missing Document Expiry Worker & Automatic Suspension (OQ-013)
- **Documented Policy:** Warn driver 30 days before document expiry; automatically suspend driver on the day of expiry.
- **Actual Code:** `server.ts` runs sweeps for offer expiry and push receipts, but **no scheduled job** checks for expired DLs, insurance, permits, or fitness certificates. A driver whose license expired yesterday remains `ACTIVE` and eligible for dispatches until an admin manually notices.

### 5.3 Vehicle Document Model Separation (OQ-021)
- Vehicle registration (`RC`), insurance, and permit are stored under `DriverDocument` rather than being bound to the `Vehicle` entity. If a driver changes vehicles, their vehicle documents remain coupled to their application record.

---

## 6. Mobile Application Features (Rider & Driver)

### 6.1 Safety / SOS & Emergency Features (PRD §9)
- Neither the Rider app nor the Driver app has an SOS button, emergency contact alert dispatch, or live trip sharing via SMS/WhatsApp deep link.

### 6.2 Driver Navigation & In-App Communication
- **Driver Navigation:** Does not offer embedded navigation or turn-by-turn routing; relies on triggering external map intents.
- **Calling / Chat:** No masked calling (e.g. Exotel / Twilio) or in-app chat. Drivers and riders only have direct phone numbers.

---

## 7. Web Admin Operations & Control Plane

### 7.1 "Coming Soon" Placeholders in Core Navigation
Several critical operational navigation items in `apps/web/src/components/nav-items.ts` are disabled:
- `/dashboard` (Executive KPI overview)
- `/payouts` (Automated bank transfers for driver cashouts)
- `/refunds` (Refund management interface)
- `/audit` (System-wide immutable audit trail viewer)
- `/settings` (Platform-wide global settings)
- `/health` (Real-time cluster health dashboard)

### 7.2 Role-Based Access Control (RBAC) (OQ-025)
- All admin users operate with flat super-admin powers; granular permissions for `CITY_ADMIN`, `SUPPORT_AGENT`, and `FINANCE_ADMIN` are drafted in `RolePermissionsMatrixModal.tsx` but not enforced across all API routes.

---

## 8. Prioritized Roadmap for Production Launch

```
Phase 1: Critical Invariants & Financial Safety (Immediate)
├── 1. Add Single Active Ride Guard in CreateRideUseCase (prevent duplicate bookings)
├── 2. Wire Rider Cancellation Fee Arrears (charge rider on next booking)
├── 3. Wire Rider Push Notifications (replace stub with real expo-notifications)
└── 4. Stop unconditional 3s driver polling when WebSocket is connected

Phase 2: Operational Parity & Missing Endpoints (Next Sprint)
├── 5. Implement Post-Ride Rating & Review API + Mobile Screens
├── 6. Add Document Expiry Cron Sweep (auto-suspend expired DL/insurance)
├── 7. Expose Outstation Rate Tiers in Web Admin Pricing Dialog
└── 8. Build Admin Payouts / Cashout Approval screen (/payouts)

Phase 3: Real-World Launch Hardening (Pre-Launch)
├── 9. Add Android google-services.json for production FCM
├── 10. Implement SOS / Share Trip Emergency Sheet
├── 11. Implement Mid-Trip Destination Extension Use Cases
└── 12. Integrate Automated Third-Party KYC Verification (Surepass/Cashfree)
```
