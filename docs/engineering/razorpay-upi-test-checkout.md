# Customer ride fares: Razorpay UPI test checkout

This is a test-only alternative to direct driver collection. It is disabled in production and accepts only `rzp_test_` keys. No driver recharge, live collection, refund automation or payout transfer is implemented.

Backend credentials live in the ignored root `.env` as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. Restart the API after changing them. Never put the secret in an `EXPO_PUBLIC_` variable or a mobile checkout response.

## Flow

1. The driver completes the ride, leaving it `PAYMENT_PENDING`.
2. The booking customer taps **Pay by UPI**. The server creates an INR order for the frozen agreed fare and stores its ID in the ride audit log before returning checkout options. Reopening checkout reuses that order.
3. The existing WebView opens Standard Checkout, configured to show UPI only. No new native module is required for this test screen.
4. Success proof is verified using HMAC-SHA256 of the stored order ID and returned payment ID. The backend also fetches the order's payments and requires an exact amount, INR, UPI and `captured` status. A client success message alone never settles a ride.
5. **Check payment status**, reopening the payment panel and foregrounding the app recover payments from the provider, including when the checkout callback was lost. This test integration uses authenticated provider polling, not webhooks; background settlement requires the app to check again.
6. Ride settlement and audit entries are transactional. A `DRIVER_PAYOUT_PENDING` event records gross fare, commission and net payable, all labelled `mode: test`. This is an audit liability record, not a spendable wallet credit or an actual payout. The driver's prepaid commission wallet is unchanged.

Once an online order has been exposed, direct cash/personal-UPI confirmation is blocked for that ride, including after an unsuccessful checkout. The driver detail screen shows the online collection state on its next refresh. A new order increments the ride version so it cannot race successfully with direct cash settlement.

Existing direct-payment rides retain their original settlement path. Online test disputes can be filed, but automated resolution/refunds are blocked for manual review rather than falsely crediting a commission that was never debited.

## API

### Driver QR and waiting-state recovery

After completion, the driver can **Show payment QR**, **Refresh QR**, or **Check payment status**. Status is also checked every five seconds while the screen is active and when the app returns to the foreground. Confirmed payment refreshes the driver ride screen. Home remains available while a ride awaits payment.

This QR encodes a browser checkout URL for the **same saved Razorpay order**, including when customer checkout was already opened. It creates no separate QR payment rail and cannot charge that order twice. Scan with the phone camera; GPay/PhonePe UPI QR scanning is unavailable with Razorpay test keys. Razorpay's [QR FAQ](https://razorpay.com/docs/payments/qr-codes/faqs) confirms native UPI QR scanning requires Live Mode.

The URL fragment contains a 30-minute payment-only ticket signed with a separately derived key. It grants access to that ride's checkout and payment verification only; it is not an account session. The ticket is sent to the backend in POST bodies, never query strings. Expired/tampered tickets are rejected. Public checkout uses a scoped CSP and never exposes the key secret. Both phones must be able to reach the API origin used by the driver.

Driver routes: `POST /api/v1/rides/:id/payment/upi/qr` and `GET /api/v1/rides/:id/payment/upi/driver-status`, restricted to the assigned driver. Browser entry: `GET /api/v1/rides/payment/upi/checkout`, with payment-only `session`, `verify`, and `status` POST subroutes.

The customer-app routes below require a rider JWT and ownership by `bookerRiderId`; browser checkout instead requires the scoped QR ticket.

| Method | Route | Result |
| --- | --- | --- |
| POST | `/api/v1/rides/:id/payment/upi` | `{keyId, orderId, amountPaise, currency, testMode}` |
| POST | `/api/v1/rides/:id/payment/upi/verify` | `{paid}`; body `{orderId, paymentId, signature}` |
| GET | `/api/v1/rides/:id/payment/upi/status` | `{paid}` after server-side reconciliation |

Ride detail includes optional `paymentCollection: DIRECT | RAZORPAY_TEST` for the driver UI. Gateway order, verification and payout audit entries appear in the existing ride event trail.

## Test on a phone

Enable automatic payment capture in the Razorpay test dashboard. Complete a test ride and open the customer's payment screen. In test UPI checkout, use `success@razorpay` or `failure@razorpay`. Confirm that failure leaves payment pending, success settles once, and closing/reopening after success recovers the payment. Check that the driver is not asked to collect again and their prepaid wallet remains unchanged.

Razorpay documents simulated UPI testing separately from real UPI Intent/QR app handoff, which requires live-mode testing. This integration does not enable live mode.

Sources: [React Native testing guidance](https://razorpay.com/docs/payments/payment-gateway/react-native-integration/standard/integration-steps-android), [server-side signature and status verification](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/).
