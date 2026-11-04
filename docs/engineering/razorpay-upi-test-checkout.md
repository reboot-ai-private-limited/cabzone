# Customer ride fares: UPI app handoff, driver QR, and test checkout

For the driver's full-screen, 15-minute QR collection flow, see [Driver UPI QR collection](driver-upi-qr-collection.md). The legacy rider app handoff/browser checkout below retains its own contracts.

The default `RAZORPAY_MODE=test` keeps the existing simulated checkout and browser QR; test checkout is disabled in production. An explicitly configured `RAZORPAY_MODE=live` with matching live credentials uses one single-use, fixed-fare Razorpay QR session for both rider app handoff and driver QR scanning. Driver wallet recharge (`₹500`–`₹1,00,000`), manual Finance/Super Admin cashout review (`wallet_operations`), optional RazorpayX payouts, signed live QR webhooks, and verified provider-refund dispute reversal (`D-041` / `D-044`) are implemented. Live credentials and a funded RazorpayX account must be configured separately in each deployed environment.

Backend credentials live in the ignored root `.env` as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. Restart the API after changing them. Never put the secret in an `EXPO_PUBLIC_` variable or a mobile checkout response.

## Test flow

1. The driver completes the ride, leaving it `PAYMENT_PENDING`.
2. The booking customer taps **Pay by UPI**. The server creates an INR order for the frozen agreed fare and stores its ID in the ride audit log before returning checkout options. Reopening checkout reuses that order.
3. The existing WebView opens Standard Checkout, configured to show UPI only. No new native module is required for this test screen.
4. Success proof is verified using HMAC-SHA256 of the stored order ID and returned payment ID. The backend also fetches the order's payments and requires an exact amount, INR, UPI and `captured` status. A client success message alone never settles a ride.
5. **Check payment status**, reopening the payment panel and foregrounding the app recover payments from the provider, including when the checkout callback was lost. This test integration uses authenticated provider polling, not webhooks; background settlement requires the app to check again.
6. Ride settlement and audit entries are transactional. Newly reconciled online UPI settlements credit the driver's wallet net of ride commission (`agreedFarePaise - commissionPaise`, `ONLINE_RIDE_EARNINGS`), settle any attached rider cancellation arrears (`arrearsPaise`, `D-044`) without charging commission on arrears, and record audit events labelled with the active provider mode (`test` or `live`). Keep test-funded wallets out of the live database until Finance reconciles them; the wallet schema does not enforce fund provenance.

Once an online order has been exposed, direct cash/personal-UPI confirmation is blocked until an authenticated cash switch is recorded. A new order and a payment-method switch each increment the ride version so they cannot race successfully with settlement. Existing checkout tickets cannot open a new payment after cash selection.

Existing direct-payment rides retain their original settlement path. Online test disputes can be filed, but automated resolution/refunds are blocked for manual review rather than falsely crediting a commission that was never debited.

## API

### Driver QR and waiting-state recovery

After completion, the driver can **Show payment QR**, **Refresh QR**, or **Check payment status**. Status is also checked every five seconds while the screen is active and when the app returns to the foreground. Confirmed payment refreshes the driver ride screen. Home remains available while a ride awaits payment.

This QR encodes a browser checkout URL for the **same saved Razorpay order**, including when customer checkout was already opened. It creates no separate QR payment rail and cannot charge that order twice. Scan with the phone camera; GPay/PhonePe UPI QR scanning is unavailable with Razorpay test keys. Razorpay's [QR FAQ](https://razorpay.com/docs/payments/qr-codes/faqs) confirms native UPI QR scanning requires Live Mode.

The URL fragment contains a 30-minute payment-only ticket signed with a separately derived key. It grants access to that ride's checkout and payment verification only; it is not an account session. The ticket is sent to the backend in POST bodies, never query strings. Expired/tampered tickets are rejected. Public checkout uses a scoped CSP and never exposes the key secret. Both phones must be able to reach the API origin used by the driver.

Driver routes: `POST /api/v1/rides/:id/payment/upi/qr` and `GET /api/v1/rides/:id/payment/upi/driver-status`, restricted to the assigned driver. Browser entry: `GET /api/v1/rides/payment/upi/checkout`, with payment-only `session`, `verify`, and `status` POST subroutes.

The customer-app routes below require a rider JWT and ownership by `bookerRiderId`; browser checkout instead requires the scoped QR ticket.

| Method | Route                                  | Result                                              |
| ------ | -------------------------------------- | --------------------------------------------------- |
| POST   | `/api/v1/rides/:id/payment/upi`        | `{keyId, orderId, amountPaise, currency, testMode}` |
| POST   | `/api/v1/rides/:id/payment/upi/verify` | `{paid}`; body `{orderId, paymentId, signature}`    |
| GET    | `/api/v1/rides/:id/payment/upi/status` | `{paid}` after server-side reconciliation           |

Ride detail includes optional `paymentCollection: DIRECT | RAZORPAY_TEST | RAZORPAY_UPI` for the driver UI. Gateway creation, verification and payout audit entries appear in the existing ride event trail.

## Test on a phone

Enable **UPI** (`collect` and `intent` under **Account & Settings → Payment Methods**) and automatic payment capture in the Razorpay Test Dashboard (if UPI is disabled on the test merchant account, Standard Checkout renders `"No appropriate payment method found"` because Cabzone restricts checkout to UPI instruments). Complete a test ride and open the customer's payment screen. In test UPI checkout, use `success@razorpay` or `failure@razorpay`. Confirm that failure leaves payment pending, success settles once, and closing/reopening after success recovers the payment. Check that the driver is not asked to collect again and their prepaid wallet remains unchanged.

Razorpay documents simulated UPI testing separately from real UPI Intent/QR app handoff, which requires live-mode testing. Existing test keys remain unchanged.

## Live UPI session and account setup

### Stage and production wallet rollout

The root `.env` is local to the development process; it does not configure a deployed API or a compiled mobile app. Set `RAZORPAY_MODE=live`, the matching live `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` in **each deployed API environment**, then restart that API. Register the public HTTPS `POST /api/v1/driver/wallet/webhook` endpoint for wallet recharge and payout notifications. The ride UPI QR webhook below is a separate endpoint. Check the deployed checkout page or API response for `testMode: false` before a real-money acceptance pass.

Set `EXPO_PUBLIC_API_URL` to that environment's public HTTPS API origin in the Expo Build environment for **both** rider and driver apps and rebuild them. Production builds now fail if this value is missing or uses HTTP. Expo embeds `EXPO_PUBLIC_` values in the app bundle; changing the backend `.env` cannot update an already installed app. See [Expo's build environment guidance](https://docs.expo.dev/eas/environment-variables/usage/).

Cashout reserves the driver's earnings and prepaid wallet balances. Without `RAZORPAYX_ACCOUNT_NUMBER` and a configured payout gateway, a cashout remains pending for Finance to resolve manually; the Razorpay payment key and webhook alone do not send a bank transfer. Verify the payout account, funding, destination and webhook in the target environment before enabling automatic cashout. Keep test-funded wallets out of a live deployment until Finance has reconciled or migrated them.

1. Activate the Razorpay merchant account and request QR Codes access. Configure backend-only `RAZORPAY_MODE=live`, matching `rzp_live_` credentials, and a separate `RAZORPAY_WEBHOOK_SECRET`. Never change modes while test rides await payment: existing sessions intentionally cannot migrate between modes.
2. Register the public HTTPS endpoint `POST /api/v1/rides/payment/upi/webhook` for `qr_code.credited`, using the same webhook signing secret. Raw-body HMAC verification runs before parsing payment scope. A signed notification only triggers provider reconciliation; event amounts or client return values never settle a ride.
3. Rider `POST /api/v1/rides/:id/payment/upi/session` returns either `{kind: 'checkout', checkout}` in test mode or `{kind: 'intent', qrId, upiUrl, imageDataUrl, amountPaise, expiresAt, testMode: false}` in live mode. Both rider and driver reuse the saved `UPI_QR_CREATED` session. No separate payable order is created for the other app.
4. Android opens the provider `upi://pay` link through the installed UPI app handler/chooser. iOS opens Google Pay using its documented `gpay://upi/pay` scheme; other iOS UPI apps can scan the driver's QR. Missing apps or cancelled launches leave a retryable pending state. No native dependency or rebuild is needed for Android handoff in Expo Go.
5. Driver QR encodes that exact provider UPI link. GPay/PhonePe and other UPI scanners use the same reference, merchant, and fare. Five-second foreground checks, app-resume checks, and signed webhooks reconcile against the saved QR's provider payment collection. Only exact-fare, INR, captured, non-refunded UPI payments settle the ride. Duplicate notifications cannot create another settlement/payable event.
6. The prepaid commission wallet remains unchanged. `DRIVER_PAYOUT_PENDING` records the live net amount owed; it does not transfer money to the driver's bank. Configure and verify merchant settlement/driver payout operations separately before rollout.

The QR expires after 30 minutes. An expired QR remains linked for reconciliation and cannot silently become a second payable QR. The rider/driver can check status or switch to cash; automatic QR rotation requires explicit late-payment handling.

## Change payment to cash

Both apps show **Change payment → Switch to cash** while payment is pending. The booking rider or assigned driver can call `POST /api/v1/rides/:id/payment/cash`. Switching changes the collection method only: it never confirms payment. The rider waits for confirmation; the driver sees **Cash received**, followed by a separate confirmation sheet naming the fare.

The server reconciles online payment first. A captured payment settles as UPI instead of switching. In live mode, it closes the provider QR and rejects switching if provider payment attempts are still processing or already received. If closing or reconciliation fails, it does not authorize cash. The QR disappears in both apps, including after reopening them. Pending state responses include `{paid, method, testMode, requiresReview}`.

Driver `POST /api/v1/rides/:id/payment/confirm` rechecks online capture before confirming cash, then uses the existing transactional commission debit and settlement path. The receipt records `method: CASH`. The cash switch is one-way for this ride; online checkout stays disabled. In test mode, previously opened provider orders cannot be remotely cancelled, but local checkout access is revoked and those orders cannot charge real money. A rare late capture after confirmed cash creates a payment dispute for refund review, not another driver payable. Refunds are not automatic.

Test credentials deliberately do not open real GPay/PhonePe payments. The rider button is labelled **Open UPI test checkout** after payment options load; the message explains the limitation and offers cash. Real app handoff needs activated live credentials and QR Codes access. See the provider's [test QR limitation](https://razorpay.com/docs/payments/qr-codes/faqs/) and [QR closure API](https://razorpay.com/docs/api/qr-codes/close/).

Production acceptance still needs real device tests (Android chooser, iOS Google Pay, failed/cancelled handoff, webhook retries, exact-once settlement) after QR access is enabled. Provider requests and tests in this change do not charge money.

Provider references: [QR creation](https://razorpay.com/docs/api/qr-codes/create/), [QR payment lookup](https://razorpay.com/docs/api/qr-codes/fetch-payments/), [QR credit webhooks](https://razorpay.com/docs/webhooks/qr-codes/), [Google Pay iOS handoff](https://developers.google.com/pay/india/api/ios/in-app-payments).

Sources: [React Native testing guidance](https://razorpay.com/docs/payments/payment-gateway/react-native-integration/standard/integration-steps-android), [server-side signature and status verification](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/).
