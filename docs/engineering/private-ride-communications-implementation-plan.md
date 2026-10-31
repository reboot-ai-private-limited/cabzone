# Private ride calls and short chat — implementation plan

Prepared: 30 October 2026. Status: plan only; implementation is not authorized by this document.

User direction: use Ponytail, keep the UI simple, prevent rider/driver number sharing, and prepare the full plan without changing application code. This document contains both the design and its ordered task checklist. It supersedes the preliminary [capability map](../../CAPABILITY-MAP-ride-communications.md) for implementation detail. Existing `tasks/plan.md` and `tasks/todo.md` belong to staging work and are not replaced.

## 1. Outcome and limits

Add two actions to the existing active-ride screen: **Call** and **Chat**. Only the booking rider and assigned driver may use them for that ride. Cabzonee must not supply either person's phone number to the other party or expose it through another account's API responses.

Deliver:

- Private internet audio with incoming ringing, answer, decline, mute, speaker and end.
- Short text messages, quick replies, timestamps, sending/failed status and retry.
- Reliable recovery after reconnect or relaunch, with server-owned authorization and state.
- Removal of phone exposure from ride APIs, both mobile apps, notifications, receipts and administrative rider/driver views.

Leave out: video, attachments, voice notes, typing indicators, read receipts, contact lists, group chat, editable/deletable messages, a separate inbox, call recording, transcription, AI moderation, masked SIM/PSTN fallback and a new admin chat viewer.

Privacy means the platform does not automatically disclose numbers. It cannot guarantee that someone will not voluntarily type or speak a number. Do not market this as preventing all voluntary disclosure. Account authentication and the SMS provider still require server-side phone data; users can see their own number. Identity-document images can themselves contain personal information: existing authorized KYC review is a separate sensitive-data surface, not something removing JSON fields can make anonymous.

## 2. Product rules

| Rule | Planned behavior |
| --- | --- |
| Eligible statuses | `DRIVER_ASSIGNED`, `DRIVER_EN_ROUTE`, `DRIVER_ARRIVED`, `TRIP_STARTED` only |
| Before assignment | No chat/call access for candidate drivers |
| End of access | Close calls and deny chat reads/sends at `TRIP_COMPLETED`, cancellation, expiry or any other ineligible status |
| Payment issues | Use existing support after completion; do not keep personal communication open indefinitely |
| Booking for someone else | Communication belongs to the authenticated booker; never derive an account or dial target from the passenger phone field |
| Text | Trimmed plain text, 1–300 Unicode code points; no HTML or automatically clickable phone/link content |
| Quick replies | Rider: “I’m at pickup”, “Please wait”, “Where are you?” Driver: “I’ve arrived”, “Arriving shortly”, “Please come to pickup” |
| Ringing | 30 seconds, server deadline; late answers rejected |
| Joining after answer | 20 seconds to establish both audio participants, then fail visibly |
| Concurrent calls | One live call per user; one live call per ride; simultaneous calls resolve to the existing call, not two rooms |
| Rate limits | Starting defaults: 20 messages/minute/user and 3 new call attempts/minute/user, shared across API replicas |
| Retention | Proposed default: message bodies and call metadata expire 24 hours after creation; no audio stored. Enforce expiry on reads as well as database TTL cleanup |
| App unavailable | Show “Couldn’t connect. Try chat.” Never show or dial a real number as fallback |

The time/rate/retention values are proposed implementation defaults, not existing product decisions. Keep them in one small policy file; no admin configuration screen. Record the selected retention in the privacy notice before release, including backup retention. If booking for a guest must support the guest directly, that is a later authenticated guest-access feature.

## 3. Reuse the existing system

| Existing code | Use |
| --- | --- |
| `apps/api/src/modules/rides/` | Communication authorization, message/call use cases and REST routes within the existing module |
| `packages/contracts/src/rides.ts` and package exports | Public DTOs and event contracts; remove outward-facing phone fields without removing private identity storage |
| `apps/api/src/shared/realtime/realtimeHub.ts` | Existing authenticated per-user delivery and Redis cross-replica fan-out |
| `apps/api/src/modules/dispatch/application/rideRealtimeNotifier.ts` | Existing participant lookup and lifecycle notification patterns |
| Dispatch push token/receipt stores and `expoPush.service.ts` | Ordinary chat alerts and existing notification delivery behavior |
| Existing Mongo repositories and `UnitOfWorkPort` | Durable records, transactions and race protection |
| Existing BullMQ worker | Ring expiry, bounded notification retry and call cleanup/reconciliation |
| Each app's `services/api.ts`, `context/ride-context.tsx`, root layout and push handlers | Auth refresh, reconnect/relaunch sync and app-wide incoming-call handling |

Do not add a microservice, second database, Socket.IO, chat SaaS, event bus, general conversation framework or new UI library. Chat writes remain REST requests, matching the existing rule that WebSockets only deliver updates. Keep the current directory/layer conventions; no generic repository or provider-selection framework.

Use one concrete voice integration: **LiveKit Cloud**, subject to a small compatibility proof before implementation expands. Audio stays out of Express/WebSockets. Chat remains in Cabzonee so it works without an audio room.

LiveKit's [Expo guide](https://docs.livekit.io/transport/sdk-platforms/expo/) requires native SDK/config-plugin integration and a development build; Expo Go cannot validate this. Use the current official package set and pin compatible versions after checking this repo's Expo 58 / React Native 0.88 / React 19.3 combination. Do not silently downgrade the app stack.

Use `livekit-server-sdk` on the API, the documented LiveKit React Native packages/plugins in both apps, and a native call bridge only for the required OS call behavior. A small concrete audio-provider boundary is justified for credential isolation and tests; multiple interchangeable providers are not.

## 4. Simple UI

### Active ride

Keep the current rider/driver identity card, map and ride controls. Replace its direct phone action with two compact labelled buttons: **Call** and **Chat**. Use existing colors, type, spacing, icons and buttons. Add no tab or dashboard.

```
Priya · Your rider          [ Call ] [ Chat • ]
```

The dot means a newly received message in this session; no server read-receipt system. Clear it on opening chat. Do not promise cross-device unread counts.

### Chat

One normal screen opened from the ride: back button, counterpart first/display name, Call action, plain bubbles and timestamps, three quick-reply chips, single composer and Send. Use a virtualized list and keyboard-safe layout. Load the latest 30 messages; older messages load only when requested by scrolling. Display a failed outgoing bubble with **Retry**. Clear in-memory message data on logout, account switch or ride closure.

Do not prefill numbers or turn typed numbers into dial links. No typing/read indicators or decorative animation. While driving, prioritize voice and quick replies; do not demand typing to continue the trip.

### Call

One compact call screen: display name, status/duration and three controls: **Mute**, **Speaker**, **End**. Incoming state has **Accept** and **Decline**. Returning to the ride leaves a small “Return to call” strip. Maintain one audio session at app level so navigation does not drop a call or start a second microphone stream.

Request microphone access when starting/answering, with a clear denied-permission state and settings link. Support screen readers, labelled controls, large touch targets, font scaling, safe areas and accessible contrast. The timer starts when both sides have connected audio, not on the initial request.

## 5. Close the phone-number exposure at the source

Confirmed starting points:

- `rides.presenter.ts` returns `passenger.phoneE164` and enriched `assignedDriver.phoneE164`.
- `RideAssignedDriverDto` and `RideDto.passenger` require phone numbers today.
- Driver `(driver)/ride/[rideId].tsx` opens the passenger's `tel:` URL.
- Rider `components/ride/ongoing-ride-view.tsx` and `(rider)/ride/[rideId].tsx` dial the driver; `formatAssignedDriverSummary` propagates the number.
- Admin driver/rider tables, detail/KYC screens, finance contracts and simulator paths also consume phone fields.

Implementation inventory must search every reference before editing. Separate private identity/booking input types from outward-facing ride and admin DTOs. Use explicit field selection, not object spreading followed by client-side hiding. Remove raw phone fields from other-account responses; use display names, profile IDs and vehicle registration for operational identification. Update admin search, copy actions, headings and fixtures accordingly. Do not leave raw numbers in hidden table columns, HTML, query caches or CSV exports.

Review offers, ride detail/list/history, command responses, disputes, earnings, wallets, realtime payloads, push payloads, receipt HTML/PDFs, share-trip content, error messages and logs. Include document URLs/filenames and payment/UPI identifiers in the privacy audit: a phone-number-based UPI address can undermine the promise. If an external payment receipt exposes one, report and remove that disclosure from the supported flow before claiming privacy completion.

Keep the user's own profile and authentication inputs functional. Preserve emergency-contact and emergency-service dialing. Do not delete historical identity or financial records. No new general-purpose “reveal phone” admin endpoint. If operations later needs exceptional access, require a separately specified audited permission rather than silently retaining the current exposure.

## 6. API and authorization

Use the existing success/error envelope and authentication middleware. Resolve actor profile IDs from the verified session; never accept sender, recipient, role, room or participant identity from the request body.

One shared authorization function loads the ride and permits only its `bookerRiderId` or assigned `driverId`, checks active account status and the communication status allowlist. No admin bypass for chat/audio. Return a generic not-found/forbidden result for unrelated accounts without revealing counterpart data.

Proposed routes under `/api/v1/rides/:rideId`:

| Method/path | Input | Result |
| --- | --- | --- |
| `GET /communication` | None | Eligibility/reason and current call summary; no token |
| `GET /messages` | Validated older/newer cursor, bounded limit | Ordered message DTOs and continuation cursor |
| `POST /messages` | `clientMessageId`, `text` | Canonical saved message; same retry returns the same record |
| `POST /calls` | `clientRequestId` | New/current ringing call; no audio credentials yet |
| `POST /calls/:callId/answer` | None | Callee accepts; first valid installation wins |
| `POST /calls/:callId/decline` | None | Callee declines |
| `POST /calls/:callId/end` | None | Caller cancels ringing or either participant ends accepted call |
| `POST /calls/:callId/token` | Authenticated installation binding | Short-lived credentials for that authorized accepted session only |

Add a separate signature-verified provider webhook route for room/participant lifecycle, following existing raw-body webhook conventions. Rate-limit endpoints using existing shared infrastructure. All call routes check `call.rideId` matches the route and authenticated participants match current assignment.

Stable errors: `COMMUNICATION_CLOSED`, `MESSAGE_TOO_LONG`, `COMMUNICATION_RATE_LIMITED`, `CALL_BUSY`, `CALL_EXPIRED`, `CALL_UNAVAILABLE`, `CALL_ALREADY_ANSWERED` and the existing idempotency-conflict pattern. Respect existing HTTP status conventions and `Retry-After`; avoid exposing internal provider errors.

## 7. Minimal persistence and concurrency

Add two collections using current Mongo/repository patterns:

**Ride messages:** ID, ride ID, sender user ID, sender role, client message ID, sequence, text, created-at and expires-at. Unique `(rideId, senderUserId, clientMessageId)`; unique `(rideId, sequence)`; TTL on expires-at. Public DTO contains ID, ride ID, sender role, sequence, text and timestamp, not phone/contact records.

**Ride calls:** ID, ride ID, caller/callee user IDs, initiating installation, answering installation, client request ID, opaque room/participant IDs, state, version, ringing/join deadlines, timestamps, end reason, cleanup-needed marker and expires-at. Unique caller/request key; partial unique active-ride index. Reserve active participants with a unique multikey index on an active-user-ID array, cleared on terminal transition, to prevent a user appearing in two calls. Confirm index behavior in Mongo concurrency tests before use. Expiry is an application transition; TTL is only eventual record deletion.

Use the existing ride version/transaction mechanism to serialize communication authorization with trip completion/cancellation. A read-only check followed by an independent insert is insufficient. A conditional ride update in the same transaction provides the write conflict; allocate message sequence atomically there. Reuse the repository's version conventions and bounded retry behavior. Verify this does not overwrite concurrent pricing/extension/lifecycle updates.

Retries reuse the original client ID; changing text under the same ID fails. New attempts get new IDs. The UI never generates a new ID merely because the server response timed out. Sequenced catch-up prevents duplicate/reordered socket events or pagination boundaries from losing messages.

Call state: `RINGING -> ACCEPTED -> CONNECTED -> ENDED`, with terminal `DECLINED`, `MISSED`, `CANCELLED`, `FAILED`. Use conditional version/state updates, not last-write-wins. Ring/answer/end races and repeated provider events must be idempotent. Records are authoritative; delayed jobs always reread state before acting.

## 8. Chat delivery and recovery

1. Client submits text through REST; API validates and persists atomically.
2. Return the canonical message to the sender, then publish `ride.chat.message` to both participants using existing per-user delivery.
3. A socket event contains ride ID and message sequence/ID; fetch authorized data when needed. Do not broadcast chat to offer candidates or admin sockets.
4. Use a generic background alert: “New ride message”. Payload has IDs only; no message body or phone number.
5. On reconnect, app resume or opening chat, fetch messages after the last known sequence and paginate until caught up. Merge by ID. Failed socket/push delivery cannot erase persisted messages.
6. With chat open and socket disconnected, use a bounded slow REST recovery interval; stop it on close/background. Reuse the current reconnect machinery.

Do not add a general outbox framework just for chat. Existing push retry/receipt handling plus persisted REST recovery is the first version. Treat delivery as best effort and do not show “delivered” without evidence. A failed send remains explicitly retryable; do not silently queue unlimited messages offline.

## 9. Voice media, credentials and closure

Persist a call before sending invitations. Invite by internal user/install IDs, never phone numbers. Generate one random room name per call and two opaque participant IDs. Admit no more than two participants, bind the caller/callee to their selected installations and prevent a second device from taking over after acceptance.

Issue audio credentials only after the callee answers. Restrict grants to the exact room, microphone publishing and subscription; disable camera, screen sharing, data publishing, metadata changes, recording and moderation. Keep secrets on the API. Tokens must not appear in URLs, push, logs or persistent mobile storage. Proposed join-token lifetime: two minutes.

The SDK handles media transport/reconnect; Cabzonee owns invitation/answer/end policy. Signed provider callbacks update connected/ended state, deduplicated against current call version. A failed room connection reports failure and releases the active-call reservation. Reconnect is allowed only for the same still-active call; never create an unsolicited replacement call.

**Important provider constraint:** token expiry alone does not terminate connected/reconnecting media. LiveKit Cloud documents revocation through participant removal; strict revocation needs an explicit cutoff, and token lifetimes must fit its revocation window. Use that path and verify cached/refreshed-token rejection on the actual chosen SDK. Self-hosting has different revocation behavior, so it is not a drop-in fallback. See [token lifecycle and revocation](https://docs.livekit.io/frontends/reference/tokens-grants/).

On end/ride closure/logout/revoked session: deny new tokens, atomically terminate call state, stop local audio, remove both provider participants with strict revocation, then close the room. Serialize token issuance against call end; a token returned during a race must not outlive revocation. Test this explicitly.

Mark external cleanup pending durably and retry it with the existing worker. Scan for stale accepted/connected calls and missed expiry jobs, including after worker restart. Provider failure must not roll back ride completion. Alert on unresolved media cleanup; do not claim instantaneous remote shutdown while the provider is unreachable. A terminal room must not be reusable with cached tokens. Finish closure verification before enabling calls in staging.

## 10. Incoming calls when the app is not open

LiveKit transports audio; it does not replace native incoming-call integration. Use [React Native CallKeep](https://github.com/react-native-webrtc/react-native-callkeep) for system call UI, with compatibility verified against this repo's native stack. Display a generic opaque handle such as the call ID and “Cabzone rider/driver”; never populate the OS call log with a real number.

- **Android:** native incoming-call presentation through ConnectionService/Telecom and a call notification, with approved microphone/foreground-service behavior. Add direct high-priority FCM call invitation handling where required for background/terminated delivery; ordinary Expo notification handling is not proof of native ringing. Use `@react-native-firebase/app` / `messaging` only if the compatibility proof confirms this integration path. Respect OS notification/full-screen restrictions; no guaranteed bypass of user settings or Force Stop.
- **iOS:** CallKit plus APNs VoIP/PushKit handling for genuine incoming calls. Report and clear calls through the native lifecycle, not a JavaScript-only listener. Add the maintained PushKit bridge/configuration validated in the native proof; APNs VoIP credentials and a physical iPhone are required for iOS release qualification.
- Extend the existing installation token store with explicit transport/platform type for native call tokens, rather than a new device registry. Rebind on login/account switch and remove on logout/token invalidation. Native tokens are not interchangeable with Expo push tokens.
- Push carries call ID, ride ID and expiry only. On answer, authenticate and revalidate before joining. Late/duplicate invitations and calls ended elsewhere must clear their ringing UI. No new call after expiry just because an old push arrived.
- Use one narrow call-invitation sender alongside existing Expo chat notifications. Add provider credentials only for the transports actually shipped.

The native proof must identify exact working package versions and platform configuration before finalizing dependency additions. Use Expo config plugins and generated native projects; do not hand-maintain generated `android/` or `ios/` folders. Android and iOS each need their own pass record; Android success does not qualify iOS.

## 11. Ordered implementation checklist

All tasks below are **pending**. Do them sequentially; no parallel-agent requirement. Group file paths below denote separate small patches where needed, not permission for a single giant rewrite. Keep each patch around 3–5 source/test files, except unavoidable atomic contract/caller migrations.

| ID | Work and likely files | Depends on | Acceptance and verification |
| --- | --- | --- | --- |
| P01 | Inventory number flows and document policy; contracts, presenters, identity/admin endpoints, mobile receipts and web consumers | None | Complete caller/export/fixture list; identify UPI/KYC privacy limits and guest booking behavior |
| P02 | Native proof: both mobile manifests/configs, isolated calling harness, voice integration notes | None | Two devices exchange audio, lock-screen answer works, microphone cleans up, strict token revocation works; record exact dependencies and costs before committing to provider |
| P03 | Shared communication policy/DTOs and authorization helper in rides | P01 | Status table, actor mapping, account suspension and unrelated/guest/candidate denial verified |
| P04 | Remove ride/offer phone outputs; contracts, ride presenter, enrichment and Swagger | P03 | REST/history/command responses never return counterpart phones; dedicated API regression checks |
| P05 | Update mobile call consumers, summaries, receipts and fixtures | P04 | No counterpart `tel:` path or hidden number; own/emergency calls remain correct; both apps typecheck |
| P06 | Remove other-account admin number outputs and update driver/rider/finance/simulator consumers | P01, P04 | Raw fields absent from network/export data; lookup works by IDs/names; admin workflows and tests pass |
| P07 | Message model/repository, sequenced send/list use cases and Mongo tests | P03 | Concurrent sends/retries/ride-close race produce correct ordered records with no duplicate sends |
| P08 | Chat routes/validation/rate limits, contract export and realtime/push integration | P07 | Participant-only delivery, bounded pages, safe push content and reconnect catch-up verified |
| P09 | Rider chat screen/client/context integration | P05, P08 | Send, quick reply, retry, paging, keyboard and closed-ride state work |
| P10 | Driver chat screen/client/context integration | P05, P08 | Same behavior; accessible quick replies and no disruption to ride controls |
| P11 | Call model/repository/state transitions and authenticated routes | P02, P03 | Two simultaneous callers produce one call; only callee answers; terminal/expired/replayed requests handled |
| P12 | LiveKit adapter, restricted credentials, signed webhooks and cleanup worker | P11 | Unauthorized token request denied; both tokens revoked on close; worker restart/provider failure recover safely |
| P13 | Native call-token registration and invitation sender | P02, P11 | Correct installation targeting; account switch/logout safe; expired pushes never join |
| P14 | Rider call session and simple call UI | P05, P12, P13 | Call/answer/decline/mute/speaker/end, navigation and permission errors verified |
| P15 | Driver call session and simple call UI | P05, P12, P13 | Same controls, stable GPS/ride state during calls and correct audio focus |
| P16 | Lifecycle cleanup and native background integration in both apps | P14, P15 | Completion/cancel/logout end audio; lock/background/relaunch and multi-device answer races verified |
| P17 | Combined privacy/security/device acceptance | P06, P09, P10, P16 | All matrix cases below have evidence; fixes followed by focused regression checks |
| P18 | Deployment settings, notices, documentation and rollback rehearsal | P17 | Compatible builds installed; secrets configured; no privacy rollback; support knows failure states |

Checkpoints: after P06, no automatic number exposure in the inspected supported surfaces; after P10, a complete recoverable chat; after P16, native voice end to end; after P18, feature ready for a controlled release with evidence. Intermediate missing voice configuration must show “Calling unavailable”, never fake success.

## 12. Tests and acceptance evidence

### Backend and privacy

- Unrelated users, unassigned candidates and admin sessions cannot read/send chat or join calls. Check every read/write/token route, including mismatched ride/call IDs.
- Expired/suspended sessions, changed assignment, terminal rides and stale deep links deny access. Booking for another passenger grants no guest account rights.
- Inspect serialized HTTP responses, WebSocket/push payloads, error logs and generated receipts using unique test numbers. Check privileged admin payloads separately. Self-profile and OTP functionality remain valid.
- Concurrent send retries create one message; same key/different body conflicts; sequences/cursors do not skip records. Test oversized text, Unicode, malformed cursors and shared rate limits.
- Race send/start/answer/token issuance against completion/cancellation; verify persisted state and provider cleanup. Test both parties calling at once and answering on two installations.
- Verify webhook signatures, replay/out-of-order handling, room identity binding, no media grants for strangers and rejection of old/refreshed tokens after closure.
- Restart API/worker during ring/end; recover deadlines and cleanup. Test Mongo/Redis/push/media outages with visible failures and no number fallback.
- Retention filters deny expired records before TTL deletion; cleanup does not delete ride or financial data.

### Device matrix

Before authoring mobile test scripts, follow the supplied ARTEMIS rules: run `adb devices -l`, ask for a device if selection is ambiguous, explore the actual installed apps through ARTEMIS, then author tests from observed selectors/transitions with explicit waits. On ARTEMIS failure call `mobile_diagnose` and follow its ordered remediation. Do not write assumed coordinate scripts or label unexecuted device scenarios as passed.

| Scenario | Required evidence |
| --- | --- |
| Rider calls driver and reverse | Two-way audio; expected identity; no phone in app or system call UI |
| Foreground, background, locked, process death | Incoming call behavior and answer/deadline handling on each supported OS |
| Force-stopped app | Honest unavailable/missed state; successful recovery after manual reopen |
| Permission denied/revoked | Clear recovery, no crash, no hidden microphone capture |
| Wi-Fi/mobile switch and temporary offline | Bounded reconnect, truthful UI and clean hang-up |
| Bluetooth/headset, speaker, mute, cellular interruption | Correct audio route/focus; no unintended unmute |
| Finish/cancel while chat/call is open | Composer closes, credentials denied, both media participants disconnected |
| Logout/account switch while ringing/connected | No old-account chat/call content or continuing audio |
| Chat send response lost/retry/relaunch | Exactly one stored message, correct retry state and catch-up |
| Screen reader, large text, keyboard, small phone | Controls remain labelled, visible and usable |

For iOS use the appropriate physical-device tooling/manual evidence alongside Android ARTEMIS; do not imply ARTEMIS qualifies iOS. Capture redacted evidence and inspect durable backend records. Do not make real calls/messages to uninvolved people.

### Commands to run during future implementation

Existing commands (not run as part of preparing this plan):

```powershell
pnpm --filter @cabzone/api typecheck
pnpm --filter @cabzone/api lint:deps
pnpm --filter @cabzone/api test
pnpm --filter @cabzone/api test:integration
pnpm --filter @cabzone/rider-mobile typecheck
pnpm --filter @cabzone/rider-mobile test
pnpm --filter @cabzone/driver-mobile typecheck
pnpm --filter @cabzone/driver-mobile test
pnpm --filter @cabzone/web test
pnpm exec turbo run typecheck lint test --force
pnpm build
adb devices -l
```

Run focused test files during each slice; run the final uncached workspace gate once after integration. Wire new mobile test files into the explicit package test lists. Build new signed native development/preview apps for both packages; OTA JavaScript or Expo Go is insufficient for new native calling code. Provider/device checks supplement unit tests rather than being replaced by them.

## 13. Release inputs and rollout

Required external inputs: LiveKit Cloud project/URL/server credentials and approved usage budget; matching EAS projects and installed native builds; Android FCM service credentials; iOS APNs VoIP credentials/entitlements for iOS release; two authorized test participants/devices; agreed retention/notice text. Configure secrets locally or in a secret manager, never chat or source control. Do not provision paid accounts while merely implementing code.

Proposed API settings: `RIDE_CHAT_ENABLED`, `RIDE_CALLS_ENABLED`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, plus only the native push credentials the chosen platform requires. Two feature switches allow chat to work during voice setup/outage. Keep policy constants in code; avoid more switches. The server reports availability and validates it on every command.

Deployment order:

1. Prove native compatibility and strict media closure, then finish implementation and tests.
2. Create the message/call indexes and worker jobs in controlled staging; validate unique indexes with fixture races.
3. Deploy the privacy-safe API and matching mobile/admin builds together. Old apps may lose their direct-call feature; do not preserve number exposure for backwards compatibility. Gate unsupported old versions if necessary.
4. Enable chat for controlled testers, then enable voice after provider/native acceptance passes.
5. Record failures by ride/call ID and error code only. Monitor missed invitations, join failures, cleanup backlog, rate limiting and usage cost through existing monitoring.
6. Roll back by disabling new chat/call actions and terminating calls; retain server-side number removal. Do not restore direct dialing or delete records to hide a failure.

Previously exposed numbers cannot be recalled from screenshots or already downloaded data. Clear managed local/query caches on the new version/logout and update privacy claims accordingly. If native compatibility or provider revocation fails, keep calls disabled and report the specific blocker; do not substitute an unverified foreground demo.

## 14. Completion criteria

- [ ] Both installed apps provide simple Call and Chat actions during eligible rides.
- [ ] No automatic counterpart number exposure across the supported API/UI/notification/receipt/admin surfaces.
- [ ] Chat survives reconnect/retry without duplicate or missing persisted messages.
- [ ] Calls work both directions, including qualified native background/lock-screen behavior.
- [ ] Closed rides, logout and revoked access deny new communication and end existing media.
- [ ] Uncached automated checks, Mongo race tests and platform device checks pass with recorded evidence.
- [ ] Credentials, retention, usage budget, monitoring and rollback are documented and configured.

Planning verification: repository interfaces and direct phone paths were inspected; official LiveKit and CallKeep references were checked. No application implementation, dependency installation, provider provisioning or device execution was performed for this document.
