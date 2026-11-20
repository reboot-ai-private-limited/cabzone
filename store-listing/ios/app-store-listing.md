# App Store listing: Cabzone (rider, iOS)

Copy-paste ready for App Store Connect. Character limits are Apple's. Items in `[brackets]` are things only you can fill in.

## App information

| Field | Limit | Value |
|---|---|---|
| Name | 30 | `Cabzone: Cab Booking` |
| Subtitle | 30 | `Your ride. Your fare.` |
| Bundle ID | | `in.cabzone.rider.app` |
| Primary category | | Travel |
| Secondary category | | Navigation |
| Price | | Free |
| Languages | | English (primary). The app also supports Hindi and Bengali; add listings later if you want. |
| Copyright | | `2026 [Company legal name]` |

## Promotional text (170, editable any time without a new build)

```
Book a cab in Siliguri and set the fare you want to pay. City rides, trips to Kurseong and Kalimpong, OTP-safe pickups and direct payment to your driver.
```

## Keywords (100, comma-separated, no spaces after commas)

Words already in the name or subtitle (cab, booking, ride, fare) are left out on purpose, Apple indexes them already.

```
taxi,siliguri,outstation,kurseong,kalimpong,intercity,hire,driver,city,trip,local,west bengal,india
```

## Description (4000)

```
Cabzone is a cab booking app where you agree on the fare before you ride. Book a city ride or plan a trip to another city, see the route, set the price you want to pay, and get matched with a verified independent driver.

YOUR RIDE. YOUR FARE.
• See the route and a suggested fare before you book.
• Raise or lower the fare in ₹10 steps to suit your budget.
• Fares are locked when you request the ride, so the rate cannot change mid-trip.
• Toll and permit charges, where they apply, are shown as extra at actuals.

CITY RIDES
• Pick your pickup and drop-off by searching for a place or choosing it on the map.
• Add stops along the way.
• Book for yourself or for someone else.

CITY TO CITY
• Plan outstation trips from Siliguri to nearby destinations such as Kurseong and Kalimpong.
• Popular routes are shown with approximate distances so you can start quickly.

SAFER PICKUPS
• Every trip uses a one-time pickup OTP, so you only start the ride with the right driver.
• Save an emergency contact in your profile.
• Chat with your driver, or call them privately from inside the app.

PAY THE DRIVER DIRECTLY
• Pay the agreed fare to your driver in cash or by UPI when you reach your destination.
• Cabzone connects riders and independent drivers. The fare you agreed is what you pay.

TRIPS AND RECEIPTS
• See every past trip in Activity, with itemised receipts.
• Repeat a ride or book the return route in one tap.
• Rate your driver after a trip.
• Save your regular routes for quick booking.

MADE FOR YOU
• Available in English, Hindi and Bengali.
• Choose kilometres or miles.
• Light and dark themes, or follow your phone setting.

PERMISSIONS
• Location: used while the app is open to suggest your pickup point and show nearby drivers. Cabzone does not track your location in the background.
• Notifications: ride updates, driver messages and incoming call alerts.
• Microphone: only when you make or take a call with your driver inside the app.

SIGN IN
Sign in with your mobile number and a 6-digit code sent by SMS. No password to remember.

Cabzone is currently available in and around Siliguri, West Bengal, with more cities planned. Questions? Open Profile > Help in the app.
```

## What's New (version 1.0)

```
Welcome to Cabzone on iPhone. Book city rides and city-to-city trips, set your own fare, and pay your driver directly.
```

## URLs and contact

| Field | Value |
|---|---|
| Support URL (required) | `https://cabzone.site/support` (page added in `apps/web`, live after you deploy the web app). Contact email on it: `cabzonehelp@gmail.com`. |
| Marketing URL (optional) | `https://cabzone.site` |
| Privacy Policy URL (required) | `https://cabzone.site/privacy` (route exists in `apps/web`). |
| Account deletion URL | `https://cabzone.site/account-deletion` (route exists in `apps/web`). |

### Support page text (already built as `apps/web/src/app/support/page.tsx`; kept here for reference)

```
Cabzone Support

Need help with a ride, a payment or your account? We are here to help.

In the app: open Profile > Help & Payment Disputes for FAQs, the safety guide and trip dispute help.

Email: [support email]
Phone: [support phone]   Hours: [days and hours]
We reply within 48 hours.

Safety: if you are in danger, call 112 (India emergency number) first, then tell us.

Delete your account: Profile > Delete account in the app, or visit [https://cabzone.in/account-deletion].
Privacy policy: [https://cabzone.in/privacy]
Grievance Officer: [name, email, phone]
```

## App Review information

| Field | Value |
|---|---|
| Sign-in required | Yes |
| Demo phone | `+91 9999900001` |
| Demo code | `000000` (works only if the production API has `MOCK_OTP=true` during review, see below) |
| Contact for review | `[your name]`, `[phone]`, `[email]` |

Notes for the reviewer (paste into the Notes box):

```
Cabzone is a ride-booking marketplace for the physical world (taxi rides), so Apple's in-app purchase is not required: riders pay the driver directly in cash or UPI, and the app takes no card or wallet payment.

Sign-in: enter the demo number above (without +91), tap Send code, then enter 000000.
Allow location when asked. Home shows the map and "Where to?". Tap "Where to?", search "City Centre" and choose a result to see the route and the "Your fare" screen.
Matching needs an online driver, so the booking flow stops at "Find Cab" during review.
Location is used only while the app is open. The microphone is used only for in-app calls with a driver. Push notifications carry ride updates and call alerts.
Account deletion: Profile > Delete account.
```

**Before you submit:** Apple's reviewers cannot receive your SMS. Your API has a `MOCK_OTP` flag (every OTP is `000000`, no SMS) and production can start with it. Turn it on only for the review window, then turn it off, or use a dedicated demo number that always accepts `000000`.

## App Privacy ("nutrition label") answers

Verify each line against what the app really sends before you submit.

| Data | Collected | Linked to user | Used for | Tracking |
|---|---|---|---|---|
| Phone number | Yes | Yes | App functionality, sign-in | No |
| Name | Yes | Yes | App functionality | No |
| Email (optional) | Yes | Yes | App functionality, support | No |
| Precise location (while in use) | Yes | Yes | App functionality (pickup, trip tracking) | No |
| User ID, device ID / push token | Yes | Yes | App functionality (notifications) | No |
| Emergency contact (name, phone) | Yes | Yes | App functionality (safety) | No |
| Crash and diagnostic data | Yes | `[decide]` | Analytics, app functionality | No |
| Payment info | No (paid directly to driver) | | | |
| Contacts, photos, health | No | | | |

Tracking: **No**, as long as no ad or analytics SDK links data with other companies. Then no App Tracking Transparency prompt is needed.

## Other forms

- **Age rating:** answer "None" to every content question. The result should be 4+.
- **Export compliance:** the app only uses standard HTTPS. `ITSAppUsesNonExemptEncryption` is already set to `false` in `app.json`, so you won't be asked again each build.
- **Content rights:** you own or have licence to everything in the app.
- **Government/geo:** the app is for India. Choose India as the storefront at first, and add other countries later if you want.

## Checklist before "Submit for Review"

1. Support URL, privacy URL and account-deletion page are live and show real contact details.
2. In-app account deletion works. Apple requires it for any app with sign-up. `store-listing/README.md` says it was missing, so test it.
3. Demo login works on the production API (see the MOCK_OTP note).
4. Screenshots uploaded: 1206×2622 (6.3") and 1179×2556 (6.1"). Capture real ones from the iOS Simulator before the final submission.
5. APNs `.p8` key set on the API server, and a push test passes on a real iPhone.
6. The build is uploaded to App Store Connect (Xcode: Product > Archive > Distribute) and selected on the version page.
