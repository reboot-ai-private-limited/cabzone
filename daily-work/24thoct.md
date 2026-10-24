# Daily Work Log - Cabzone Platform

**Date:** October 24, 2026
**Branch:** `feature/live-ride-driver-rider-polish`

## Work completed

### Native UPI QR, Razorpay webhooks, and driver wallet money movement

- Added native UPI QR generation (`upi_qr`) and UPI deep-link intent helpers (`upi-intent.ts`) alongside browser checkout fallback for customer ride payments (`upi-payment-panel.tsx`) and driver payment QR screens (`ride-payment-qr.tsx`).
- Added Razorpay webhook signature verification and idempotent settlement handling (`rideUpiWebhook.controller.ts`, `rawBody.ts`) so captured UPI payments settle rides automatically even if the mobile client disconnects.
- Implemented end-to-end driver wallet money movement (`walletMoney.usecase.ts`, `walletOperation.repository.ts`, `walletRechargeTickets.ts`, `walletMoney.controller.ts`, `walletRecharge.html.ts`):
  - Prepaid wallet recharge via Razorpay UPI checkout and signed browser recharge tickets.
  - Driver payout/cashout request creation, balance reservation, and admin settlement/rejection workflow (`CashoutQueue.tsx`, `FinanceScreen.tsx`).
  - Documented the architecture and flows in `docs/engineering/driver-wallet-money-movement.md`.

### Expo SDK 58 upgrade and mobile auth screen animations

- Upgraded `@cabzone/driver-mobile` and `@cabzone/rider-mobile` to **Expo SDK 58 (`~58.0.19`)**, `react@19.3.0`, and `react-native@0.88.0`, aligning workspace React type definitions (`pnpm-workspace.yaml`, `apps/web/package.json`).
- Updated React Native 0.88 / TypeScript 6 component ref types (`TextInput`, `WebView`, and tab bar `ColorValue` narrowing) across both mobile apps.
- Added smooth staggered entrance and exit ("animation out") transitions across the authentication flow in both mobile apps:
  - Rider mobile: `welcome.tsx`, `phone.tsx`, `otp.tsx`, `welcome-hero.tsx`, and `(auth)/_layout.tsx`.
  - Driver mobile: `entry-step.tsx`, `signup-step.tsx`, `otp-step.tsx`, `login-form-layer.tsx`, and `(auth)/_layout.tsx`.

### Web Admin drivers directory, suspension workflow, and original KYC document viewer

- Refined `/drivers` (`DriversScreen.tsx`):
  - Made **Verified Drivers** the default tab and simplified tab labels to **Verified Drivers** and **Requests / Pending**.
  - Updated directory columns (`SL`, `Driver` with initials avatar + name + DL number, `Mobile`, `Joined Date ↓`, `Address`, `License Expiry`, `Last Ride` / `Vehicle`, `Rating`, `Status`, `Action`) while preserving KPI summary tiles and search.
  - Scoped **Requests / Pending** strictly to pending/reviewable applications and hid redundant status/vehicle filter dropdowns on that tab.
- Implemented end-to-end **Suspend / Activate Driver** (`PATCH /v1/admin/driver-applications/:id/status`, `UpdateDriverStatusUseCase`):
  - Suspending a driver sets `driver.status = 'SUSPENDED'` and automatically transitions `operationalStatus` to `'OFFLINE'` so they cannot receive dispatches or go online.
  - Wired confirmation dialogs and status toggles in `DriverDetailsScreen.tsx` and `DriverDetailModal.tsx`.
- Replaced the static simulated document card in `DocumentPreviewDialog.tsx` with the **actual original uploaded KYC documents**:
  - Added `CloudinaryDriverLicenseAdapter.resolveUrl(storageKey)` to generate signed Cloudinary delivery URLs for authenticated KYC uploads (`DRIVING_LICENSE`, `GOVERNMENT_ID`, `REGISTRATION_CERTIFICATE`, `INSURANCE`, `PERMIT`).
  - Attached `fileUrl` to admin application detail responses (`GetDriverApplicationDetailUseCase`, `UpdateDriverStatusUseCase`).
  - Added inline document image thumbnails, zoom/rotate inspection, embedded PDF viewing, and direct **Open Original** links in `DocumentPreviewDialog.tsx`, `DocumentViewerCard.tsx`, and `DriverDetailsScreen.tsx`.

## Verification

- **API (`@cabzone/api`)**: TypeScript (`tsc --noEmit`) and unit/integration tests for wallet money movement, UPI webhooks, and driver application management passed.
- **Web Admin (`@cabzone/web`)**: TypeScript (`tsc --noEmit`) passed with 0 errors; Vitest suite passed (`43/43` tests across 8 files).
- **Driver Mobile (`@cabzone/driver-mobile`)**: TypeScript (`tsc --noEmit`) passed with 0 errors; Node UI tests (`auth-ui.test.mjs`, `ride-payment-qr.test.mjs`, `wallet-money.test.mjs`) passed.
- **Rider Mobile (`@cabzone/rider-mobile`)**: TypeScript (`tsc --noEmit`) passed with 0 errors; Node test suite passed (`36/36` tests).
