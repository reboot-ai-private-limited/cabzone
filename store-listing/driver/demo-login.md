# Driver app: demo login for Play review

Paste into **Play Console > App content > App access** (choose "All or some functionality is restricted", then add instructions).

## Text to paste

```
Cabzone Driver uses phone-number sign-in with a 6-digit SMS code (no password).

Demo account (already verified: KYC approved, vehicle registered)
  Phone number: +91 9000000002
  Sign-in code: 000000

Steps
1. Open the app and enter the phone number above, then tap to send the code.
2. Enter the sign-in code above.
3. The Home tab shows today's earnings and a switch to go ONLINE.
   Tap the status button to go online. The app asks for location permission.
4. Rides tab: live offers, active trip and ride history.
5. Earnings tab: earnings by day, week, month and all time.
6. Profile tab: personal details, vehicle, KYC documents, wallet and help.

Notes for the reviewer
- Location (including in the background) is used only while the driver is ONLINE, so riders can be matched and can follow the trip. Going offline stops it.
- Riders pay the driver directly in cash or UPI. The app records an 8% platform commission against the driver wallet.
- Incoming offers appear only when a rider requests a ride nearby. The review account has sample trips in Rides > history.
```

## Status

| Item | State |
|---|---|
| Fixed OTP in **development** | Works: `000000`. |
| A reviewable **demo driver** | **Does not exist yet.** The driver on the dev phone uses the developer's own number, so do not publish it. |
| Fixed OTP in **production** | **Not possible today** (see the rider file for the options). |

## What you must do

1. Create a dedicated driver account on the environment the reviewer will use: sign up in the driver app, complete KYC with dummy but valid-looking documents and a vehicle, and approve it from the admin panel.
2. Make a few settled trips for that driver so Rides and Earnings are not empty. Offers only appear when a rider requests a ride, so the reviewer will not see a live offer unless you arrange one.
3. Choose how the reviewer gets past the SMS code (see the three options in `../rider/demo-login.md`) and fill in the two placeholders.
4. In Play Console, complete the **background location** declaration and upload a short video showing the in-app disclosure and the feature that needs it. Google requires this for `ACCESS_BACKGROUND_LOCATION`.

## Decision (2026-11-17): staging release

The demo driver `+91 9000000002` comes from `pnpm seed` (no `--reset`) on the staging database and is already KYC approved with a vehicle. Run it on the VM: `cd /var/www/cabzone/apps/api && pnpm seed`. `000000` is accepted in stage mode. Do not use `--reset` on a database with real data.
