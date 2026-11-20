# Rider iOS app plan (works with the Android driver app)

The rider and driver apps only talk to the API, so an iPhone rider and an Android driver work together with no server change. The server already stores `platform: 'ios'` on push tokens.

## Decisions
- Calls: **option (a)**. No PushKit. App open = CallKit ring. App closed = normal Expo push with the 29s `ring_long.wav` sound (under the iOS 30s limit); tap it to answer. Server already does this (`expoPush.service.ts`); legacy `APNS_VOIP` tokens are ignored.
- Maps: **Google Maps** on iOS (`PROVIDER_GOOGLE` is already used in `booking-map.tsx` and `map-location-picker.tsx`).
- Push: iOS uses **direct APNs** (no Expo/EAS). The app registers the raw APNs token with transport `APNS`; the API sends it over HTTP/2 using `apnsPush.sender.ts`. Server env: `APNS_KEY` (or `APNS_KEY_PATH`), `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID` (default `in.cabzone.rider.app`), `APNS_PRODUCTION` (`true` for TestFlight/App Store, `false` for Xcode dev builds; the sender also retries the other gateway on BadDeviceToken). Create the `.p8` key at developer.apple.com > Keys > Apple Push Notifications service.
- Bundle ID: `in.cabzone.rider.app` (same as Android package).

## Done in this change
- `app.json`: iOS bundle id, buildNumber, permission texts (location, microphone), `ITSAppUsesNonExemptEncryption=false`, UPI app schemes.
- `eas.json`: development profile can build for the iOS simulator.
- `app.config.js` already passes `googleMapsApiKey` to iOS.

## Steps you must do (need your accounts)
1. Join the Apple Developer Program ($99/yr). Register App ID `in.cabzone.rider.app` with Push Notifications, and create the app in App Store Connect.
2. Google Cloud: enable **Maps SDK for iOS**, create an iOS-restricted API key (bundle id `in.cabzone.rider.app`), then set `RIDER_GOOGLE_MAPS_API_KEY` as an EAS env var (or the same name in `.env`).
3. APNs: create an APNs `.p8` key in the Apple developer portal and set the `APNS_*` env vars on the API server. No EAS or Firebase upload is needed.
4. Build (no EAS): on a Mac run `npx expo prebuild --platform ios`, then `npx expo run:ios --device` or archive in Xcode. In Xcode enable the Push Notifications capability.

## Verify on a real iPhone (riskiest first)
1. **Calls.** `voice-bootstrap.ts` and `call-context.tsx` use CallKit through `react-native-callkeep`. A call arriving while the app is closed needs a **VoIP (PushKit) push**, which the server does not send yet. Decide: (a) iOS gets calls only when the app is open or via a normal push with a tap to answer (quick, recommended first), or (b) add PushKit end to end (larger).
2. Push: ride accepted, driver arrived, chat message, with the app closed and in the foreground.
3. Maps: pickup picker, driver marker moving, route line.
4. Location: the rider only needs When-In-Use, so no Always-permission flow is needed. Background location is a driver-app need.
5. Payments: Razorpay and UPI app launch (`LSApplicationQueriesSchemes` added).
6. Full ride with an Android driver: request, accept, track, chat, call, pay.

## App Store
Privacy policy URL, privacy nutrition labels, screenshots, a review account (use MOCK_OTP), and a note on why microphone and location are used.
