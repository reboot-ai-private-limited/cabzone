# Push notifications in development builds

Expo Go is not a push test target. Start these apps with their development client and install a native development build.

## One-time setup

Install EAS CLI (`npm install --global eas-cli`) and sign in with `eas login`. Create/link a separate EAS project for each app (`eas init` from each app directory), then set that project's UUID as `EAS_PROJECT_ID` when building and starting Metro. Configure Android FCM v1 credentials and iOS APNs credentials in EAS. Keep service-account keys out of this repository. The app config reads the project ID from `EAS_PROJECT_ID`; push registration returns no token if it is missing.

```powershell
Set-Location apps/rider-mobile
$env:EAS_PROJECT_ID = "<rider EAS project UUID>"
eas build --platform android --profile development
pnpm dev:push
```

Repeat from `apps/driver-mobile` using its own EAS project UUID. Install each generated development APK on a physical Android phone. For iOS, use a physical iPhone and the matching APNs credentials/profile. After installing new native dependencies, rebuild the development client.

## Verify delivery

Use two signed-in devices, one rider and one driver, both running installed development builds. Confirm token registration through delivery; do not copy tokens into logs or source control.

While a WebSocket is connected in the foreground, ride updates appear in the app and the server suppresses the corresponding remote push. Backgrounding closes the socket so the remote alert can be delivered.

| App state  | Rider                                                                                                                                        | Driver                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Foreground | Create a ride, then receive driver assignment/counter update; verify the in-app state updates without opening a second ride.                 | Receive a new ride offer and verify the offers list refreshes.                                                                                 |
| Background | Have the driver accept or counter; verify a visible notification, tap it, and confirm it opens the matching ride.                            | Request a ride as the rider; verify a visible offer notification, tap it, and confirm the offer is refreshed.                                  |
| Terminated | Send an assignment/counter notification, terminate the rider app, tap it, and confirm cold start fetches the current ride before navigating. | Send an offer notification, terminate the driver app, tap it, and confirm cold start refreshes the offer list and reports stale offers safely. |
| Reconnect  | Disable network, trigger a ride update, restore network, and confirm resume/WebSocket reconnect refreshes the authoritative ride.            | Disable network, receive or miss an offer, restore network, and confirm polling/WebSocket reconnect repopulates valid offers.                  |

Also deny notification permission once and verify ride flows still work through realtime/polling; then re-enable permission and repeat. On Android, confirm the `ride-updates` and `ride-offers` channels are enabled.

The device matrix above remains pending until both development builds and push credentials are available. API integration tests verify rider registration and server push selection; they cannot prove OS delivery, notification taps, or cold-start routing.
