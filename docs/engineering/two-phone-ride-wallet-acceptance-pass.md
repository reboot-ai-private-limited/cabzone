# Two-Phone Ride & Wallet Acceptance Pass (Step 7)

Reference: [`docs/engineering/devtostagestate.md`](devtostagestate.md) §7, [`rider-app-architecture-and-implementation-plan.md`](rider-app-architecture-and-implementation-plan.md) §18, [`driver-app-architecture-and-implementation-plan.md`](driver-app-architecture-and-implementation-plan.md) §22.

> **Verification Boundary:**
> - **Automated Multi-Actor Acceptance Suite (Executed & Passing):** Exercises Rider Phone + Driver Phone + Admin Finance/Support over real Express HTTP routes, WebSocket `RealtimeHub`, payment-only QR `#ticket` generation/scanning, Razorpay test-mode proof/webhook reconciliation, wallet recharge/cashout buckets, cold-start relaunch hydration, and out-of-order `version` guards.
> - **Physical Two-Phone Pass (Hardware Sign-Off Required):** Must be executed on two real devices on a shared LAN/tunnel before staging promotion. **Razorpay `test` mode (`RAZORPAY_MODE=test`) opens browser/WebView test checkout (`success@razorpay` / `failure@razorpay`) and does NOT demonstrate real UPI app handoff (`upi://pay` into GPay/PhonePe/Paytm)**; real UPI app handoff requires live merchant QR credentials (`RAZORPAY_MODE=live`).

---

## 1. Defects Uncovered & Fixed During Pass

| ID | Area | Defect | Root-Cause Fix |
| :--- | :--- | :--- | :--- |
| **D1** | Rider Mobile Bootstrap | Cold-start `isLoadingRides` initialized `false` while `refreshRides()` ran inside `setTimeout(..., 0)`, causing `BootstrapIndexScreen` to redirect to `/(rider)/(tabs)/home` before active ride hydration completed. `ACTIVE_RIDE_STATUSES` also omitted `PAYMENT_CONFIRMED`. | Track `hydratedToken` in [`apps/rider-mobile/src/context/ride-context.tsx`](../../apps/rider-mobile/src/context/ride-context.tsx) so `isLoadingRides` stays `true` until initial `refreshRides()` settles for `token`; added `PAYMENT_CONFIRMED` in [`rider-helpers.ts`](../../apps/rider-mobile/src/services/rider-helpers.ts). |
| **D2** | Rider Active Ride Screen | When a ride transitioned to `CANCELLED`, `SETTLED`, or `EXPIRED` via WebSocket, `RideProvider` cleared `activeRide` and `ActiveRideScreen` froze on `OngoingRideView`. Also showed "Report Payment Issue" outside `SETTLED`. | Sync terminal transitions from `rideHistory` in [`apps/rider-mobile/src/app/(rider)/ride/[rideId].tsx`](../../apps/rider-mobile/src/app/(rider)/ride/[rideId].tsx) and restrict dispute CTA to `ride.status === 'SETTLED'`. |
| **D3** | Rider & Driver Out-of-Order Sync | Concurrent REST polls or duplicate/reordered WS triggers with an older `ride.version` could overwrite a newer status or resurrect a cancelled/settled ride. | Track `maxVersionByRideRef` per `rideId` in both [`apps/rider-mobile/src/context/ride-context.tsx`](../../apps/rider-mobile/src/context/ride-context.tsx) and [`apps/driver-mobile/src/context/ride-context.tsx`](../../apps/driver-mobile/src/context/ride-context.tsx). |
| **D4** | Driver Cold-Start & Terminal Flash | `isCheckingActiveRide` started `false` before `useEffect` ran; `ActiveRideScreen` flashed "Ride Not Found" for one render when `activeRide` cleared on Rider cancel or UPI settle; `PAYMENT_CONFIRMED` & `TRIP_COMPLETED` QR states were incomplete. | Hold `isCheckingActiveRide` `true` via `checkedRideToken` until `listMyRides` settles; seed & sync `fetchedRide` in [`apps/driver-mobile/src/app/(driver)/ride/[rideId].tsx`](../../apps/driver-mobile/src/app/(driver)/ride/[rideId].tsx); include `PAYMENT_CONFIRMED` in `ACTIVE_RIDE_STATUSES` and mount `<RidePaymentQr>` on `TRIP_COMPLETED`. |
| **D5** | Driver Mid-Trip KYC Restriction | If a driver's KYC expired or became restricted mid-trip (`!isKycVerified`), `IndexGateScreen`, `DriverGroupLayout`, and `RideProvider` blocked active ride hydration and WebSocket sync, stranding the in-progress/unpaid ride. | Always check `listMyRides` when authenticated, route `activeRide` before KYC gates in [`apps/driver-mobile/src/app/index.tsx`](../../apps/driver-mobile/src/app/index.tsx) and [`_layout.tsx`](../../apps/driver-mobile/src/app/(driver)/_layout.tsx), and keep WS connected while `activeRide` exists. |
| **D6** | API Dispatch & Late-UPI WS | Drivers in `TRIP_COMPLETED` / `PAYMENT_PENDING` / `PAYMENT_CONFIRMED` could still receive offers or claim/counter a second ride; `rideUpiPayment.controller.ts` & `ridePaymentQr.controller.ts` omitted `ride.payment.disputed` WS fan-out when late UPI capture followed cash settlement. | Added `DRIVER_BUSY_RIDE_STATUSES` in [`driverOfferEligibility.ts`](../../apps/api/src/modules/dispatch/application/useCases/driverOfferEligibility.ts), `ensureDriverCanClaim` in [`acceptRide.usecase.ts`](../../apps/api/src/modules/rides/application/useCases/acceptRide.usecase.ts) & [`negotiateFare.usecase.ts`](../../apps/api/src/modules/rides/application/useCases/negotiateFare.usecase.ts), and `ride.payment.disputed` fan-out in both payment controllers. |

---

## 2. Automated Multi-Actor Acceptance Results

Executed in [`apps/api/test/two-phone-acceptance.test.ts`](../../apps/api/test/two-phone-acceptance.test.ts), [`apps/rider-mobile/src/context/ride-context.test.mjs`](../../apps/rider-mobile/src/context/ride-context.test.mjs), and [`apps/driver-mobile/src/context/ride-context.test.mjs`](../../apps/driver-mobile/src/context/ride-context.test.mjs):

- **Booking $\rightarrow$ Counter $\rightarrow$ OTP $\rightarrow$ Live GPS $\rightarrow$ QR/UPI Test Checkout $\rightarrow$ Settlement (`PASS`):**
  - Quote $\rightarrow$ `OFFERING` $\rightarrow$ Driver WS `ride.offer.created` $\rightarrow$ Driver `201` counter $\rightarrow$ Rider WS `ride.fare.countered` & accept $\rightarrow$ `DRIVER_ASSIGNED` (`pickupOtp` delivered only to Rider HTTP/WS, redacted from Driver HTTP/WS) $\rightarrow$ `DRIVER_EN_ROUTE` $\rightarrow$ live `driver.location.updated` $\rightarrow$ `DRIVER_ARRIVED` $\rightarrow$ wrong OTP `400`, valid OTP `TRIP_STARTED` $\rightarrow$ `PAYMENT_PENDING` (busy driver blocked `409 DRIVER_BUSY` from 2nd ride).
  - Driver QR (`POST /rides/:id/payment/upi/qr`) and Rider session (`POST /rides/:id/payment/upi/session`) share one `orderId`. Forged proof rejected; uncaptured proof stays `paid: false`; concurrent QR verify + Rider verify + signed `payment.captured` webhook settle once (`SETTLED`, single `ONLINE_RIDE_EARNINGS` credit net of 8% commission, ₹0 prepaid debit).
- **Payment Switching (`UPI` $\rightarrow$ `CASH`) & Late-Capture Dispute (`PASS`):**
  - `confirmPayment` blocked `409` while UPI active; `POST /rides/:id/payment/cash` emits `ride.payment.method.changed`, revokes old `#ticket` session (`409`), hides Driver QR image, settles `CASH` once on Driver confirmation with one `RIDE_COMMISSION` debit, and transitions to `PAYMENT_DISPUTED` (with `ride.payment.disputed` WS to both phones and ₹0 duplicate credit) if late UPI capture arrives afterward.
- **Cancellations (`PASS`):**
  - Unassigned `OFFERING` rider cancel (`₹0` fee, `ride.cancelled` clears Driver offer, idempotent retry); early `<5m` `RIDER_NO_SHOW` rejected (`400`); `>=5m` curb wait `RIDER_NO_SHOW` cancels ride, notifies Rider WS, and credits `CANCELLATION_COMPENSATION` (`₹35`) once across retries.
- **Wallet Recharge & Cashout Recovery (`PASS`):**
  - Interrupted recharge creation persists operation, resumes via `/me/recharges/:id/status`, and credits `commissionBalancePaise` once across concurrent public/authenticated status polls. Cashout reserves `earningsBalancePaise` first then `commissionBalancePaise`, blocks concurrent cashout (`409`), restores buckets once on `REJECTED` (+ retry), and settles `PAID` (+ retry) without double debit.
- **Relaunch & Out-of-Order Events (`PASS`):**
  - Verified REST hydration consistency across `OFFERING`, `DRIVER_ASSIGNED`, `DRIVER_EN_ROUTE`, `DRIVER_ARRIVED`, `TRIP_STARTED` (including mid-trip restricted driver), `PAYMENT_PENDING`, `PAYMENT_CONFIRMED`, `SETTLED`, `PAYMENT_DISPUTED`, and `CANCELLED`, plus client drop of stale lower-`version` responses.

---

## 3. Physical Two-Phone Live Execution Runbook & Sign-Off Checklist

### Prerequisites
1. Connect Laptop + **Phone A (Rider)** + **Phone B (Driver)** to the same Wi-Fi LAN (or expose API via HTTPS tunnel).
2. In `apps/api/.env`, set `RAZORPAY_MODE=test`, `RAZORPAY_KEY_ID=rzp_test_...`, `RAZORPAY_KEY_SECRET=...`, `RAZORPAY_WEBHOOK_SECRET=...`, and include the LAN origin in `CORS_ORIGINS`.
3. In both `apps/rider-mobile/.env` and `apps/driver-mobile/.env`, set `EXPO_PUBLIC_API_URL=http://<LAN_IP>:4000` (never `localhost` on physical phones).
4. Start backend (`pnpm --filter @cabzone/api dev`), Admin Web (`pnpm --filter @cabzone/web dev`), Rider app, and Driver app. Ensure Driver has an approved KYC profile, active vehicle, and `>= ₹250` wallet balance.

### Device Sign-Off Matrix (Record Pass / Fail + Device OS + Commit SHA)

- [ ] **1. Booking, Counter & OTP Handoff:** Driver goes `ONLINE`; Rider books in-city ride; Driver receives offer without manual refresh, counters `+₹10`; Rider accepts counter; verify Rider sees 4-digit OTP and Driver does not; force-close & relaunch **both** apps at `OFFERING`, `DRIVER_ASSIGNED`, `DRIVER_EN_ROUTE`, `DRIVER_ARRIVED`, and `TRIP_STARTED`.
- [ ] **2. QR Camera Scan & Test Checkout (`RAZORPAY_MODE=test`):** Driver completes trip (`PAYMENT_PENDING`) and displays QR; Rider scans QR with phone camera (opens `/api/v1/rides/payment/upi/checkout#<ticket>`); first submit `failure@razorpay` (verify ride stays `PAYMENT_PENDING` and retry remains enabled); then submit `success@razorpay` (verify both phones settle automatically and Driver wallet `earningsBalancePaise` increases by net fare once).
- [ ] **3. Switch to Cash & Double-Tap Idempotency:** Complete a second ride $\rightarrow$ open UPI checkout $\rightarrow$ tap **Pay Cash Instead** on Rider phone $\rightarrow$ verify Driver QR closes immediately $\rightarrow$ double-tap **Confirm Cash Received** on Driver phone $\rightarrow$ verify single `RIDE_COMMISSION` debit.
- [ ] **4. Cancellations:** Verify (a) Rider cancel during `OFFERING` (`₹0` fee, offer disappears on Driver phone immediately) and (b) Rider cancel after Driver arrival (Driver screen transitions cleanly to `CANCELLED` without flashing "Ride Not Found", compensation credited once).
- [ ] **5. Wallet Recharge & Cashout Recovery:** On Driver Wallet tab, start a `₹100` test recharge, close browser mid-checkout, tap **Check Status** (stays pending), complete with `success@razorpay` (credits once); submit cashout to UPI ID $\rightarrow$ reject in Admin Web Finance (balance restored) $\rightarrow$ submit again & mark `PAID` with UTR in Admin Web.
- [ ] **6. Live UPI App Handoff Gate (Staging Blocker Note):** Once live Razorpay QR credentials (`RAZORPAY_MODE=live`, `rzp_live_...`) are provisioned, repeat Check #2 to verify `upi://pay` deep-link handoff into GPay / PhonePe / Paytm and live `qr_code.credited` / `payment.captured` webhook settlement.
