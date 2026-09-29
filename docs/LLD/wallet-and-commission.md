# Cabzonee — Wallet & Commission

**Document:** `docs/LLD/wallet-and-commission.md`  
**Status:** Draft for Engineering Review  
**Version:** 0.1

## 1. Purpose

Define the Driver wallet, commission accounting, ledger model, balance rules, top-ups, reversals, and reconciliation.

## 2. Wallet Model

Each Driver has one operational Cabzonee wallet.

```text
Driver
  │
  ▼
Wallet
  │
  ├── CREDIT
  ├── DEBIT
  ├── REVERSAL
  └── ADJUSTMENT
```

The PRD requires a prepaid wallet used to pay Cabzonee commission.

## 3. Wallet Is a Ledger

Do not rely only on:

```text
wallet.balance_paise
```

Every financial change must have an immutable transaction.

Conceptually:

```text
Top-up ₹500
→ CREDIT +50000

Commission ₹20
→ DEBIT -2000
```

## 4. Balance Invariant

Recommended:

```text
balance_after =
balance_before + credit - debit + reversal ± adjustment
```

The balance field is a materialized current value; the transaction ledger is the historical source.

Periodic reconciliation should compare:

```text
wallet.balance_paise
```

against ledger-derived balance.

## 5. Commission

Per Decision D-026 ([`decision-log.md`](../decision-log.md#d-026--driver-commission-calculation-percentage-of-agreed-fare)), commission is calculated as a **percentage of the Agreed Fare**:

```text
commission_paise = ROUND(agreed_fare_paise × (commission_percent / 100))
```

Key rules:

- **Integer arithmetic**: Stored and computed in integer paise.
- **Snapshot Immutability**: Captured in the ride's pricing snapshot upon ride creation; subsequent modifications to platform commission rates do not affect previously agreed rides.
- **Settlement Debit**: Debited from the driver's prepaid wallet upon ride settlement (`PAYMENT_CONFIRMED`). Zero or negative balance prevents accepting new ride offers but never interrupts active rides.

## 6. Commission Snapshot

The Ride must retain the commission configuration used for the transaction.

Do not calculate historical commission from the current Admin configuration.

## 7. Ride Settlement

Conceptually:

```text
Ride Completed
      ↓
Calculate Commission
      ↓
Validate Wallet
      ↓
Create Commission Debit
      ↓
Settle Ride
```

Wallet insufficiency should not interrupt the active ride.

The PRD explicitly states that wallet zero should only prevent new ride acceptance.

## 8. Wallet Eligibility

Recommended rule:

```text
balance_paise > 0
```

for accepting a new Ride.

A future configurable minimum threshold may replace this.

## 9. Top-Up

Top-up flow:

```text
Driver
  ↓
Top-up request
  ↓
Payment provider
  ↓
Provider confirmation
  ↓
Idempotent credit
  ↓
Wallet balance updated
```

Never credit based solely on a client success screen.

## 10. Reversal

If a financial operation must be undone:

```text
original transaction
       ↓
REVERSAL transaction
```

Never edit the original transaction.

## 11. Admin Adjustment

Finance/Admin adjustments require:

```text
reason
actor
request_id
before balance
amount
after balance
```

and must generate an audit event.

## 12. Concurrency

Concurrent wallet debits must be serialized or conditionally updated.

Example:

```text
UPDATE wallet
SET balance = balance - commission
WHERE id = wallet_id
AND balance >= commission
```

If zero rows change:

```text
INSUFFICIENT_WALLET_BALANCE
```

## 13. Invariants

- Wallet transactions are immutable.
- Duplicate top-up callbacks cannot duplicate credit.
- Commission cannot be charged twice for the same settlement.
- Active rides cannot be terminated because wallet balance reaches zero.
- Negative balances are prohibited unless explicitly approved.
- Historical commission uses the Ride's pricing snapshot.
