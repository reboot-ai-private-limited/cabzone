# Private ride communication — execution phases

Source: [full implementation plan](private-ride-communications-implementation-plan.md).
Prepared: 30 October 2026. Status: Phases 1–6 complete; Phase 7 pending.
Work sequentially; check off only verified results.

## Phase 1 — Stop ride-response phone exposure (P01, P04, P05)

- [x] Inspect shared ride presenter, enrichment, DTOs and call consumers.
- [x] Omit passenger/driver phone numbers from ride responses.
- [x] Remove phone-derived driver display-name fallback.
- [x] Update public schema and safe handling of absent numbers.
- [x] Run focused privacy/API checks and workspace typechecks.

This first slice covers shared ride responses only. Identity/admin/payment
surfaces remain a separate privacy audit; no claim of complete privacy yet.
Existing direct-call controls become unavailable when a counterpart number is
absent, until the private communication UI replaces them.

## Phase 2 — Authorize communication (P03)

- [x] Share one participant/status policy across chat and calls.
- [x] Allow only the booker and assigned driver during the four approved statuses.
- [x] Cover unrelated accounts, candidate drivers, suspended users and closed rides.

The shared `RideCommunicationAccessUseCase` is available through the rides
container for the forthcoming chat/call use cases. `GET /api/v1/rides/:id/communication`
uses this gate now; success reports policy eligibility, not functioning chat/audio.
Later message writes and call commands must serialize this check with ride closure
inside their transactions; this read-only endpoint does not reserve access.

## Phase 3 — Deliver short chat (P07–P10)

- [x] Persist retry-safe ordered messages and bounded history.
- [x] Implement authenticated REST send/list and existing WebSocket delivery.
- [x] Add generic push alerts and reconnect catch-up.
- [x] Add simple rider and driver chat screens with quick replies and retry.
- [x] Verify duplicate sends, closure races, keyboard and recovery.

## Phase 4 — Prove native audio (P02)

- [x] Confirm working LiveKit/native call integration versions on the current stack.
- [x] Configure credentials locally; never place secrets in this checklist.
- [x] Prove two-way audio, locked-screen answer and strict token revocation.
- [x] Record Android and iOS evidence separately; no Expo Go qualification.

Do the native proof before investing in the full voice implementation. This
phase may run before chat if provider credentials become available sooner.

## Phase 5 — Implement private voice (P11–P16)

- [x] Persist atomic call state, busy reservations and deadlines.
- [x] Implement participant-only start/answer/decline/end/token endpoints.
- [x] Add restricted provider credentials, signed callbacks and cleanup retries.
- [x] Register installation-bound native push tokens and handle incoming calls.
- [x] Add compact Call/Accept/Decline/Mute/Speaker/End UI in both apps.
- [x] End media on ride completion, cancellation, logout and revoked access.

Implementation and automated checks are complete; live two-phone pickup-stage runtime
qualification runs in Phase 7. Calls stay disabled unless the API has `RIDE_CALL_ENABLED=true`
(or `RIDE_CALLS_ENABLED=true`) and all three LiveKit server settings. Push registration binds
both `EXPO` and native call (`FCM_CALL` / `APNS_VOIP`) tokens to `installationId`, while
`ExpoPushService.notify` filters strictly to `'EXPO'`.

## Phase 6 — Complete privacy coverage (P06)

- [x] Remove numbers from other-account admin/identity/finance outputs and exports.
- [x] Check offers, history, disputes, receipts, share links, logs and notifications.
- [x] Verify phone-based payment identifiers and document-related privacy limits.
- [x] Keep own-account authentication and emergency calling functional.

## Phase 7 — Acceptance and controlled release (P17–P18)

- [ ] Explore installed apps with ARTEMIS before authoring mobile UI tests.
- [ ] Verify full two-phone chat/call flow and background/network/permission cases.
- [ ] Run uncached checks, Mongo concurrency tests and production builds.
- [ ] Confirm retention, usage budget, monitoring and feature availability settings.
- [ ] Deploy matching API/native/admin builds; rollback never restores number sharing.

## Work log

- 30 October, Phase 6 completed:
  - Removed other-account phone numbers (`phoneE164`, `alternatePhone`, raw driver
    `emergencyContact`, and rider `emergencyContact.phoneE164`) from shared DTOs,
    OpenAPI schemas, repository/container lookups, and presenters across admin riders
    (`/v1/admin/riders*`), admin driver applications (`/v1/admin/driver-applications*`),
    admin staff (`/v1/admin/users*`), dispatch fleet (`/v1/admin/dispatch/fleet`), and
    wallets (`/v1/admin/wallets*`). Disabled phone-number search enumeration on admin
    rider, staff, and wallet directories while keeping operational lookup by name,
    email, account/profile IDs, DL number, and vehicle registration.
  - Replaced object-spread ride serialization in `toRideView` with explicit field
    selection, removed counterpart phone fallbacks and `tel:` dialing from web admin
    tables/modals/CSV exports and rider mobile (`[rideId].tsx`, `ongoing-ride-view.tsx`,
    `rider-helpers.ts`), and routed active-ride `Call Driver` buttons to `startPrivateCall`.
    Verified offers, trip history, disputes, PDF receipts, trip share payloads, and
    realtime/push notifications emit zero counterpart phone digits. Extended Pino
    `REDACTED_PATHS` to censor `phone_e164`, `alternatePhone`, `emergencyContact`,
    `destinationUpi`, `vpa`, and `contact` at root and nested paths.
  - Added `maskPhoneBasedUpi` (`adminWalletOperationView`) on `/v1/admin/wallets/cashouts`
    and `/v1/admin/wallets/cashouts/:id/resolve` so phone-derived handles (`>=7` digits
    before `@`) mask leading digits (`******0333@ybl`) while non-phone handles and the
    driver's own `/v1/driver/wallet/me/*` views remain intact. Added `scrubWebhookPayload`
    in `RideQrPaymentUseCase` to strip `contact`, `vpa`, `email`, and `customer_details`
    before persisting `payment_events` while computing `payloadHash` over raw `rawBody`.
    Verified private KYC storage keys (`driver-kyc/<uuid>.<ext>`) contain zero phone
    numbers, `FINANCE_ADMIN` receives `storageKey: 'REDACTED'` and `403` on preview, and
    only audited `SUPER_ADMIN` / `CITY_ADMIN` / `SUPPORT_ADMIN` KYC review streams short-lived
    document images (inherent physical-document boundary).
  - Preserved own-account OTP auth (`/v1/auth/otp/*`), admin login (`/v1/auth/admin/login`),
    admin creation input (`POST /v1/admin/users`), rider self profile & emergency-contact
    management + `tel:` dialing (`GET/PATCH /v1/riders/me`), driver self personal profile
    (`GET/POST /v1/driver/profile*`), booking guest phone input, and `tel:112` / support
    calling. No historical DB columns were deleted and no admin phone-reveal endpoint was added.
  - Verified with `privacy-coverage.test.ts` (5/5) + 9 API suites (95/95 tests),
    `@cabzone/contracts` typecheck, `@cabzone/api` typecheck + lint + depcruise,
    `@cabzone/web` typecheck + lint + test (60/60 including P06 CSV/source checks),
    `@cabzone/rider-mobile` typecheck + touched-file eslint + test (71/71), and
    `@cabzone/driver-mobile` typecheck + test (38/38).

- 30 October, Phase 5 completed:
  - Added Mongo-backed versioned call records (`ride_calls`), partial unique active
    ride (`one_active_call_per_ride`) and user (`one_active_call_per_user`) reservations,
    bounded 45s ringing / 30s join deadlines, 24h TTL + read-time retention, and durable
    cleanup retry state.
  - Added participant-only call endpoints (`start`, `current`, `answer`, `decline`, `end`,
    `endCurrent`, `connected`, `token`) with `RideCommunicationAccessUseCase` before
    installation checks, ride-closure transaction serialization, per-user start throttling
    (`6/min` with `Retry-After`), pre-answer `409` media-token denial, and signed LiveKit
    `application/webhook+json` handling. Participant tokens are microphone-only (`120s` TTL)
    with opaque identities; room cleanup revokes both participant tokens (`revokeTokenTs`)
    and retries via maintenance worker.
  - Extended installation push-token registration with `EXPO`, `FCM_CALL`, and `APNS_VOIP`
    transports keyed by `${installationId}:${transport}` and wired incoming-call WS,
    `RNCallKeep`, and `Notifications` action routing in both mobile apps.
  - Added app-level `<RideCallProvider>` compact call sheet + `"Return to call · mm:ss"`
    banner in both apps, chat-header `Call` button, mic-permission recovery, honest
    `"Couldn't connect. Try chat."` fallback, and immediate media teardown on ride
    completion, cancellation, logout, and revoked access; removed temporary Phase 4
    `voice-proof` routes.
  - Verified with `ride-calls-api.test.ts` (3/3), `ride-calls-mongo.test.ts` replica-set
    races (5/5), `ride-call.test.mjs` + `ride-chat-screen.test.mjs` + `ride-context.test.mjs`,
    and clean `typecheck` + `lint` + `test` across `@cabzone/api`, `@cabzone/rider-mobile`
    (71/71), and `@cabzone/driver-mobile` (38/38).

- 30 October, Phase 4 completed:
  - Verified pinned compatibility on Expo `~58.0.19` / React Native `0.88.0` / React `19.3.0`:
    `livekit-server-sdk@2.19.2` (API), `livekit-client@2.23.0`, `@livekit/react-native@3.1.0`,
    `@livekit/react-native-webrtc@150.1.1`, `@livekit/react-native-expo-plugin@1.1.0`,
    `react-native-callkeep@4.6.1`, `@config-plugins/react-native-callkeep@14.0.2`,
    `@config-plugins/react-native-webrtc@15.0.2`. Added short `.cxx` CMake staging
    paths in both `app.config.js` plugins so Windows Ninja native builds stay below
    `MAX_PATH`; clean standalone `arm64-v8a` release APKs built and installed on both
    physical Android devices (no Expo Go used).
  - Configured LiveKit Cloud server credentials exclusively in local gitignored `.env`
    (zero secrets in tracked files or checklists).
  - Android physical two-phone proof (`34bedf2c` Realme X2 Pro driver + `RZCY90S42YL`
    Samsung Galaxy A55 rider):
    - Locked-screen wakeup/answer: `RZCY90S42YL` confirmed asleep + locked before ring
      (`mWakefulness=Dozing`, `isKeyguardShowing=true`), woke over lockscreen
      (`mWakefulness=Awake`, `showWhenLocked="true"`, `turnScreenOn="true"`), and
      answered incoming call (`NO_CABZONE_CALL_LOG`, zero telephony/call-log permissions).
    - Two-way audio: LiveKit `listParticipants` confirmed `participantCount: 2`
      (`p_drv_d1fd143b4a21`, `p_rdr_e57998f45e7f`, both `ACTIVE` publishing unmuted
      `MICROPHONE` tracks, `Subscribed audio tracks: 1` on UI, `USAGE_VOICE_COMMUNICATION`
      48kHz AEC/NS sessions active in `dumpsys audio`, speaker/earpiece toggle verified).
    - Strict token revocation + mic release: `removeParticipant(..., { revokeTokenTs: now + 5 })`
      for both opaque identities followed by `deleteRoom` disconnected both clients,
      released both `AudioRecord` sessions (`RIDER_MIC_RELEASED`, `DRIVER_MIC_RELEASED`),
      and caused on-device `"Reconnect cached token"` replay before JWT `exp` to fail
      with `Status: revoked_rejected` (`invalid token: revoked`).
  - Platform qualification record:
    - Android: **PASSED** on physical two-phone standalone native builds (`34bedf2c`, `RZCY90S42YL`).
    - iOS: **NOT QUALIFIED ON THIS WINDOWS HOST** — `withInfoPlist` (`audio`, `voip`,
      `remote-notification`) and CallKeep config plugin are wired, but physical iPhone +
      macOS Xcode + APNs VoIP PushKit credentials are required before enabling iOS release.
- 30 October, Phase 3 completed:
  - Added `ride_messages` persistence (`RideChatModel`, Mongo/memory repos) with
    unique `(id)`, `(rideId, sequence)`, `(rideId, senderUserId, clientMessageId)`
    and 24-hour TTL indexes plus immediate read-time expiry filtering and 30-item
    bounded pages (`beforeSeq` / `afterSeq`).
  - Added conditional `allocateChatSequence` inside `MongoUnitOfWork` so chat writes
    serialize against ride closure/reassignment without incrementing `ride.version`
    or breaking pending mid-trip route extensions.
  - Added `POST/GET /api/v1/rides/:id/messages` with `RIDE_CHAT_ENABLED` switch,
    1–300 Unicode code-point validation, shared `MongoRateLimitStore` (`20/min`
    with `Retry-After`) and OpenAPI schemas.
  - Wired `ride.chat.message` participant-only WebSocket notifications (IDs/sequence
    only), foreground push suppression, generic 10-minute Expo push alerts
    (`"New ride message"`) and notification tap routing in both mobile apps.
  - Added rider (booker-only) and driver chat screens with role quick replies,
    `KeyboardAvoidingView`, `selectable={false}` bubbles, exact-`clientMessageId`
    retry, mid-fetch `afterSeq` catch-up, 15s disconnected-only fallback poll,
    unread dot indicators and immediate memory wipe on ride closure/revoked access.
  - Verified Mongo concurrency/closure races/TTL (`ride-chat-mongo.test.ts`, 5/5),
    API/realtime/push privacy (`rides-api.test.ts`, `dispatch-realtime.test.ts`),
    and mobile chat/context suites. Final `pnpm exec turbo run typecheck lint test --force`
    passed 20/20 uncached tasks (63 API files / 507 tests, 69 rider tests, 39 driver
    tests). Live two-phone pickup-stage UI execution remains scheduled for Phase 7.
- 30 October, Phase 2 completed:
  - Added the shared four-status communication contract and access use case.
    Identity/profile resolution comes from the authenticated user, not client input.
  - Booker and current assigned driver only; guest passengers and all admin roles
    have no communication bypass. Missing/unrelated rides return generic 404;
    closed/unassigned rides return 409 to an otherwise authorized participant.
  - Production wiring rechecks current verified/active user state and active driver
    profile state. Inactive accounts return 403; missing identity-check wiring fails
    closed. Existing session middleware still rejects missing/revoked/expired sessions.
  - Added authenticated eligibility endpoint and OpenAPI documentation without
    contact fields or credentials. No chat/call UI or provider dependency added.
  - Regression tests cover all 13 ride statuses for both participants, guest/candidate/
    unrelated/admin denial, inactive-account recovery, reassignment and missing wiring.
    Updated two finance router fixtures for the required endpoint handler.
  - Red/green authorization test verified; targeted 3-file rerun passed 29 tests.
    Final `pnpm exec turbo run typecheck lint test --force` passed 20/20 tasks,
    including 498 API tests across 62 files. Existing lint/Turbo warnings remain.
  - ARTEMIS rider hierarchy was inspected before test changes; no mobile UI tests
    or device mutations were added for this backend-only phase.
- 30 October, Phase 1 completed after renewed implementation authorization:
  - Shared ride presenter omits passenger/assigned-driver phone fields; private
    stored booking inputs remain unchanged. Driver enrichment no longer fetches
    a phone or derives a fallback display name from its suffix.
  - OpenAPI omits those public fields. Shared TypeScript fields are optional for
    legacy fixtures/clients, while the server never emits them in ride responses.
  - Rider passenger identity labels use profile IDs instead of phone comparison;
    ride/admin/simulator passenger displays no longer expect a phone.
    Existing mobile guards hide direct-call controls when numbers are absent.
  - Added API regression coverage for creation, assignment, detail and list
    responses for rider/driver/admin, plus preservation of stored booking data.
    Rider component/helper tests cover absent contact data.
  - Red/green privacy regression verified. Fresh affected-app typechecks passed.
    `pnpm exec turbo run typecheck lint test --force`: 20/20 tasks passed uncached,
    including all 62 API test files and both mobile unit suites. Existing lint
    warnings and Turbo test-output configuration warnings remain.
  - ARTEMIS observed both installed apps at payment screens before test changes;
    no calls or payments were initiated. Pickup-stage device acceptance is still
    pending; this is not a full phone-privacy or native-calling qualification.
- 30 October: checklist created. Initial code edits were undone at the user's
  request to keep that earlier turn planning-only; Phase 1 was subsequently authorized.
- ARTEMIS device assignment: Realme `34bedf2c` = driver; Samsung `RZCY90S42YL` = rider.
- Device exploration traces: driver `0d8fdcb0-5f1e-4849-b943-069f4d861a58`,
  rider `f54ff6e2-2cae-408b-9a3a-1db08eceb500`.
- Preserve pre-existing uncommitted mobile/push changes; do not overwrite them.
