# Android release build (rider + driver)

Applies to local `./gradlew bundleRelease` builds. EAS builds use the profiles in `eas.json`.

## One-time: signing properties (`~/.gradle/gradle.properties`)
Rider: `CABZONE_RIDER_UPLOAD_STORE_FILE` (absolute path), `_STORE_PASSWORD`, `_KEY_ALIAS`, `_KEY_PASSWORD`.
Driver: the same with `CABZONE_DRIVER_`. A release task now **fails** if these are missing; it never signs with the debug key.

## Every release
1. Bump `expo.android.versionCode` in `app.json` (local builds only; `eas.json` uses remote versioning for EAS builds, do not mix the two for one app).
2. Create `.env.production` (gitignored) with `EXPO_PUBLIC_API_URL=https://cabzone.site` and the EAS project id. Expo loads it when `NODE_ENV=production`.
3. Prebuild and build with production mode:
   ```sh
   NODE_ENV=production npx expo prebuild --platform android --clean
   cd android
   ./gradlew :app:signingReport | grep -A5 "Variant: release"   # Store must not be null
   NODE_ENV=production ./gradlew clean bundleRelease
   ```
4. Output: `android/app/build/outputs/bundle/release/app-release.aab`.

## Guards (what fails the build)
- Production build (`EAS_BUILD_PROFILE=production`, or `NODE_ENV=production` without a development/preview profile) requires an `https://` `EXPO_PUBLIC_API_URL`.
- Production manifest has `usesCleartextTraffic=false` and `allowBackup=false`. Check: `grep -E "usesCleartextTraffic|allowBackup" android/app/src/main/AndroidManifest.xml`.
- Prebuild without `NODE_ENV=production` re-enables cleartext for local dev, so always prebuild with it for a store build.

## Push
`google-services.json` (gitignored) must exist in the app folder, and the FCM V1 service-account key must be uploaded to EAS for each app. Without them the build succeeds but push does not work.

## Play-review login
Set `REVIEW_DEMO_PHONES` and `REVIEW_DEMO_OTP` on the production API (see `apps/api/.env.prod.example`); remove them after review.
