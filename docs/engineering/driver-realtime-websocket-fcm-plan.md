# Cabzone Driver: WebSocket + FCM implementation plan

> **Update 2026-11-18:** Push is Expo-only. Tokens are in Mongo with receipts and `DeviceNotRegistered` pruning, every message carries a TTL (default 1h), and priority is `high` except chat (`normal`). Native `FCM_CALL`/`APNS_VOIP` registration was removed from both apps; the server accepts and ignores it from older builds. Closed-app call ringing is a normal ringing notification, not a wake-up data message. Sections below that describe the older in-memory `Map` and missing receipts are historical.

**Status:** implementation guide; the hybrid is not yet complete.  
**Scope:** driver availability, location, ride offers, lifecycle updates, notification wake-up, recovery and delivery.  
**Product rule:** REST commands and the database decide every ride transition. Realtime messages and push only announce state that the server has already committed.

## 1. Architecture decision

Use the backend's existing authenticated **raw WebSocket (`ws`) hub at `/ws`** for live foreground events. Do not introduce Socket.IO merely because the earlier architecture used “WebSocket/Socket.IO” as interchangeable options. Use **Expo Push Service → FCM** for Android background notifications. Expo is the current sender/token API in this repository; FCM is the Android delivery transport behind it. Direct Firebase Admin sending would be a separate migration, not a prerequisite for this design. WebRTC is not part of dispatch, push, or location and is not required.

```text
Driver app foreground ── authenticated /ws ──► API realtime hub
       │                                         │
       ├── REST accept/arrive/start/complete ──► ride use cases + database
       └── REST location (current) ────────────► dispatch presence (Redis)

Driver app background ◄── Android FCM ◄── Expo Push ◄── notification service
       │
       └── notification tap → REST resync → reconnect /ws → render current state
```

The architectural distinction is essential: a push may arrive late, twice, or after another driver accepts. The notification never grants an offer or changes ride state. The app must re-fetch the offer before enabling Accept. A WebSocket event is also advisory; the response to the REST command determines success.

The supplied architecture describes initial location **targets** of 3–4 seconds in the foreground/in trip and 15–20 seconds in an Android background foreground service. These are scheduling targets, not guaranteed delivery intervals. When the process is terminated, location stops; the server must exclude stale presence. Android permission, battery and background limits determine the observed behavior.

## 2. What exists today (repository inspection, 14 October 2026)

| Area | Existing implementation | Gap / consequence |
|---|---|---|
| WebSocket server | `apps/api/src/shared/realtime/realtimeHub.ts` authenticates `/ws`, tracks sockets by user, pings every 30 seconds, emits `{event,eventId,timestamp,data}` and can fan out through Redis Pub/Sub. | Driver app does not consume it. `isConnected(userId)` is only local-process connectivity and does not indicate foreground state across API instances. Incoming frames support `ping` only. |
| Offer creation | `apps/api/src/modules/dispatch/application/rideRealtimeNotifier.ts` publishes `ride.offer.created` to candidate users. | The same notifier also pushes **every** candidate, including connected users; foreground duplicate notifications are likely. |
| Offer removal | Ride lifecycle updates go to rider and assigned driver. Offer expiry is emitted by a use case. | The original candidate set is not retained for sending `ride.offer.taken` or expiry to losing drivers. Their offer sheet can remain until a later poll/resync. |
| Push sender | `apps/api/src/modules/dispatch/application/expoPush.service.ts` sends Expo tokens with high priority. `/api/v1/driver/push-token` registers/removes tokens. | Tokens are in a process-local `Map`; restart or another API instance loses them. Sender checks HTTP status only, not Expo tickets/receipts or `DeviceNotRegistered`. No offer-specific TTL. |
| Mobile push | `apps/driver-mobile/src/services/push-notifications.ts` creates an Android channel, requests permission and obtains an Expo token. | No token rollover listener, cold-start/tap routing, visible registration failure or confirmed removal on logout. `app.json` lacks notification plugin, Firebase file reference and background-location configuration. |
| Mobile offers | `apps/driver-mobile/src/context/ride-context.tsx` polls offers every 3 seconds and active ride every 4 seconds; REST endpoints already support resync. | No authenticated WebSocket client or event reconciliation. Polling remains the only live delivery path. |
| Mobile location | `apps/driver-mobile/src/context/duty-context.tsx` posts foreground location roughly every 3.5 seconds through REST. | No background TaskManager/foreground-service implementation. The app cannot promise background tracking. |
| Presence | `RedisPresenceRepository` expires a presence hash after 120 seconds; dispatch rejects locations older than 60 seconds. | A killed app is not immediately observable. An explicit server policy should distinguish last requested availability from actual dispatch eligibility. Redis is needed for real presence/dispatch even if the WebSocket hub falls back to local mode. |
| Ride acceptance | `apps/api/src/modules/rides/application/useCases/acceptRide.usecase.ts` and its repository own the claim. | Keep the existing atomic server claim; no client-side “winner” calculation. |

**Product conflict to resolve in code while implementing this plan:** the current notifier text says “accept or counter,” and fare-negotiation events exist, while the agreed Driver MVP was first-successful accept with no counter-offer. Do not make negotiation part of the hybrid contract unless product scope changes. The rider's proposed fare remains visible.

## 3. Contract and invariants

Keep the present WebSocket envelope. Define event data schemas in the shared contracts package rather than separately in API and mobile:

```ts
type RealtimeEnvelope<T> = {
  event: string;
  eventId: string;       // UUID for duplicate suppression / logging
  timestamp: string;     // ISO-8601 server time
  data: T;
};

type OfferCreated = {
  rideId: string;
  rideVersion: number;
  expiresAt: string;
  vehicleCategory: 'CAB' | 'E_RICKSHAW'; // use actual shared enum
  pickup: unknown;      // reuse existing RideOfferDto fields and schemas
  drop: unknown;
  proposedFarePaise: number;
  distanceToPickupM: number;
};

type OfferClosed = {
  rideId: string;
  rideVersion: number;
  reason: 'TAKEN' | 'EXPIRED' | 'CANCELLED' | 'INELIGIBLE';
};
```

The shape above is a contract sketch, **not** permission to duplicate `RideOfferDto` or invent a second vehicle enum. Reuse the repository's actual DTO and derive the schema from it. Include `rideVersion` in offers/closures so an older packet cannot overwrite a newer ride state. The existing lifecycle notifier already includes `rideVersion`; preserve that pattern. Never include rider OTP in a driver-directed WebSocket event, push payload or log. The rider-only OTP delivery in `RideRealtimeNotifier` must remain intact.

| Event | Recipient and effect | Recovery source |
|---|---|---|
| `connection.ready` | The authenticated socket; trigger state refresh. | Driver status, offers and active ride REST reads. |
| `ride.offer.created` | Each eligible candidate; render/upsert only until `expiresAt`. | `GET /api/v1/driver/offers`. |
| `ride.offer.taken` (add) | Every candidate except the winner; remove offer immediately. | Offer list / ride detail. |
| `ride.offer.expired` | Every candidate; remove offer. | Offer list. |
| `ride.cancelled` | Assigned driver and any candidate still shown the offer, as applicable. | Ride detail / offer list. |
| `ride.driver.assigned` | Winner and rider; driver opens active ride. | Active-ride read. |
| Other `ride.*` lifecycle events | Assigned driver/rider according to existing privacy rules. | Ride detail. |
| `driver.eligibility.changed` (add when backend can emit) | Driver; stop displaying online/dispatchable state if restricted. | Driver status/eligibility endpoint. |
| `wallet.updated` (add when backend can emit) | Driver; refresh balance and ledger. | Wallet endpoints. |

Keep `availabilityStatus` (what the driver requested) separate from **dispatchable presence** (approved, allowed, location fresh, connection/background policy satisfied, wallet eligible, no conflicting ride). Do not put a socket ID or push token in a ride record.

## 4. Backend implementation instructions

### 4.1 Reuse the hub; do not add Socket.IO

1. Keep `/ws` and the present token verification in `realtimeHub.ts`. Add a narrowly scoped mobile WebSocket client. A React Native WebSocket cannot reliably attach the same headers as Node clients on every platform; if the existing `?access_token=` path is used, make sure the token is short lived, sent only over `wss` outside local development, never logged in URLs, and rotated on refresh. Prefer a ticket endpoint if proxy/access logs cannot exclude query strings.
2. On connect, verify a driver role for driver-only events. Treat `connection.ready` as an invitation to resync, never as proof the driver is eligible.
3. If connection state is used to decide whether to push, expose a **shared, per-device foreground-connected lease** in Redis (short TTL refreshed while app foregrounded). Do not base cross-instance fallback on local `RealtimeHub.isConnected`. On socket close/timeout, let the lease expire; its absence means “may need push,” not “is eligible.” Keep multi-device semantics explicit: push only devices without a foreground socket if tokens are stored per installation.
4. Existing socket frames only accept `ping`. Retain REST location as the MVP command path. If later moving location to socket, validate/authenticate the message and call the existing `UpdateDriverLocationUseCase`; add an acknowledgement and rate limit. Never create a parallel unvalidated location writer in the hub.
5. Preserve Redis Pub/Sub fan-out for multi-instance delivery. Pub/Sub is not durable; reconnect always runs REST resync.

### 4.2 Fix offer fan-out and removal

1. In `RideRealtimeNotifier.rideRequested`, persist or cache the exact candidate **user IDs** with `rideId`, `rideVersion` and offer expiry. A Redis set with expiry past `offeringExpiresAt` is adequate for this short-lived membership. Avoid persisting pickup, PII or OTP in this set.
2. Publish `ride.offer.created` to those users. For background devices only, enqueue push alerts; exclude foreground-connected device installations. This requires the per-device foreground lease above or a deliberately documented user-level approximation. A failed WebSocket send or missing lease must not suppress a needed push.
3. After successful atomic accept in the existing ride use case, publish assignment to winner and `ride.offer.taken` to all other recorded candidates. On expiry/cancellation publish the corresponding closure to candidates, then delete the set. Make this idempotent for retry/race handling.
4. The notifier currently catches errors and continues. Do not make the database transaction depend on WebSocket/Expo delivery. To avoid a committed ride with a silently lost removal event, record a post-commit dispatch event/outbox or use a bounded retry queue and rely on scheduled REST reconciliation. At minimum log and count failed fan-out; the periodic client refresh remains a recovery mechanism.
5. Change notification copy to the accepted product behavior: “Open Cabzone to view the request.” A push should carry only `type`, `rideId`, `rideVersion`, `expiresAt`; fetch all details after opening.

### 4.3 Make Expo push production usable

1. Replace the process-local token `Map` in `expoPush.service.ts` with a persistent store keyed by installation/device ID and associated authenticated driver user ID. Store token, platform, last-seen time, permission state if reported, and invalidation time. Add a unique token index; transferring a token to a new logged-in account must detach it from the old one. Use existing repository conventions. Do not store a service-account private key in this collection.
2. Keep POST/DELETE `/api/v1/driver/push-token`, but validate the token and installation ID, enforce the authenticated user, and make both commands idempotent. DELETE should remove only that user's installation/token. Clear token association on logout/session revocation where possible.
3. Send a short `ttl` based on the offer's remaining lifetime (seconds, never negative). If the offer has expired, do not send. A notification delivered after expiry is still possible; tap handling must resync. Use the `ride-offers` Android channel and high priority only for time-sensitive visible ride offers, subject to Android/FCM limits.
4. Parse Expo push **tickets**, store successful ticket IDs, fetch **receipts** later, and remove tokens for `DeviceNotRegistered`. Log transient rejection and retry with bounded backoff, respecting Expo limits. HTTP 200 alone is not delivery proof. Do not log full device tokens or PII.
5. Instrument counts: candidate drivers, socket recipients, push attempted/accepted/failed, ticket/receipt error classes, expired-before-send, offer accepted, stale-offer taps. Add `rideId` and request/event IDs to structured logs without OTP or credentials.

### 4.4 Presence and Redis dependency

1. Keep `UpdateDriverLocationUseCase` and `RedisPresenceRepository` as the single place where fresh location makes a driver discoverable. Confirm set-status and offer-eligibility checks use the same approval, vehicle, wallet and active-ride rules.
2. On foreground → background, do not instantly mark offline merely because the WebSocket closes. Background tracking may remain valid; apply a defined presence lease and location freshness rule. With the current 60-second max location age and 120-second Redis hash TTL, dispatch should stop using a killed driver's last position after **at most 60 seconds** under the existing query rule, even though the key may remain another minute. Verify this in tests.
3. On app process death, no exact client callback is guaranteed. Use server timeouts, not a claim of immediate detection. On offline, stop offering; if an active ride exists, keep the ride independently recoverable and its required location/communication policy intact.
4. Redis unavailability is a dispatch dependency, regardless of the WebSocket hub's local fallback. Surface it in health/eligibility and disable new dispatch safely rather than implying realtime availability is healthy.

## 5. Driver mobile implementation instructions (Expo SDK 57)

### 5.1 WebSocket client and app state

Add `apps/driver-mobile/src/services/realtime.ts` (or the existing service convention) as **one** authenticated connection per logged-in app session. Construct its URL from the existing API base URL, changing `http(s)` to `ws(s)` and appending `/ws`; do not hard-code a LAN address. Use the current authenticated token path, with the security caveat in 4.1. On `connection.ready`, reconnect, app resume, token refresh, and network restoration, call the authoritative REST reads before trusting queued events. Use capped exponential backoff with jitter; stop retries on logout/revocation. Clean up listeners/sockets when the auth identity changes.

Parse envelopes at the boundary. Ignore unknown events without crashing. Deduplicate by `eventId` for a bounded in-memory window and ignore an older `rideVersion` for the same ride. A WebSocket “connected” icon must not imply online eligibility. If a socket drops, show reconnecting and continue the existing bounded offer poll as a fallback; reduce or stop frequent polling once socket delivery and resync are proven. Avoid multiple concurrent polling loops in `ride-context.tsx`.

Wire `ride-context.tsx` to upsert/remove offers and refresh the active ride in response to known events. On `ride.offer.taken` or expiry, dismiss the offer sheet; if an Accept is in flight, wait for the REST response and then reconcile. The first successful server response wins. Keep all lifecycle commands in the existing REST API service. On `ride.driver.assigned`, fetch/open the active ride rather than constructing it solely from the event. On stale/unknown event data, refetch.

### 5.2 Push registration, foreground behavior and tap recovery

1. Keep `setNotificationChannelAsync` before permission/token requests on Android. In `push-notifications.ts`, use the SDK 57 `getExpoPushTokenAsync({ projectId })` path and make registration errors visible to diagnostics/telemetry instead of swallowing them. Permission denied must not falsely show “notifications ready.”
2. Register the token with `/api/v1/driver/push-token` only for the authenticated driver, carrying an installation ID. Listen with `Notifications.addPushTokenListener` for token rollover, update the backend and remove the listener on cleanup. Re-register after session restoration or backend restart as a safety net.
3. In the root Expo Router layout/provider, add `Notifications.addNotificationResponseReceivedListener` for taps and read `Notifications.getLastNotificationResponse()` for cold starts. Accept only recognized `type`/`rideId` values; open the relevant route **after** auth restoration and a REST read. If no offer remains, display “Ride no longer available” and return to Home. Prevent handling the same response twice.
4. If foreground WebSocket is active, avoid also presenting a duplicate foreground push offer banner. Keep app-visible notification behavior for other urgent account events as product policy defines. Notification permission denial should leave foreground WebSocket/REST behavior intact.
5. On logout, unregister this installation's token and remove notification/socket subscriptions. On account switch, never route an old user's notification into the new account.

Remote push on Android is **not testable in Expo Go** for this SDK; use an Android development build and a physical device. Configure `expo-notifications` through the app config plugin, an EAS project ID, Android Firebase `google-services.json` via `expo.android.googleServicesFile`, and FCM v1 service-account credentials through EAS. Commit only a safe config-file reference; keep credential JSON outside git. Regenerate the development build after native config changes. Verify exact SDK-57 options against the linked docs below before editing `app.json`.

### 5.3 Background location

Keep the existing foreground REST update path in `duty-context.tsx` initially. Define an `expo-task-manager` task at module scope and start it with `expo-location` `startLocationUpdatesAsync` only after approved online status and the required foreground/background permissions. Configure an Android foreground service with a truthful persistent notification and the needed SDK-57 app-config permissions. Request foreground permission first, explain the need for background tracking, then request background permission; on Android 11+ this may move the user into system settings. If permission is refused, show the actual restriction and obey backend online/dispatch policy. Do not silently use the development-only simulated Siliguri coordinates in production.

Use ~3–4 seconds as a foreground target and ~15–20 seconds as a background target where supported, with distance/accuracy filtering and a single-flight upload. During an active ride, maintain the required tracking even if the driver requests offline, until the ride is resolved under backend rules. Stop background updates when offline with no active ride. On process restart, read server status and current ride before starting/stopping the task; never assume local booleans are authoritative. Test battery saver, location disabled, permission revocation and app swipe-away on a physical Android device.

## 6. Delivery and recovery sequences

### Foreground offer

1. Driver is approved, online, GPS fresh and WebSocket authenticated.
2. Backend creates an offer, computes eligible candidates, records candidate membership and publishes `ride.offer.created`.
3. Driver app renders the server fare/expiry and may fetch the current offer list to confirm.
4. Driver POSTs the existing REST accept command. The database's atomic claim returns success or an already-taken/expired result.
5. Backend sends assignment to winner and closure to losing candidates. Apps reconcile with REST on errors or missed events.

### Background offer

1. Server sees an eligible driver with no current foreground socket lease and an active push token for that installation.
2. Expo Push accepts a short-lived visible notification for Android/FCM; ticket and receipt are checked asynchronously.
3. Driver taps; app restores auth, fetches `GET /api/v1/driver/offers` plus active ride/status, reconnects WebSocket, and opens an offer **only if still present**.
4. A late/expired/taken notification opens Home with a clear message, never an enabled Accept button.

### Disconnect or killed process

1. Socket disconnect does not cancel a ride. Server stops treating stale locations as dispatchable by age/lease policy.
2. Push can alert but has no delivery-time guarantee. Active-ride and availability data persist server-side.
3. On restart, restore auth; fetch driver status, active ride, offers, wallet if needed; discard local stale offer state; reconnect. Do not replay an accept/start/complete command automatically unless the existing command has an idempotency key and the server says it is safe.

## 7. Security, failure cases and acceptance tests

Implement automated tests around the existing use cases and notifier seams, then run physical-device tests. The minimum matrix is:

| Case | Required assertion |
|---|---|
| Two eligible drivers accept at once | Exactly one database assignment; winner sees active ride; loser sees taken/expired outcome; no duplicate commission or transition. |
| Offer accepted / expired / cancelled | All candidate offer views eventually remove it, including drivers on different API instances. |
| Background push arrives late | App re-reads server; cannot accept a closed offer. |
| Socket drops during Accept | REST response or reconnect resync resolves winner; no local optimistic assignment. |
| Duplicate/out-of-order events | `eventId`/`rideVersion` prevents regression; REST wins on conflict. |
| Push token rotates / device logs out / account switches | Old mapping cannot notify wrong account; new token works; invalid token removed after receipt. |
| API restart / multiple replicas | Persistent tokens and candidate membership survive; Redis fan-out reaches connected target on other replica. |
| Redis unavailable | New dispatch safely blocked/visible as unhealthy; no false “online and receiving rides.” |
| Permission revoked or stale GPS | Driver becomes non-dispatchable and sees actionable reason. |
| App killed during active trip | On restart, active ride and next legal action are restored from server. |
| Notification tapped from cold start | Route waits for auth and REST resync; no duplicate navigation. |
| Android background location | Physical-device foreground-service notification appears; updates cease appropriately when offline/no active ride. |

Test the current 60-second location freshness behavior using an injected clock. Test Expo ticket/receipt parsing with fake HTTP responses, including `DeviceNotRegistered`, transient errors and malformed responses. Log delivery failures without logging access tokens, notification tokens, private credentials, rider phone numbers or OTP. Verify push content on a locked screen does not expose sensitive trip details.

## 8. Implementation order and completion gate

1. **Shared event contracts + server offer closure:** typed schemas, candidate membership, taken/expiry/cancel fan-out, tests. This fixes stale offers even before mobile WebSocket wiring.
2. **Mobile socket + reconciliation:** one connection, auth lifecycle, event handling, REST resync, reconnect and fallback poll. Prove foreground offer → accept → loser removal on two devices.
3. **Persistent push delivery:** device-scoped tokens, tickets/receipts, TTL and foreground suppression. Configure EAS/FCM and verify background/cold-start taps with an Android development build.
4. **Background location and presence policy:** permissions, foreground service, leases, stale exclusion, active-ride recovery. Verify physical device and Redis outage behavior.
5. **Observability and release check:** multi-replica test, metrics, push receipts, duplicate/race tests and a complete driver → offer → trip → commission vertical slice.

Call this hybrid complete only when an eligible foreground driver gets live offers; an eligible background driver can be alerted; stale pushes and losing offers cannot be accepted; killed/reconnected apps restore server state; location freshness controls dispatch; and backend ride/ledger behavior remains authoritative. Push delivery itself is not guaranteed, so operational monitoring and REST recovery remain necessary.

## 9. Primary documentation consulted

- [Expo SDK 57 notifications API](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/) — token acquisition, token listener, Android channels and notification response handling.
- [Expo push overview](https://docs.expo.dev/push-notifications/overview/) — Expo Push routing through FCM on Android and APNs on iOS.
- [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/) and [FCM credentials](https://docs.expo.dev/push-notifications/fcm-credentials/) — development builds and credential configuration.
- [Expo send notifications](https://docs.expo.dev/push-notifications/sending-notifications/) — tickets, receipts, TTL and invalid-token cleanup.
- [Expo receive notifications](https://docs.expo.dev/push-notifications/receiving-notifications/) — foreground receipt and notification-tap routing.
- [Expo SDK 57 location API](https://docs.expo.dev/versions/v57.0.0/sdk/location/) and [TaskManager API](https://docs.expo.dev/versions/v57.0.0/sdk/task-manager/) — background tasks, Android foreground service and permission limits.
- [Firebase Android message priority](https://firebase.google.com/docs/cloud-messaging/android-message-priority) — high-priority messages are for time-sensitive, user-visible alerts and remain subject to platform behavior.

The project architecture PDF was described in the conversation but its binary was not present in this workspace; the planned intervals and hybrid decision here reflect that supplied description. Repository-state observations above should be rechecked immediately before implementation because development is ongoing.
