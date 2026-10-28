# Native Push Notifications & Development Builds Guide (Step 8 / C05)

## 1. Why Expo Go Cannot Validate Remote Push

Expo SDK 53+ removed remote push registration from Expo Go on Android. Both `apps/driver-mobile` and `apps/rider-mobile` default to `src/lib/expo-notifications-stub.js` only during plain `expo start` (Expo Go) so UI development does not crash on load.

In `metro.config.js` (`shouldUsePushStub`), the real `expo-notifications` native module is automatically resolved whenever **any** of the following is true:
- `EXPO_USE_PUSH=1` (`pnpm dev:push` / `pnpm start:push`)
- `EAS_BUILD=true` (all EAS cloud/local builds)
- `NODE_ENV=production` (`expo export` / release bundles), unless explicitly overridden with `EXPO_USE_PUSH=0`

## 2. External Prerequisites (EAS + FCM v1)

| Input | Driver App (`com.cabzone.driver`) | Rider App (`com.cabzone.rider`) | Owner |
| --- | --- | --- | --- |
| EAS Project UUID | `DRIVER_EAS_PROJECT_ID` | `RIDER_EAS_PROJECT_ID` | Mobile Release Owner |
| Firebase Android Config | `apps/driver-mobile/google-services.json` (or `DRIVER_GOOGLE_SERVICES_JSON`) | `apps/rider-mobile/google-services.json` (or `RIDER_GOOGLE_SERVICES_JSON`) | Mobile Release Owner |
| FCM V1 Service Account Key | Uploaded in Expo EAS Credentials (`eas credentials -p android`) | Uploaded in Expo EAS Credentials (`eas credentials -p android`) | Mobile Release Owner |
| Optional Expo Server Token | `EXPO_ACCESS_TOKEN` in API `.env.stage` / `.env.prod` | Same API variable | Platform Ops |

> **Never commit `google-services.json`, FCM service-account JSONs, or `EXPO_ACCESS_TOKEN` to git.**

## 3. Building & Running Push-Capable Android APKs

```bash
# Build push-capable Android development APKs
pnpm --filter @cabzone/driver-mobile exec eas build --profile development --platform android
pnpm --filter @cabzone/rider-mobile exec eas build --profile development --platform android

# Start Metro with native push enabled (--dev-client + EXPO_USE_PUSH=1)
pnpm --filter @cabzone/driver-mobile dev:push
pnpm --filter @cabzone/rider-mobile dev:push
```

## 4. API & Notification Channel Architecture

- **Driver channel**: `ride-offers` (`AndroidImportance.MAX`)
  - Endpoints: `POST /api/v1/driver/push-token`, `DELETE /api/v1/driver/push-token`, and shared `POST/DELETE /api/v1/push-token`
  - Events: `ride.offer.created` (with TTL bound to `offeringExpiresAt`), `ride.driver.assigned` (`viaCounter: true`)
- **Rider channel**: `ride-updates` (`AndroidImportance.MAX`)
  - Endpoints: `POST /api/v1/push-token`, `DELETE /api/v1/push-token`
  - Events: `ride.driver.assigned`, `ride.driver.arrived`, `ride.started`, `ride.completed`, `ride.cancelled`, `ride.offer.expired`, `ride.fare.countered`
  - Privacy: `pickupOtp` is **never** sent through Expo push payloads; it is delivered exclusively over authenticated WebSocket / `GET /api/v1/rides/:id`.
- **Foreground suppression**: `RideRealtimeNotifier` checks `publisher.isConnected(userId)` so active WebSocket sessions receive instant in-app events without duplicate OS push banners, while backgrounded/killed apps receive push notifications.
- **Invalid token pruning**: `ExpoPushService` deletes tokens immediately on `DeviceNotRegistered` in both send tickets and 15-minute receipt sweeps.

## 5. Cross-Agent Integration Handoffs

### For Agent A (`apps/api/src/routes.ts`)
Mount the shared authenticated push-token router so riders (not only `DRIVER` role) can register/unregister tokens at `/api/v1/push-token`:
```ts
v1.use(
  containers.dispatch.buildPushTokenRouter({
    authenticate: containers.identity.authenticate,
  }),
);
```

### For Agent B (`apps/rider-mobile` & `apps/driver-mobile` client state/deep-links)
1. **`apps/rider-mobile/src/services/api.ts`**: Add `pushApi.registerPushToken(authToken, installationId, token)` -> `POST /api/v1/push-token` (`{ installationId, token }`) and `pushApi.unregisterPushToken(authToken, installationId)` -> `DELETE /api/v1/push-token` (`{ installationId }`).
2. **`apps/rider-mobile/src/context/auth-context.tsx` & `ride-context.tsx`**: Register push token via `registerForPushAsync()` + `listenForPushTokenChanges()` when authenticated; call `unregisterPushToken` before `logout()` clears tokens.
3. **`apps/rider-mobile/app/_layout.tsx` & `apps/driver-mobile/app/_layout.tsx`**: Handle `Notifications.getLastNotificationResponseAsync()` and `Notifications.addNotificationResponseReceivedListener` so tapping a push notification reconciles server ride state (`GET /api/v1/rides/:rideId` / `GET /api/v1/driver/offers`) and navigates to `/searching`, `/active-ride`, or `/(tabs)`.

## 6. J03 Physical-Device Verification Status

- **Automated API & Metro tests**: Verified in Vitest (`test/expo-push.test.ts`, `test/push-transport-and-monitoring.test.ts`) and mobile test runner (`apps/driver-mobile/test/platform-push-location.test.mjs`).
- **Physical Android APK execution (`Blocked`)**:
  - `adb devices` = none attached; `eas` CLI / EAS project IDs / `google-services.json` / FCM v1 credentials not provisioned in this workspace.
  - **Blocked**: EAS project IDs, Firebase `google-services.json` + FCM v1 service-account upload, and 2 physical Android phones for J03 locked-screen & killed-app push capture; **owner**: Mobile Release Owner + QA.
