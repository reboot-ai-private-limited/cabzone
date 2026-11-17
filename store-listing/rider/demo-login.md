# Rider app: demo login for Play review

Paste into **Play Console > App content > App access** (choose "All or some functionality is restricted", then add instructions).

## Text to paste

```
Cabzone uses phone-number sign-in with a 6-digit SMS code (no password).

Demo account
  Phone number: +91 9999900001
  Sign-in code: 000000

Steps
1. Open the app and tap "Continue with phone".
2. Enter the phone number above (without +91) and tap "Send code".
3. Enter the sign-in code above and tap "Verify & Continue".
4. If asked for a name, enter any name, then tap "Start Booking Rides".
5. Allow location when asked. The Home tab shows the map and "Where to?".
6. To see the fare screen: tap "Where to?", search "City Centre", choose a result.
   The route and "Your fare" (± ₹10) appear. You do not need to tap "Find Cab".

Notes for the reviewer
- Payment is made directly to the driver in cash or by UPI. The app does not take card or wallet payments from riders.
- Matching with a driver needs an online driver, so the booking flow stops at "Find Cab" in review.
- Location is used only while the app is open.
```

## Status

| Item | State |
|---|---|
| Fixed OTP in **development** | Works: `000000` (`DEV_FIXED_OTP` in `apps/api/.env`). |
| Test rider created in the local dev DB | `+919999900001`, name "Demo Rider". It only exists on the dev database. |
| Fixed OTP in **production** | **Not possible today.** The API refuses `DEV_FIXED_OTP` when `NODE_ENV=production` (`apps/api/src/config/env.ts`). |

## What you must decide before submitting

Google reviewers cannot receive an SMS to a number you control, so a real OTP will not work. Pick one:

1. **Review allow-list (recommended).** Add a small server-side allow-list, for example `REVIEW_DEMO_PHONES` with a fixed OTP, that works only for the numbers on it. This is a deliberate exception to the production rule above, so keep the list to one or two numbers, set the OTP through a secret, and remove it after review.
2. **Staging build.** Point the review build at the staging API with `STAGING_UNSAFE=true` and `DEV_FIXED_OTP` set. The app must then ship with a staging API URL, and you should not leave that build live.
3. **Give a live number.** Provide a phone you will watch during review and the OTP when asked. Reviews can take days, so this is unreliable.

Replace `[demo rider number]` and `000000` once you choose.

## Decision (2026-11-17): staging release

Release runs against the staging API (`NODE_ENV=stage`, `STAGING_UNSAFE=true`, `SMS_PROVIDER=console`), where `000000` is accepted for any number. The demo number above is a normal rider that signs up on first login. Switch to the production allow-list approach before a real public launch.
