# Private ride communication: capability map

Status: proposed for user review, 30 October 2026. No implementation yet.

## Requested outcome

Rider and driver can call inside Cabzonee and exchange short ride messages
without Cabzonee sharing either person's phone number with another account.
This request brings calling/chat into scope despite the earlier D-042 deferral.

| Module id | Responsibility | Depends on |
| --- | --- | --- |
| ride-contact-access | Authorize only the booking rider and assigned driver for an active ride; define communication expiry and remove counterpart numbers from outward-facing contracts and payloads. | Existing identity and rides |
| ride-chat | Short text messages, quick replies, persisted history, bounded paging, retry-safe sends, realtime updates and private notification alerts. | ride-contact-access |
| ride-voice | Private audio sessions, incoming call/accept/decline/end, microphone permission, mute/speaker, call expiry and lifecycle cleanup. | ride-contact-access |

Build order: ride-contact-access, then ride-chat, then ride-voice, then combined
two-device acceptance. These are capability boundaries, not a requirement to
introduce three backend packages or duplicate existing infrastructure.

## Proposed scope for review

- Calls use internet audio and opaque participant IDs. Never dial the other
  person's SIM number or silently fall back to direct phone calls.
- Chat supports text up to 300 characters and quick replies such as "I am at
  pickup", "Arriving shortly" and "Please wait". No files or photos initially.
- Communication opens after driver assignment and closes on trip completion,
  cancellation or another terminal outcome. Payment disputes go to support.
- The server checks participants and ride state for reading/sending messages,
  starting/answering calls and obtaining audio credentials; knowing a ride ID
  alone grants no access. Completion/cancellation must end existing sessions.
- No counterpart phone numbers in mobile/admin contact views, ride/offer/history
  responses, realtime events, push, call credentials or exported receipts.
  Review role-specific administrative contracts rather than assuming masking
  a visible label protects the underlying response.
- A person may still view their own number. Authentication and required SMS
  delivery retain server-side phone data. Never put phone numbers in audio
  participant identities or room names.
- Notifications contain generic alerts, not message text or phone numbers.
- Do not record call audio. Chat retention requires an explicit bounded policy
  before deployment; no indefinite default retention.
- Cabzonee can prevent automatic disclosure. Arbitrary free text or speech can
  still contain a voluntarily shared number; do not promise otherwise.
- Existing emergency-contact and emergency-service calling remain available.
- Native incoming-call behavior when locked/backgrounded is part of acceptance,
  not something a foreground-only demo can mark complete.

## Verified starting points

- Driver ride screen calls `tel:${ride.passenger.phoneE164}`.
- Rider active-ride components and ride screen call the assigned driver's number.
- `rides.presenter.ts` currently returns `passenger.phoneE164` and an enriched
  assigned-driver object containing `phoneE164`.
- `packages/contracts/src/rides.ts` requires those numbers on shared ride DTOs.
- Existing Mongo persistence, authenticated WebSocket delivery and Expo push
  should be reused for chat/call signaling where appropriate.
- No voice/chat SDK or implementation was found in the inspected app manifests
  and source. A voice service and native integration are additional work.

## Voice integration decision

Candidate: LiveKit, which documents Expo native integration and server-issued
room/identity-scoped tokens. Validate installed Expo/React Native compatibility
before selecting versions. No provider account, paid service or credentials
have been provisioned by this proposal.

References: https://docs.livekit.io/transport/sdk-platforms/expo/ and
https://docs.livekit.io/frontends/reference/tokens-grants/.

## Review boundary

Approve or amend this capability map before individual specifications and
implementation, as required by the spec-driven-development skill. Subsequent
verification must include ARTEMIS exploration before authored mobile tests,
API privacy/authorization checks and two installed native builds.
