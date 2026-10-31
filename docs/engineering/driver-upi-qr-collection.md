# Driver UPI QR collection

The driver’s **Collect payment** button opens a white full-screen QR sheet for a ride in `PAYMENT_PENDING`. The amount comes from the agreed/proposed/suggested fare plus cancellation arrears on the server. Completing payment settles the ride and credits net fare earnings through the existing ledger; it does not transfer money to the driver’s bank.

## Configuration

Set backend-only `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and a separate `RAZORPAY_WEBHOOK_SECRET`. The existing `.env.example` documents these names. Both API keys select the Razorpay gateway; without them development/tests use `MockQrPaymentGateway`. Production rejects mock QR creation. Never expose these secrets in Expo environment variables.

Enable UPI QR on the merchant account and register public HTTPS `POST /api/v1/rides/payment/upi/webhook` for **both** `qr_code.credited` and `qr_code.closed`. Real scans require an activated live account with QR access. See [Razorpay QR creation](https://razorpay.com/docs/api/qr-codes/create/) and [QR webhooks](https://razorpay.com/docs/webhooks/qr-codes/).

## API and persistence

Assigned-driver JWT required:

| Method | Route | Behavior |
| --- | --- | --- |
| POST | `/api/v1/rides/:id/payment-qr` | Create or reuse the current fixed-amount QR |
| GET | `/api/v1/rides/:id/payment-qr` | Reconcile and return status |

Both return Cabzone’s normal success envelope containing `{ ride, qr: { state, upiUri, imageUrl, expiresAt, amountPaise, lines } }`. Amounts, including line amounts, are integer paise. States are `NONE`, `PENDING`, `PAID`, and `EXPIRED`. Request bodies cannot set the price.

The ledger writes `CREATED` under the unique key `qr-{rideId}-{amountPaise}-{attempt}` before calling the provider. A successful create becomes `PENDING`; failures become `FAILED` so retry uses a new attempt. QR expiry is 15 minutes. Stale pending QRs are checked for credit and closed before replacement. `CAPTURED` payments return `PAID`.

Webhook signatures use HMAC-SHA256 over the raw body and constant-time comparison. Successful events are deduplicated by `x-razorpay-event-id`; failed processing remains retryable. Authentic unknown events return 200. Closure with reason `paid` is ignored.

Polling checks the provider at most every three seconds per payment, including failed attempts retained for late-credit recovery. Exact credited amounts are required. Both paths use the same atomic `PENDING | FAILED -> CAPTURED` operation. Capture, ride settlement, wallet updates, and audit events commit together in the existing Mongo unit of work; only the capture winner notifies after commit. MongoDB must support transactions, as the rest of Cabzone’s payment settlement already requires.

## Driver UI

The sheet polls every two seconds while pending and updates the underlying ride. It renders raw `upi://` content using the installed SVG QR renderer with error correction M, or crops Razorpay’s tall hosted poster without changing its aspect ratio. Expiry removes the scannable media and offers **Generate new QR**. Server-confirmed payment shows a green check and the received amount, vibrates once, and closes after 1.6 seconds.

**Customer paid cash instead** uses Cabzone’s existing two-step cash confirmation and checks/closes pending QRs before authorizing cash. Existing cancellation-arrears policy still blocks cash and shows its explanation. Mock QRs never collect real money; tests can call `simulateCredit` on the injected mock gateway.

## Verification

`apps/api/test/ride-qr-payment.test.ts` covers duplicate creation, provider failure/retry, webhook/poll races, incorrect amounts, paid closures, expiry and late credit, signatures, unknown events, event retries, fare changes, and gateway request constraints. `apps/api/test/integration/ride-qr-capture-mongo.test.ts` verifies rollback and concurrent capture across separate use-case instances on a temporary replica set. The driver’s existing `ride-payment-qr.test.mjs` covers modal interactions and poster geometry with mocked native components.

These checks do not verify actual bank settlement, account QR enablement, physical scan quality, or iOS haptics. Live acceptance requires an authorized driver session and an enabled Razorpay account.
