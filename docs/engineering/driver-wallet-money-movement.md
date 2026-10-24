# Driver recharge and cashout

Drivers may cash out collected online trip earnings and unused commission/recharge credit. Cash or personal-UPI fares already received by the driver are never credited again. Commission dues must be cleared before cashout, and withdrawing all commission credit can block new ride offers under the existing positive-balance rule.

## First working release

- Recharge: ₹100–₹1,00,000, whole paise, UPI-only Razorpay **test** checkout in the phone browser. The server persists the payment order, checks captured INR/UPI/exact amount, and credits once. Returning from the browser never means payment succeeded.
- Cashout: ₹1 minimum, to a UPI ID. Earnings are reserved first, then unused commission credit. Debits and the pending request commit together. Only the owning driver can request it, and Finance/Super Admin can record a transfer reference or reject with a reason. Rejection returns the exact reserved amounts once; marking paid does not debit again.
- Requests are scoped to the driver, action, amount, destination, and idempotency key. Reusing a key with different details fails. Request history and wallet transactions survive app restarts.
- The driver sees commission credit, online earnings, available cashout, pending requests, and transaction history. Test funds and requests are explicitly labelled. Real bank transfers are not sent by this release; Finance records test transfer references only.
- Live wallet recharge/cashout stays disabled until production funding, refund handling, beneficiary verification, and payout reconciliation are configured. Existing test/seed wallet balances must not be migrated into withdrawable real funds. Ride payment live-mode support does not enable wallet live mode.

## Routes

Driver wallet routes under `/api/v1/driver/wallet/me`: `GET /activity`, `POST /recharges`, `POST /recharges/:id/status`, `POST /cashouts`. Recharge creation and cashout requests require an idempotency key; status verification is intrinsically idempotent. The driver identity comes from authentication. Activity and Finance queues return the latest 100 matching requests.

Finance routes under `/api/v1/admin/wallets`: `GET /cashouts`, `POST /cashouts/:id/resolve`. Resolution requires `PAID` plus a transfer reference, or `REJECTED` plus a reason. Replayed identical resolutions return the saved result; conflicting terminal decisions fail.

Recharge checkout uses a short-lived payment-only ticket with a separate audience. It grants no wallet-read, cashout, or account permissions. The browser can fetch checkout options and reconcile status only.

## Money invariants

One captured recharge creates one commission credit. One captured online ride creates one earnings credit for its net fare. Cash settlement still debits commission from prepaid credit. Cashout reservation cannot exceed the available balances, cannot bypass wallet blocking or arrears, and cannot turn a balance negative. All ledger writes use the existing Mongo transaction/session mechanism; unique idempotency indexes prevent duplicate credits or requests.

Acceptance covers ownership, exact amounts and provider status, duplicate requests/verification/resolution, insufficient funds, blocked wallets, cashout rejection, and transactional rollback/concurrent withdrawal using isolated Mongo tests.

Provider prerequisites for later automation: [RazorpayX payouts](https://razorpay.com/docs/api/x/payouts/) require fund accounts, account activation, IP allowlisting, and payout idempotency. No real payout is initiated during implementation or testing.

## Verification — 24 October 2026

- Full API regression: 407 tests passed. After the final concurrent-first-funding fix, all 16 targeted wallet tests passed, including four isolated Mongo transaction tests.
- Driver auth/payment/wallet UI checks: 17 tests passed. Covers exact rupee parsing, duplicate taps, safe retry keys, new recharge keys, and opening checkout without claiming payment succeeded.
- API, driver and web TypeScript checks passed. Targeted lint checks passed; full API lint has six existing warnings in dev/seed scripts. Dependency boundaries passed.
- External checkout and keyboard behavior have not been verified on the phone. Browser visual review stopped because Computer Use could not reliably determine the browser URL. Automated tests use fake provider responses and isolated Mongo, and do not prove Razorpay account capability or actual UPI app redirection.
- Earnings credit starts with newly reconciled online payments. Previously settled rides are not backfilled automatically: historical payouts need reconciliation before crediting them again.
