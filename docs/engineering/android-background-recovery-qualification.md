# Android Background Location & Process Recovery Qualification (Steps 7 & 16 / C09)

## 1. Scope & Honesty Boundary

This qualification covers all server and Android client recovery paths in `apps/driver-mobile` (`com.cabzone.driver`) and `apps/rider-mobile` (`com.cabzone.rider`), including an important **Android OS platform truth** regarding **Force Stop (`FLAG_STOPPED`)** vs **App Switcher Swipe-Away / Process Death**.

## 2. Code-Level Qualification & Defect Fixed in C09

### Defect Fixed in `apps/driver-mobile/src/services/background-location.ts`
- **Issue**: When the driver app ran headless in background (`AppState.currentState !== 'active'`) after an access-token expiry AND a Redis presence TTL expiry (e.g. prolonged mobile-data drop), `dispatchApi.updateLocation(token, coords)` refreshed the access token in `SecureStore` and retried, receiving HTTP `409` (`Driver is offline`). The `catch` block then called `dispatchApi.setStatus(token, 'ONLINE', ...)` with the **stale pre-refresh `token`**, causing `recoverAccessToken` to see `storedToken !== failedToken` and abort with `401 Session changed`—silently leaving the driver offline in Redis!
- **Fix**: `background-location.ts` now re-reads `const latestToken = (await getAccessToken()) ?? token` before calling `dispatchApi.setStatus(...)` on `409`, and exports `isEligibleBackgroundFix()` enforcing `<= 30s` fix age, `<= 200m` horizontal accuracy, and finite coordinates.

### Android Lifecycle & Recovery Matrix

| Scenario | Actual Android / Cabzone Behavior | Recovery Mechanism | Code Status |
| --- | --- | --- | --- |
| **1. Screen locked / app backgrounded while ONLINE or on trip** | Android Foreground Service (`FOREGROUND_SERVICE_LOCATION`, notification `"Cabzone Driver is online"`) keeps `cabzone-driver-location` active at 15s / 10m intervals. Background ride offers arrive via FCM/Expo Push (`ride-offers` channel). | `TaskManager` posts `/api/v1/driver/location`; `RideRealtimeNotifier` sends push when WebSocket is disconnected. | **Verified in code & unit tests** |
| **2. OS memory pressure / background process death** | Foreground service with sticky notification resists low-memory kills; if JS runtime restarts or user taps notification, SecureStore tokens + server state (`GET /api/v1/driver/status`, `GET /api/v1/rides/active`) rehydrate UI. | `auth-context.tsx` + `ride-context.tsx` re-fetch server truth on mount and AppState `active`. | **Verified in code** |
| **3. Recent-apps swipe-away** | `startLocationUpdatesAsync` sets `killServiceOnDestroy: true`, stopping background GPS cleanly when swiped away so location is never tracked covertly without the visible foreground-service notification. Push notifications (`FCM`) continue to wake the user for offers/updates. | Reopening the app reconciles `GET /api/v1/driver/status` + `GET /api/v1/rides/active` and restarts foreground service if driver is `ONLINE`. | **Verified in code** |
| **4. Settings -> Force Stop (`FLAG_STOPPED`)** | **Android OS Platform Limit**: Android places force-stopped packages in `FLAG_STOPPED`, terminating all services, alarms, and standard FCM delivery until the user **explicitly reopens** the app. No Play-compliant Android app can self-restart while force-stopped. | **Upon reopen**: App boots cleanly from SecureStore session, refreshes expired JWT if needed, reconciles active ride (`DRIVER_ASSIGNED` / `DRIVER_EN_ROUTE` / `DRIVER_ARRIVED` / `IN_PROGRESS`) and availability from MongoDB/Redis, and restarts foreground location if `ONLINE`. | **Documented & bounded honestly** |
| **5. Device reboot** | Android clears foreground services on reboot; app remains logged in via encrypted `expo-secure-store` refresh token. | On first open after reboot, session refreshes and active ride / driver status is restored from server truth. | **Verified in code** |
| **6. Denied / downgraded GPS permission (`While in use` only or `Denied`)** | `startBackgroundLocation()` checks `Location.getBackgroundPermissionsAsync()` and returns `false` cleanly without crashing when `ACCESS_BACKGROUND_LOCATION` is not `granted`. | Foreground location still works while app is open; UI prompts user to grant `"Allow all the time"` for background dispatch. | **Verified in code & unit tests** |
| **7. OEM battery restriction ("Restricted")** | Aggressive OEMs (Xiaomi MIUI/HyperOS, Vivo, Oppo/Realme, Samsung) may throttle background network or kill foreground services if battery is set to `Restricted`. | Runbook step below requires setting Battery Usage to `Unrestricted` during driver onboarding/QA on OEM devices. | **Documented in device runbook** |
| **8. Mobile network drop & reconnect (`4G <-> Wi-Fi <-> offline`)** | Heartbeats fail transiently while offline; if outage exceeds Redis presence TTL, server expires presence. | Next valid GPS fix after network returns hits `409` on `/location` -> re-reads fresh token -> calls `setStatus('ONLINE', coords)` automatically. WebSocket reconnects with backoff + REST state sync. | **Fixed & verified in unit tests** |

## 3. Physical Android APK Qualification Runbook (When Device & EAS Build Are Available)

```bash
# 1. Verify attached physical Android device
adb devices -l

# 2. Install development/preview builds
adb install -r driver-development.apk
adb install -r rider-development.apk

# 3. Execute lifecycle checks and capture redacted logcat timestamps
adb logcat -c
# a) Lock screen 3 min while ONLINE -> confirm /api/v1/driver/location every ~15s
# b) Toggle airplane mode 60s -> disable airplane mode -> confirm automatic reconnection
# c) Swipe away from Recents -> reopen -> confirm active ride state restored
# d) Force-stop via Settings -> confirm foreground notification stops -> reopen -> confirm clean session & active-ride recovery
# e) Reboot phone -> reopen -> confirm SecureStore session survives without re-login
```

## 4. Physical Device Execution Status (`Blocked`)

- **Automated checks executed**: `apps/driver-mobile/test/platform-push-location.test.mjs` + `pnpm --filter @cabzone/driver-mobile typecheck` + `pnpm --filter @cabzone/rider-mobile typecheck`.
- **Physical device status (`Blocked`)**:
  - `adb devices` returned zero attached Android devices on this host, and EAS/Firebase credentials for building signed push/location APKs are not provisioned here.
  - **Blocked**: Physical low/mid-tier Android device (`<= 4 GB RAM`, Android 11–14) + built development APK to record live lock-screen/airplane-mode/force-stop/reboot timestamps; **owner**: Mobile QA / Release Owner.
