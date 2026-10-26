# Cabzone Customer App: Pages, Components, Navigation and Implementation Plan

**Version:** 2.1
**Updated:** 2026-10-22
**Application:** `apps/rider-mobile`
**Framework:** React Native with Expo (SDK 57) and Expo Router
**Scope:** Rider authentication, minimal profile setup, In-City and Outstation/Intercity on-demand booking, passenger selection ("For Me" / "Someone Else"), live fare negotiation and driver counter-offers, active trip tracking with 4-digit pickup OTP, direct Cash/UPI settlement and payment dispute reporting, safety tools, push notifications, activity/receipts, repeat/return trips, and local saved route templates.

> **Convention used in this document.** Items marked **(Proposed)** describe a planned contract or behavior that must be confirmed with the `apps/api` owner before implementation. Items without the marker reflect the previously agreed scope.

---

## 1. Purpose and Source of Truth

This document translates the agreed Cabzone Rider App scope into an implementable Expo Router page structure, state architecture, design token system, ride lifecycle specification, and backend API/WebSocket contract map.

**The backend (`apps/api`) owns:**

- identity and session issuance
- geographic serviceability
- route distance and duration
- signed fare quotes and quote expiry
- negotiation bounds (`[floorPaise, ceilingPaise]`)
- driver counter-offer creation, expiry, and acceptance
- pickup OTP generation (computed server-side, returned to the rider only for permitted statuses, never persisted on the client)
- ride lifecycle transitions
- payment dispute creation

**The mobile client owns:**

- presenting authoritative server decisions
- optimistic input handling (fare steppers, form state)
- reconciling state across network transitions, app backgrounding, and restarts
- device-local convenience data (saved route templates, last-used passenger)

**Guiding principles**

1. **Server is truth.** The client never invents a ride status, fare, OTP, or countdown deadline.
2. **WebSocket is a hint, REST is the record.** Every realtime event triggers or is validated by a refetch of `GET /rides/:id` (and `/events` where needed).
3. **Everything is resumable.** Killing the app mid-ride must return the rider to the correct screen with correct state.
4. **Money is integers.** All amounts are paise (`number`, integer). Floats are banned. One `formatINR(paise)` helper is used everywhere.

---

## 2. Locked Product Decisions and Boundaries

| Area | Decision and Implementation Consequence |
| --- | --- |
| **App Identity** | Display name is `Cabzone` (`slug: "rider-mobile"`, `scheme: "cabzonerider"`, Android package `com.cabzone.rider`). |
| **Theme and Visuals** | Signature Cabzone Warm Amber and Espresso Brown light theme (`#FFFFFF` / `#FFF9F0` surfaces, `#FBBF24` / `#F59E0B` amber primary actions, `#3A2414` deep espresso brown text) matching `apps/driver-mobile`. |
| **Transport Scope** | MVP supports on-demand **In-City Rides (`IN_CITY`)** and **Intercity / Outstation Rides (`OUTSTATION` / `INTERSTATE`)** backed by the live API (`CAB` active; `E_RICKSHAW` displayed as "Coming Soon"). Freight, Courier Delivery, and Scheduled future rides are excluded from MVP. |
| **Outstation Semantics** | Outstation rides are **on-demand, one-way, "pickup now"** in MVP. There is no date picker and no round-trip option. The Intercity screen states this plainly (see §8.4). |
| **Authentication and Onboarding** | Minimal friction: **Welcome → +91 Phone → 6-Digit OTP → 1-Step Name Prompt** (`PATCH /api/v1/riders/me` with `{ name }`) on first login when `profile.name` is empty. Email, Emergency Contact, and Operational City live in the **Profile** tab. |
| **Primary Navigation** | **4-Tab Bottom Bar**: `Home` (In-City Rides), `Intercity` (Outstation / City-to-City), `Activity` (Active and Past Rides + Receipts), and `Profile` (Account, Saved Routes, Support and Settings). |
| **Location and Passenger Selection** | Map coordinate/pin + Place Search (`GET /api/v1/routing/reverse-geocode`, curated North Bengal / India places, and Saved Route Templates) + a **"For Me ▾" passenger pill** allowing booking for **Someone Else** (`passenger: { name, phoneE164 }`). |
| **Fare Negotiation and Counters** | Rider sets `proposedFarePaise` within `[floorPaise, ceilingPaise]` (±₹10 steppers + 1-tap reset to Suggested Fare). Direct driver acceptance assigns the ride immediately (`DRIVER_ASSIGNED`). Driver counter-offers (`FARE_COUNTER_PROPOSED`) appear as live cards with **Accept / Decline** (`POST /api/v1/rides/:id/counter/respond`) and a shared server-derived offer-window countdown (section 8). |
| **Active Ride (`/ride/[rideId]`)** | Single authoritative screen covering all backend statuses (§6): prominent **4-digit Pickup OTP banner** during `DRIVER_ASSIGNED`, `DRIVER_EN_ROUTE`, and `DRIVER_ARRIVED`; driver/vehicle info; **Emergency / Share Trip** safety sheet; Cash/Personal UPI payment instructions on `PAYMENT_PENDING`; Receipt + **Report Payment Issue / Dispute** on `SETTLED`. |
| **History, Repeat and Templates** | Chronological Activity log (`GET /api/v1/rides` + `/events`), itemized Receipts, **Repeat Ride** and **Book Return Trip (Swap Pickup ↔ Drop)** actions, and user-scoped **Saved Route Templates** stored on-device. |
| **One Active Ride Rule** (**Decided — D-043**) | A rider (`bookerRiderId`) may have **at most one booking-blocking ride** at a time across the 9 canonical statuses in §6.1 (`SETTLED`, `CANCELLED`, `EXPIRED`, and `PAYMENT_DISPUTED` do not block booking). `POST /rides` returns `409 ACTIVE_RIDE_EXISTS` with the existing `rideId`; the client routes to it. |

---

## 3. Out of Scope and Open Questions

### 3.1 Out of scope for MVP

- Scheduled / future rides, round-trip outstation, multi-stop rides
- Freight, courier delivery, E-rickshaw booking (tile shown disabled)
- Wallet, in-app payments, promo codes, referral credits
- Surge pricing UI (negotiation bounds already encode price limits)
- *(Moved into scope by D-046)* Post-ride ratings are **in scope**: double-blind 1–5 star ratings (+ optional preset tags) on `SETTLED` rides within 7 days, revealed when both submit or 7 days expire; display `"New"` until `ratingCount >= 5`.
- Languages beyond English in UI strings (`preferredLanguage` is stored but UI localization is post-MVP, see §17.2)
- Saved routes syncing across devices (device-local only in MVP)

### 3.2 Open questions (must be resolved before the phase that depends on them)

| # | Question | Owner | Blocks |
| --- | --- | --- | --- |
| Q1 | **Decided (D-043):** Enforce one active ride per `bookerRiderId` across the 9 booking-blocking statuses in §6.1 (`409 ACTIVE_RIDE_EXISTS` with `rideId`) | API | Resolved |
| Q2 | Confirm existing `RideDto.offeringExpiresAt` as the shared search/counter deadline; individual counter expiry is not in the current API | API | Phase 3 |
| Q3 | Driver-only payment confirmation and settled-only disputes already exist. Should formal dispute creation also be allowed during `PAYMENT_PENDING` (requires backend change)? | Product + API | Phase 6 |
| Q4 | Is there a tokenized public share-tracking URL endpoint? | API | Phase 7 |
| Q5 | Does the backend SMS the OTP / tracking link to `passenger.phoneE164` for "Someone Else" rides? | API | Phase 2 |
| Q6 | **Decided (D-044):** `PricingConfig`-backed fee/grace/wait snapshot (defaults ₹50 = ₹35 driver + ₹15 platform, 2m grace, 5m no-show wait), next-ride rider arrears ledger (`arrearsPaise`), and cash-booking block when arrears `>= ₹50` | Product + API | Resolved |
| Q7 | Push provider (Expo Push Service vs FCM/APNs direct) and device-token registration endpoint | API | Phase 4 |
| Q8 | Home basemap uses MapLibre GL JS with OpenFreeMap tiles; choose a production routing and geocoding cost model (current backend uses Google) | Eng + Product | Phase 1 |
| Q9 | Owner and data source for the curated "North Bengal / India places" list | Product | Phase 1 |
| Q10 | Does `POST /rides` support an `Idempotency-Key` header? | API | Phase 2 |

---

## 4. Expo Router Route Tree

```text
src/app/
├── _layout.tsx                       Shared providers (QueryClient, Auth, Toast), root Stack, deep-link config
├── index.tsx                         Authoritative bootstrap and routing gate (see §5)
├── +not-found.tsx                    Fallback; redirects to index gate
├── (auth)/
│   ├── _layout.tsx                   Public auth stack
│   ├── welcome.tsx                   Brand welcome and value props
│   ├── phone.tsx                     +91 phone input and OTP request
│   └── otp.tsx                       6-digit OTP verification
├── (onboarding)/
│   ├── _layout.tsx                   Authenticated onboarding guard
│   └── name.tsx                      1-step Full Name setup (PATCH /api/v1/riders/me)
└── (rider)/
    ├── _layout.tsx                   Authenticated rider guard, WS lifecycle owner, push registration
    ├── (tabs)/
    │   ├── _layout.tsx               4-Tab bottom navigation bar + active-ride banner
    │   ├── home.tsx                  In-City booking flow (map/search, quote, fare)
    │   ├── intercity.tsx             Outstation / City-to-City booking flow
    │   ├── activity.tsx              Active ride banner, past trips, repeat/return actions
    │   └── profile.tsx               Profile summary, quick links, preferences, logout
    ├── ride/
    │   └── [rideId].tsx              Authoritative full-lifecycle active ride and negotiation screen
    ├── history/
    │   └── [rideId].tsx              Detailed trip receipt, timeline and payment dispute form
    └── account/
        ├── edit-profile.tsx          Name, email, language and Operational City
        ├── emergency-contact.tsx     Emergency contact name and +91 phone (PATCH /api/v1/riders/me)
        ├── saved-routes.tsx          Create, launch and delete Saved Route Templates
        ├── support.tsx               Help FAQ and payment dispute guidance
        └── legal.tsx                 Terms of Service, Privacy Policy and safety rules
```

**Ride screen hand-off rule.** `/ride/[rideId]` owns a ride from `REQUESTED` / `OFFERING` until the rider dismisses the post-`SETTLED` (or cancelled/expired) summary. After dismissal, the screen is replaced with `/history/[rideId]`, and the ride appears only in Activity thereafter. Tapping a history status (`SETTLED`, `CANCELLED`, `EXPIRED`, `PAYMENT_DISPUTED`) anywhere else opens `/history/[rideId]`; tapping a booking-blocking status (section 6.1) opens `/ride/[rideId]`. Submitting a dispute from the ride summary replaces it with history.

---

## 5. Navigation, Bootstrap Gate and Deep Links

### 5.1 `index.tsx` decision order

The gate runs once on cold start and again after login/logout. It renders a branded splash until a destination is decided.

1. **Token present?** Read the refresh/access token from `SecureStore`. If none, go to `/(auth)/welcome`.
2. **Session valid?** Call `GET /riders/me`. On 401, attempt a single-flight `POST /auth/refresh`. If refresh is definitively rejected as invalid, expired, or revoked, clear tokens and go to `/(auth)/welcome`. On refresh network/timeout/5xx/429 failure, preserve tokens and show a retry state (section 13.4).
3. **Network failure?** If the profile call fails with a network error (not 401), show a retry screen with "Try again". Do **not** log the user out.
4. **Name present?** If `profile.name` is empty, go to `/(onboarding)/name`.
5. **Active ride?** Call `GET /rides` filtered by the booking-blocking statuses in section 6.1 and find any matching ride. If found, go to `/(rider)/ride/[rideId]`. This is the most important restart path.
6. **Otherwise,** go to `/(rider)/(tabs)/home`.

### 5.2 Guards

- `(auth)` redirects authenticated users away.
- `(onboarding)` requires authentication and an empty name.
- `(rider)` requires authentication and a non-empty name.
- Guards read from the auth store only; they never fetch.

### 5.3 Deep links **(Proposed)**

| Link | Behavior |
| --- | --- |
| `cabzonerider://ride/:rideId` | Opens `/ride/[rideId]` if booking-blocking (section 6.1), else `/history/[rideId]`. Requires auth; unauthenticated users log in first, then the link is resumed. |
| `cabzonerider://history/:rideId` | Opens receipt. |
| `cabzonerider://activity` | Opens Activity tab. |

Unknown or malformed links fall through to `+not-found`, which routes to `index`. Deep-link and push-notification taps share one resolver (`resolveRideRoute(rideId)`) so behavior is identical.

### 5.4 Active-ride banner

While a booking-blocking ride (section 6.1) exists, every tab shows a persistent, tappable banner above the tab bar ("Driver arriving in 3 min · Tap to view") linking to `/ride/[rideId]`. `Home` and `Intercity` booking CTAs are disabled with an explanation while a ride is active (One Active Ride Rule).

---

## 6. Ride Lifecycle Specification

This section is the contract for `/ride/[rideId]`. The screen is a pure function of `(ride, events, connectionState)`. No component decides status on its own.

### 6.1 Status model (existing backend contract)

Import `RideStatus` and `RIDE_STATUSES` from `@cabzone/contracts`; do not define a separate mobile enum. Legal transitions come from `apps/api/src/modules/rides/domain/ride.entity.ts`.

| Status | Rider UI | OTP visible? |
| --- | --- | --- |
| `REQUESTED` | Preparing/searching; compatibility state, not the current create response | No |
| `OFFERING` | Searching, shared offer deadline, pending counter cards | No |
| `DRIVER_ASSIGNED` | Assigned driver, pickup details | **Yes** |
| `DRIVER_EN_ROUTE` | Driver approaching pickup | **Yes** |
| `DRIVER_ARRIVED` | Driver at pickup | **Yes** |
| `TRIP_STARTED` | Trip in progress | No |
| `TRIP_COMPLETED` | Trip ended; awaiting authoritative payment state | No |
| `PAYMENT_PENDING` | Pay driver directly; awaiting driver confirmation | No |
| `PAYMENT_CONFIRMED` | Payment confirmed; awaiting settlement | No |
| `PAYMENT_DISPUTED` | History/receipt with dispute submitted and support guidance | No |
| `SETTLED` | Receipt and post-trip actions | No |
| `CANCELLED` | Cancellation summary | No |
| `EXPIRED` | No-driver-found summary | No |

`POST /rides` currently returns `OFFERING` with `offeringExpiresAt`. `FARE_COUNTER_PROPOSED` is a persisted event type, not a status. Counters are actionable only in `OFFERING`.

**Booking-blocking statuses (Decided — D-043):** `REQUESTED`, `OFFERING`, `DRIVER_ASSIGNED`, `DRIVER_EN_ROUTE`, `DRIVER_ARRIVED`, `TRIP_STARTED`, `TRIP_COMPLETED`, `PAYMENT_PENDING`, `PAYMENT_CONFIRMED`. Use this explicit 9-status set for bootstrap, banners, deep-link routing, `isRideActive()` in `apps/rider-mobile/src/services/rider-helpers.ts`, and the server-side `ACTIVE_RIDE_EXISTS` check. `SETTLED`, `CANCELLED`, `EXPIRED`, and `PAYMENT_DISPUTED` do not block new bookings. A dispute is a post-trip support state and can later return to `SETTLED`. Do not classify active rides merely as "not terminal".

### 6.2 Legal transitions (existing domain contract)

```text
REQUESTED         -> OFFERING | CANCELLED | EXPIRED
OFFERING          -> DRIVER_ASSIGNED | CANCELLED | EXPIRED
DRIVER_ASSIGNED   -> DRIVER_EN_ROUTE | CANCELLED
DRIVER_EN_ROUTE   -> DRIVER_ARRIVED | CANCELLED
DRIVER_ARRIVED    -> TRIP_STARTED | CANCELLED
TRIP_STARTED      -> TRIP_COMPLETED
TRIP_COMPLETED    -> PAYMENT_PENDING | SETTLED
PAYMENT_PENDING   -> PAYMENT_CONFIRMED | PAYMENT_DISPUTED | SETTLED
PAYMENT_CONFIRMED -> SETTLED
PAYMENT_DISPUTED  -> SETTLED
SETTLED           -> PAYMENT_DISPUTED
CANCELLED         -> (none)
EXPIRED           -> (none)
```

These are domain-allowed edges, not a promise that every intermediate status is emitted. Current use cases complete `TRIP_STARTED` directly to `PAYMENT_PENDING` and confirm payment directly to `SETTLED`; render both actual responses and all contract statuses without requiring intermediate events. Current dispute creation permits only `SETTLED` to `PAYMENT_DISPUTED`; reporting during `PAYMENT_PENDING` remains proposed (Q3).

- Riders can cancel only in `REQUESTED`, `OFFERING`, `DRIVER_ASSIGNED`, `DRIVER_EN_ROUTE`, or `DRIVER_ARRIVED`.
- Current driver cancellation ends in `CANCELLED`; re-dispatch requires an explicit backend change.
- Unexpected transitions trigger a refetch; render the authoritative response rather than replaying missing stages locally.

### 6.3 Status -> UI mapping

| Status | Primary content | Rider actions | Hidden / disabled |
| --- | --- | --- | --- |
| `REQUESTED` | Preparing/searching, route and proposed fare | Cancel | OTP, driver card, counter responses |
| `OFFERING` | Searching, route, proposed fare, shared offer countdown, counter cards | Accept/Decline counters, Cancel; raise fare only if the proposed endpoint ships | OTP, driver card |
| `DRIVER_ASSIGNED` | OTP banner, driver/vehicle details when available, agreed fare | Call driver, Share trip, SOS, Cancel | Counters |
| `DRIVER_EN_ROUTE` | OTP banner, driver location, stale-location indicator | Call driver, Share trip, SOS, Cancel | Counters |
| `DRIVER_ARRIVED` | Emphasized OTP, arrival message | Call driver, Share trip, SOS, Cancel | Counters |
| `TRIP_STARTED` | Route progress, drop, agreed fare | Share trip, SOS, Call driver | Cancel, OTP |
| `TRIP_COMPLETED` | Trip ended, fare, checking payment state | Refresh, Support | Cancel, OTP, settlement action |
| `PAYMENT_PENDING` | Fare due and Cash/UPI instructions | Open UPI if available; payment issue support (formal dispute only if Q3 permits) | Cancel, OTP, rider settlement action |
| `PAYMENT_CONFIRMED` | Payment received, checking settlement | Refresh, Support | Cancel, OTP, repeat payment action |
| `PAYMENT_DISPUTED` | History receipt, dispute submitted state, support guidance | Support, Done, Repeat/Return | OTP, new dispute submission |
| `SETTLED` | Receipt, passenger, payment issue entry | Dispute, Done, Repeat/Return | Safety sheet, OTP |
| `CANCELLED` | Cancel actor/reason and fee when supplied | Rebook, Done | OTP, counters |
| `EXPIRED` | No drivers accepted; retry suggestion | Requote and rebook, Done | OTP, counters |

### 6.4 `OFFERING` stage detail

- **Search timeout:** shown as a server-derived countdown from `RideDto.offeringExpiresAt` (shared offer window). At expiry the server sets `EXPIRED`; the client never expires a ride locally.
- **Raise fare:** a persistent `+₹10` control posts to `POST /rides/:id/fare/raise` during `OFFERING`, clamped to the saved pricing ceiling. The server records `FARE_PROPOSAL_RAISED` with the new ride version; earlier counters become invalid (section 8.2).
- **No-driver-found:** `EXPIRED` UI prefills a new booking at up to +₹20 (clamped to the saved ceiling), then fetches a fresh quote before the rider confirms the new request.

### 6.5 Cancellation (**Decided — D-044**)

- Cancel always opens a bottom sheet with a required `CancellationReason` picker (`@cabzone/contracts`) and shows any applicable fee from the ride's frozen `PricingConfig` cancellation snapshot **before** confirmation.
- Free cancellation in `REQUESTED` / `OFFERING` and within the configured grace window (`riderCancellationGraceSeconds`, default 120s from `acceptedAt`) in `DRIVER_ASSIGNED` / `DRIVER_EN_ROUTE`. Late cancellations and verified 5-minute `RIDER_NO_SHOW` events record rider arrears (`arrearsPaise`) collected on the next ride (and block further cash bookings when unpaid arrears `>= ₹50`).
- Cancelling is idempotent: a matching replay returns the recorded cancellation breakdown.

### 6.6 Edge cases the screen must handle

| Case | Behavior |
| --- | --- |
| Driver cancels after assignment | Banner "Your driver cancelled", ride becomes `CANCELLED` under the current API; re-dispatch is not currently supported |
| Rider no-show / driver no-show | Rendered from `CANCELLED` + cancel reason; no client logic |
| Ride opened on a second device | Same screen, same server truth; OTP visible on both |
| Network offline mid-ride | Last known state with an "Offline, reconnecting" bar; actions requiring network are disabled; no destructive local changes |
| Ride not found / forbidden | Error state with "Go to Activity" |

---

## 7. Booking, Quote and Fare Negotiation

### 7.1 Booking flow (Home and Intercity)

1. Rider selects **pickup** (default: current location, reverse-geocoded) and **drop** (search, map pin, or saved route).
2. Rider selects **passenger** via the "For Me ▾" pill (§7.5).
3. Client calls `POST /pricing/quotes { pickup, drop }`.
4. Rider chooses a vehicle category (`CAB` enabled; `E_RICKSHAW` disabled, see §7.6).
5. Rider adjusts the proposed fare within bounds.
6. Rider taps **Request ride** → `POST /rides` → navigate to `/ride/[rideId]`.

### 7.2 Quote lifecycle **(Proposed)**

- `quoteToken` is signed and expires. Show a subtle timer and **auto-requote** shortly before expiry if the rider is still on the screen. If the rider's proposed fare falls outside the new bounds, clamp it and show a one-line notice.
- Quote requests are debounced and cancel in-flight requests when pickup/drop change.
- Serviceability errors (outside operational zone) render a specific "We don't serve this area yet" state with the nearest active zone from `GET /zones`.

### 7.3 Fare controls

- Steppers change by **±₹10 (1000 paise)**, clamped to `[floorPaise, ceilingPaise]`.
- "Reset to suggested" returns to `suggestedFarePaise`.
- Steppers have long-press repeat, haptic feedback at bounds, and accessible labels ("Increase fare by 10 rupees, currently ₹250").
- The input is read-only text (no free typing) in MVP to avoid invalid values.
- Fare is displayed via `formatINR`; no arithmetic on floats anywhere.

### 7.4 Create-ride safeguards **(Proposed)**

- Send an **`Idempotency-Key`** (UUID generated when the rider taps Request, reused on retry) so flaky networks cannot create duplicate rides (Q10).
- Disable the CTA during the request and on 409 `ACTIVE_RIDE_EXISTS` navigate to the existing ride.
- On `400`/`422` for out-of-bounds fare ("bounds changed"), auto-requote, clamp, and ask the rider to confirm again. No silent resubmission.
- On network timeout, query `GET /rides` before showing an error, in case the ride was created.

### 7.5 Passenger selection ("For Me" / "Someone Else")

- Pill defaults to "For Me" (rider's profile name and phone).
- "Someone Else" opens a sheet: **name** (required) and **phone** (+91, 10-digit validation; same validation as auth).
- **(Proposed)** Last 3 used passengers are stored locally (user-scoped, cleared on logout) as quick picks.
- **Notifications (Proposed, Q5):** the backend sends the passenger an SMS containing ride details, OTP, and tracking link. If the backend does not, the ride screen surfaces a **"Share OTP and trip with passenger"** share-sheet action, prominent during `DRIVER_ASSIGNED` to `DRIVER_ARRIVED`.
- The passenger's name appears on the active ride, receipt, and Activity row ("Ride for Anita").
- Riders cannot book for their own phone number as "Someone Else".

### 7.6 Vehicle categories

- `CAB`: selectable.
- `E_RICKSHAW`: rendered as a disabled tile with a "Coming Soon" badge. Tapping shows a toast "E-rickshaw rides are coming soon." No notify-me capture in MVP.

---

## 8. Counter-Offers and Intercity

### 8.1 Counter-offer model (existing backend contract)

Derive pending counters from persisted `RideEventDto[]` returned by `GET /rides/:id/events`. A counter contains `driverId`, `proposedFarePaise`, and `createdAt`; its persisted event has `id`. Counter metadata does not supply driver name, rating, vehicle, distance, ETA, or an individual `expiresAt`.

The ride's `offeringExpiresAt` is the shared deadline for all counters. Do not invent a per-counter timeout. WebSocket `ride.fare.countered` is an invalidation hint; refetch events rather than appending its payload as a persisted event.

### 8.2 Reducer rules

Input: ordered `RideEventDto[]`, authoritative ride status, `offeringExpiresAt`, and server-adjusted time. Output: `PendingCounter[]`.

1. A `FARE_COUNTER_PROPOSED` event adds a counter keyed by driver, retaining the persisted event `id` for rendering.
2. A later counter from the same driver supersedes that driver's earlier counter.
3. `FARE_COUNTER_ACCEPTED` or `FARE_COUNTER_REJECTED` removes that driver's pending counter.
4. Return no actionable counters unless the ride is `OFFERING` and its shared `offeringExpiresAt` has not passed. Assignment clears all cards. Acceptance is confirmed through the mutation response and ride refetch.
5. Deduplicate persisted events by `id` and order by `createdAt`, preserving server-returned order for ties. The current API supplies no sequence number; do not use WebSocket delivery IDs or arrival order as persisted event ordering.
6. `FARE_PROPOSAL_RAISED` clears pending counters. Counter events carry `rideVersion`; counters based on an older offer version remain invalid even if written after the raise event. Reconnects derive the same pending set from persisted events.

### 8.3 Counter card UI

- MVP cards show a neutral driver label, counter fare, delta from the proposal, the shared offer-window countdown, and Accept/Decline. Never display a driver UUID as a person's name.
- Sort by lowest fare, then newest `createdAt`, then persisted event ID for a stable tie-break. Do not sort by unavailable distance.
- Driver name/rating, vehicle, pickup distance/ETA, and individual counter expiry are **proposed API enrichment**, not current card requirements. Add them only after an authorized rider-facing contract supplies them; do not fetch private driver/admin endpoints.
- Countdown: `ride.offeringExpiresAt - (Date.now() + serverClockOffset)`, with offset learned from API `Date` headers. Label it as the shared offer window. If no deadline is supplied, omit the timer and rely on the server response.
- At the deadline, disable responses and refetch; never locally set the ride to `EXPIRED`. The backend rejects a closed window with `409 OFFER_EXPIRED` and a missing counter with `409 NO_PENDING_COUNTER`; show an unavailable-offer message and refetch ride/events.
- Accept/Decline are single-flight per card and disable buttons without optimistically changing ride state. Requests select the latest counter by `driverId`, not event ID. Replace a card and require review if a newer fare from that driver becomes known. Protection against an unseen replacement requires an exact-counter conditional acceptance contract from the backend; the current API cannot guarantee that.

### 8.4 Intercity (Outstation) specifics **(Proposed)**

Intercity reuses the booking flow with these differences:

- A fixed banner: **"One-way ride · pickup now"**. No date, no round trip.
- Quote card shows distance, estimated duration (hours/minutes), and, if returned by the API, `stateBreakdown`.
- **`stateBreakdown` rendering:** an expandable "Fare details" section listing each state/segment with distance and charge, plus any interstate tax/permit line items provided by the API. The client displays the API's line items and totals; it never computes taxes.
- Tolls, permits, and driver allowance are displayed **only** if the quote includes them. A one-line disclaimer states what is and isn't included in the fare.
- Pre-confirmation modal for rides over a configurable distance (e.g., 100 km): "This is an outstation trip of 240 km, about 5 h 30 min. Confirm?"
- Drop search is biased toward cities/towns, not POIs.
- Wider negotiation bounds and longer search timeout are server-driven; the client reads them from the quote and ride, with no hardcoded values.

---

## 9. Realtime and Recovery

### 9.1 Connection lifecycle

- `(rider)/_layout.tsx` owns **one** WebSocket: `WS /ws?token=<accessToken>`.
- Connect after auth is confirmed; close on logout. Wait for `connection.ready` before treating the socket as live.
- Refresh the token **before** reconnect if the access token is expired; never loop reconnect with an expired token.
- Reconnect with **exponential backoff and jitter** (e.g., 1s → 2s → 4s … capped at 30s, ±20% jitter). Reset on `connection.ready`.
- Suspend the socket after the app has been backgrounded (e.g., > 30 s) and reconnect on foreground; rely on push while backgrounded (§12).

### 9.2 Reconciliation rules

- On **every** `connection.ready` (including reconnects) and on **every `AppState` change to `active`**: invalidate and refetch `GET /rides` and, if a ride is active, `GET /rides/:id` and `/events`.
- The WebSocket envelope is `{ event, eventId, timestamp, data }`. Deduplicate deliveries by envelope `eventId`; it is not a persisted `RideEventDto.id`. Lifecycle payloads include `data.rideId`, `rideVersion`, and `status`; location payloads carry ride ID and coordinates without a ride version. Unknown rides trigger a `GET /rides` refetch. Counter hints can share a ride version because proposing/rejecting a counter need not update the ride; never discard them merely for equal `rideVersion`.
- For lifecycle events, patch only from authoritative `data.status` when `data.rideVersion` is newer than cached `ride.version`, then schedule a debounced refetch. Ignore older status patches; equal versions may still trigger reconciliation. Counter hints invalidate persisted events rather than being appended to them. Discard REST responses older than the cached version, including stale in-flight responses. Never infer status from the event name.
- `driver.location.updated` events update only a dedicated location store, never the ride query cache (prevents re-renders across the app). See §14.
- Connection state is exposed as `online | reconnecting | offline` and drives the thin status bar on the ride screen.

### 9.3 Event -> effect table (existing notifier contract)

| WS event | Effect |
| --- | --- |
| `connection.ready` | Mark live; run reconciliation |
| `ride.fare.countered` | Refetch persisted events and ride; recompute counters; haptic + in-app alert |
| `ride.fare.counter_rejected` | Currently sent to the driver; rider reconciles from its response and persisted events |
| `ride.driver.assigned` | Version-checked status patch; refetch ride for OTP; clear counters |
| `ride.driver.en_route` / `ride.driver.arrived` | Version-checked status patch; haptic; refetch |
| `ride.started` | Render payload status (currently `TRIP_STARTED`); hide and clear OTP; refetch |
| `ride.completed` | Render payload status (currently `PAYMENT_PENDING`); refetch |
| `ride.payment.confirmed` | Render payload status (currently `SETTLED`); refetch receipt/events |
| `ride.payment.disputed` | Render `PAYMENT_DISPUTED`; route to history; refetch events |
| `ride.payment.dispute_resolved` | Render payload status (currently `SETTLED`); refetch history/events |
| `ride.cancelled` / `ride.offer.expired` | Version-checked status patch; refetch terminal summary |
| `driver.location.updated` | Update location store only (throttled) |

---

## 10. Payments and Disputes

The platform is **not** in the money flow. Riders pay drivers directly by cash or personal UPI. Product copy must state this clearly in the booking confirmation, on the `PAYMENT_PENDING` screen, and in Support.

### 10.1 `PAYMENT_PENDING` screen **(Proposed, confirm Q3)**

- Shows the **agreed fare** (never recomputed on client) and the driver name/vehicle.
- **Cash:** instruction "Pay ₹X in cash to your driver."
- **UPI:** if the API provides the driver's UPI VPA, show a "Pay with UPI" button that opens a `upi://pay?pa=…&am=…&cu=INR&tn=…` intent with the exact amount; otherwise show the VPA as copyable text. If no VPA is present, only the cash instruction is shown.
- Rider **cannot** mark the ride `SETTLED` on their own; settlement is confirmed by the driver (the status moves to `SETTLED` on `ride.payment.confirmed`). If the rider has paid and the driver has not confirmed after a visible wait (e.g., 2 minutes), surface **"Driver hasn't confirmed? Report an issue"**.
- A rider may open "Report Payment Issue" during `PAYMENT_PENDING` **(if the API permits, Q3)**; otherwise the entry point appears on `SETTLED` as originally scoped.

### 10.2 Dispute flow

- `POST /rides/:id/payment/dispute` with `{ reason }`, **10–1000 characters**, with a live counter and inline validation.
- Entry points: `SETTLED` summary, `/history/[rideId]`, and (Proposed) `PAYMENT_PENDING`.
- One open dispute per ride; current creation changes `SETTLED` to `PAYMENT_DISPUTED`, and resolution returns it to `SETTLED`. After submission, show a confirmation with a reference and replace the entry point with a **"Dispute submitted"** state (read from the ride/dispute status; handle 409 "already disputed" gracefully).
- Disputes are shown in the receipt timeline.
- Support screen explains what to expect and how long review takes (copy from Product).

### 10.3 Receipt

Receipt shows: route, date/time, driver and vehicle, passenger name (if Someone Else), agreed fare, fare-negotiation timeline (from events), payment method if known, and dispute status.

---

## 11. Safety and OTP Security

### 11.1 Pickup OTP

- Computed and owned by the server. The client displays what `GET /rides/:id` returns in `pickupOtp` and **never stores it** in persistent storage, logs, analytics, crash reports, or push payloads.
- Visible only while status ∈ {`DRIVER_ASSIGNED`, `DRIVER_EN_ROUTE`, `DRIVER_ARRIVED`}; removed from memory when the status leaves that set.
- The OTP is **per ride** (not regenerated per stage).
- The OTP banner has large digits, accessible reading ("Your pickup code is 4 8 2 1"), and a "Share with passenger" action for "Someone Else" bookings.
- **Screen privacy:** on screens that show the OTP, enable `FLAG_SECURE` on Android and a blur overlay in the iOS app-switcher snapshot **(Proposed)**. Screenshots are disabled on the OTP banner where the platform allows.

### 11.2 Safety sheet **(Proposed)**

Available from `DRIVER_ASSIGNED` through `TRIP_STARTED`. Contains:

| Action | Behavior |
| --- | --- |
| **SOS** | Confirmation sheet (prevents accidental taps) → dials the local emergency number (112 in India) via the system dialer, and in parallel notifies the backend/ops with ride id and last known location (`POST /rides/:id/sos`, confirm with API) and the rider's emergency contact if set |
| **Share trip** | Opens the system share sheet with a tokenized tracking link (Q4). If no link endpoint exists in MVP, falls back to a text message with driver name, vehicle number, and a plain-language route summary |
| **Call driver** | System dialer; number provided by the API (masked if available) |
| **Report a safety issue** | Opens Support with the ride attached |

- **No emergency contact set:** on first booking, show a non-blocking prompt "Add an emergency contact for safer rides" with Add / Not now (remembered for 7 days). The SOS sheet also offers to add one.
- SOS must work with poor connectivity: the dialer action never waits on the network call.

---

## 12. Push Notifications and Deep Links **(Proposed, Q7)**

A WebSocket does not survive backgrounding, so push is an MVP requirement.

- Use `expo-notifications`. Request permission **in context** (after the first ride request is created), not at launch; explain the value ("Get updates when your driver accepts or arrives").
- Register the device push token with the backend after login and on token change (tied to the same `deviceId` used at OTP verify). Unregister on logout.
- Notification types: counter-offer received, driver assigned, driver en route, driver arrived, payment due, ride settled, ride cancelled/expired.
- Payloads carry only `{ type, rideId }`. No OTP, phone numbers, or fares in payload text beyond what the server chooses to display; the app fetches details on open.
- Tapping a notification calls `resolveRideRoute(rideId)` (§5.3). A cold-start tap passes through the bootstrap gate and then resumes the target.
- Android notification channels: `ride-updates` (high importance), `offers` (high importance, counter-offers), `general` (default).
- If permission is denied, show a one-time inline hint on the ride screen explaining that updates appear only while the app is open.

---

## 13. State Management and Storage Architecture

### 13.1 Layers

| Layer | Tool | Holds |
| --- | --- | --- |
| **Server state** | TanStack Query | Profile, rides list, ride detail, events, quotes, zones |
| **Realtime / ride state machine** | Zustand store (or reducer) | WS connection state, derived pending counters, server clock offset |
| **High-frequency state** | Dedicated Zustand slice | Driver location only (never in Context or the query cache) |
| **Auth** | Small auth store | Session status, user id; tokens live in `SecureStore` |
| **Form / UI state** | Component state | Booking inputs, sheets, steppers |

React Context is used only for stable, rarely changing values (theme, auth session status, query client). **Server data is never put in Context.**

### 13.2 Query key and caching conventions

- Keys: `['profile']`, `['rides']`, `['ride', id]`, `['ride', id, 'events']`, `['quote', hash(pickup, drop, passenger)]`, `['zones']`.
- Active ride: `staleTime: 0`, refetch on focus and reconnect. Rides list: short stale time; Activity uses pull-to-refresh.
- All `POST/PATCH` mutations invalidate affected keys on success.

### 13.3 Storage

| Data | Storage | Notes |
| --- | --- | --- |
| Access/refresh tokens, `deviceId` | `expo-secure-store` | **Tokens only** in SecureStore; never in AsyncStorage |
| Saved Route Templates | `AsyncStorage` (or MMKV) | Keyed `templates:v1:<userId>`; **schema-versioned** with a migration function; cleared on logout |
| Recent places, recent passengers | `AsyncStorage` | User-scoped, capped (e.g., 10 and 3), cleared on logout |
| UI prefs (e.g., prompt snooze) | `AsyncStorage` | User-scoped |

- Saved routes are **device-local**. The Saved Routes screen states this ("Saved on this device only") so riders don't expect them to follow their account.
- Logout wipes: SecureStore tokens, all user-scoped AsyncStorage keys, the query cache, all Zustand stores, and closes the WebSocket.

### 13.4 Networking (`src/services/api.ts`)

- Single Axios/fetch client with bearer injection and **single-flight 401 refresh**: concurrent 401s await one refresh promise; on definitive refresh-token rejection (invalid, expired, or revoked refresh credentials), queued requests reject, credentials are cleared, and the user is logged out. On network failures, timeouts, 5xx, or 429 responses, reject queued requests with a retryable error, preserve credentials/session, release the single-flight promise, and show a retry state; do not loop refresh automatically. A generic 403 is not evidence of an invalid refresh token. Bootstrap and foreground recovery follow the same policy.
- Request IDs and the `Date`-header clock offset capture live here.
- Typed error mapping: `{ code, message, status }` with a UI-safe message; unknown errors show a generic retry state.
- Timeouts: 15 s default; quotes 10 s. Create-ride uses the idempotency key (§7.4).

---

## 14. Location, Maps and Driver Tracking

- **Permissions:** foreground-only location (`expo-location`). Request in context when the rider taps "Use current location" or opens the booking map, with a short rationale. Background location is **not** requested.
- **Denied state:** the map opens centered on the operational city; pickup is chosen by search or pin, with a persistent "Enable location" link to system settings.
- **Map provider (Q8):** the Home map uses MapLibre GL JS in a WebView with OpenFreeMap tiles, so it runs in Expo Go without a Google Maps client key. Routing and reverse geocoding still use the backend provider; confirm their production cost and availability before launch.
- **Reverse geocode:** debounce pin-drag end (≈400 ms); show the resolved address; cancel stale requests.
- **Driver marker:** location events are throttled (render at most ~1 update/second), the marker animates between points with interpolation, and a stale-location indicator appears if no update arrives for 30 s.
- **Camera:** auto-fit rider + driver (pre-pickup) or driver + drop (in progress); stop auto-follow when the rider pans, and offer a "Recenter" button.
- Low-end Android: cap marker animation frame rate; avoid re-rendering the whole map on every location tick.

---

## 15. Backend API and Realtime Integration Map

| Feature | Endpoint / Channel | Contract and Notes |
| --- | --- | --- |
| **Request OTP** | `POST /api/v1/auth/otp/request` | `{ phoneE164 }`. Client enforces resend cooldown (e.g., 30 s) and shows server rate-limit errors. |
| **Verify OTP** | `POST /api/v1/auth/otp/verify` | `{ phoneE164, otp, deviceId }` → creates `RIDER` user and profile if new. |
| **Refresh Session** | `POST /api/v1/auth/refresh` | Single-flight 401 token recovery in `src/services/api.ts`. |
| **Logout** | `POST /api/v1/auth/logout` | Clears tokens, unregisters push token, closes `/ws`, wipes caches. |
| **Get Rider Profile** | `GET /api/v1/riders/me` | Returns `RiderDto` (`name`, `email`, `emergencyContact`, `preferredLanguage`, `ratingAverage`). |
| **Update Rider Profile** | `PATCH /api/v1/riders/me` | Updates `name`, `email`, `preferredLanguage`, `emergencyContact`. |
| **Reverse Geocode** | `GET /api/v1/routing/reverse-geocode` | `?lat=...&lng=...` → display address, city, state. |
| **List Active Zones** | `GET /api/v1/zones` | Active city polygons for operational city selection and serviceability messaging. |
| **Create Quote** | `POST /api/v1/pricing/quotes` | `{ pickup, drop }` → `quotes: QuoteDto[]` with `quoteToken`, `suggestedFarePaise`, `negotiation: { floorPaise, ceilingPaise }`, `serviceType`, `stateBreakdown`. Quote expiry is enforced server-side. |
| **Create Ride** | `POST /api/v1/rides` | `{ quoteToken, proposedFarePaise, passenger: { name, phoneE164 }, vehicleCategory, pickup, drop }`. **(Proposed)** `Idempotency-Key` header; `409 ACTIVE_RIDE_EXISTS`. |
| **List Rider Rides** | `GET /api/v1/rides` | Rider's active and historical rides. |
| **Get Ride + OTP** | `GET /api/v1/rides/:id` | `RideDto & { pickupOtp?: string }` (`pickupOtp` present for the rider during `DRIVER_ASSIGNED`, `DRIVER_EN_ROUTE`, `DRIVER_ARRIVED`). Existing `offeringExpiresAt` and `version`; **(Proposed)** `cancellationPolicy`. |
| **Get Ride Events** | `GET /api/v1/rides/:id/events` | Ordered `RideEventDto[]` used by the counter reducer (§8.2) and the receipt audit trail. |
| **Update Proposed Fare** **(Proposed)** | `PATCH /api/v1/rides/:id/fare` | `{ proposedFarePaise }` within bounds while `OFFERING`; invalidates pending counters. Confirm exists. |
| **Respond to Counter** | `POST /api/v1/rides/:id/counter/respond` | `{ driverId, action: 'ACCEPTED' \| 'REJECTED' }`. `409 OFFER_EXPIRED` / `409 NO_PENDING_COUNTER` handled (section 8.3); counter fields and shared deadline per section 8. |
| **Cancel Ride** | `POST /api/v1/rides/:id/cancel` | `{ reason: CancellationReason }`. Idempotent. |
| **Dispute Payment** | `POST /api/v1/rides/:id/payment/dispute` | `{ reason }` (10–1000 chars). One per ride. |
| **SOS** **(Proposed)** | `POST /api/v1/rides/:id/sos` | `{ lat, lng }`; notifies ops and emergency contact. |
| **Share Link** **(Proposed)** | `POST /api/v1/rides/:id/share` | Returns tokenized public tracking URL (Q4). |
| **Register Push Token** **(Proposed)** | `POST /api/v1/devices/push-token` | `{ deviceId, token, platform }`; `DELETE` on logout (Q7). |
| **Realtime WebSocket** | `WS /ws?token=<accessToken>` | Events: `connection.ready`, `ride.fare.countered`, `ride.driver.assigned`, `ride.driver.en_route`, `ride.driver.arrived`, `ride.started`, `ride.completed`, `ride.payment.confirmed`, `ride.payment.disputed`, `ride.payment.dispute_resolved`, `ride.cancelled`, `ride.offer.expired`, `driver.location.updated`. |

---

## 16. Design Tokens and Shared Components

### 16.1 Tokens

| Token | Value | Use |
| --- | --- | --- |
| `color.bg` | `#FFFFFF` | Screen background |
| `color.surface` | `#FFF9F0` | Cards, sheets, input fills |
| `color.primary` | `#FBBF24` | Primary buttons, highlights |
| `color.primaryStrong` | `#F59E0B` | Pressed state, active tab, links |
| `color.text` | `#3A2414` | Primary text |
| `color.textMuted` | derive (e.g., `#7A6552`) | Secondary text; must meet 4.5:1 contrast on `bg` and `surface` |
| `color.success` / `color.danger` / `color.warning` | define in theme file | Status chips, errors, dispute/SOS |
| `radius.sm/md/lg` | 8 / 12 / 20 | Inputs, cards, sheets |
| `space.*` | 4-pt scale | Layout |
| `type.*` | Scaled with system font size (cap at 1.3×) | Text |

Contrast note: `#FBBF24` fails contrast with white text; use `color.text` (espresso) on amber buttons.

### 16.2 Shared components (`src/components/`)

| Component | Purpose |
| --- | --- |
| `Button`, `IconButton`, `Chip` | Primary/secondary/destructive variants, loading and disabled states |
| `TextField`, `PhoneField`, `OtpField` | +91 formatting, 6-digit OTP with auto-advance and SMS autofill |
| `BottomSheet` | Passenger picker, cancel reason, safety sheet, dispute form |
| `PlaceSearchSheet` | Search, recents, saved routes, curated places |
| `FareStepper` | ±₹10 control with bounds, haptics, a11y labels |
| `QuoteCard` | Distance, duration, suggested fare, `stateBreakdown` expander |
| `CounterCard` | Fare, shared offer-window countdown, Accept/Decline; enrichment only after API support (section 8) |
| `OtpBanner` | Large pickup code, share action, secure-screen handling |
| `DriverCard` | Name, rating, vehicle, call action |
| `RideStatusStepper` | UI stages mapped explicitly from every backend status (section 6) |
| `ActiveRideBanner` | Persistent tab-level banner |
| `PaymentPanel` | Cash/UPI instructions and actions |
| `ConnectionBar` | online / reconnecting / offline |
| `EmptyState`, `ErrorState`, `Skeleton` | Consistent loading/empty/error patterns |
| `MapView` wrapper (`components/map/`) | Provider-agnostic map, markers, route polyline |

### 16.3 Formatting helpers (`src/lib/format.ts`)

- `formatINR(paise: number): string` is the **only** way to render money.
- `formatDistance(meters)`, `formatDuration(seconds)`, `formatPhoneIN(e164)`, `formatRideTime(iso)`.
- Lint rule or code-review check forbids `parseFloat`/decimal math on money.

---

## 17. Screen Specifications and Acceptance Criteria

Each screen lists key behavior and testable acceptance criteria (AC).

### 17.1 Auth and onboarding

**`welcome`:** brand, value props, "Get started".
- AC: shown only when unauthenticated; no network calls.

**`phone`:** +91 input, validation, "Send OTP".
- AC: button disabled until 10 valid digits; error toasts for rate limit; navigates to `otp` with the phone preserved.

**`otp`:** 6-digit entry, resend cooldown, SMS autofill, change number.
- AC: auto-submits on 6th digit; wrong OTP shows inline error and clears field; resend disabled for cooldown; on success, tokens stored in SecureStore and the bootstrap gate runs.

**`name`:** single required field.
- AC: trims whitespace, minimum 2 characters; `PATCH /riders/me` success routes to `home` (or active ride); cannot be skipped or navigated back out of.

### 17.2 Tabs

**`home` (In-City):** map, pickup/drop pills, passenger pill, saved routes shortcut, vehicle tiles, quote card, fare stepper, Request button.
- AC: Request disabled until pickup, drop, and valid quote exist; disabled with explanation during an active ride; double-tap cannot create two rides; proposed fare is always within bounds; out-of-zone shows the serviceability state.

**`intercity`:** same components plus the one-way banner and outstation quote details.
- AC: no date or round-trip control exists; `stateBreakdown` renders when present; long-trip confirmation shown above the configured distance.

**`activity`:** active ride card at top, chronological past rides, Repeat and Return actions, pull-to-refresh, pagination.
- AC: active ride card opens `/ride/[id]`; past rides open `/history/[id]`; Return Trip swaps pickup/drop and opens the booking flow prefilled and requoted; Repeat prefilled with the same route and passenger; empty state shown for new riders.

**`profile`:** name, phone, rating, links (Edit profile, Emergency contact, Saved routes, Support, Legal), logout.
- AC: logout confirms, wipes all user data, closes WS, and lands on `welcome`.

### 17.3 Ride screens

**`ride/[rideId]`:** per §6.3.
- AC (representative):
  - Cold start with any booking-blocking status in section 6.1 lands here directly; `PAYMENT_DISPUTED` opens history and does not disable new booking.
  - OTP is visible in exactly the three allowed statuses and nowhere else.
  - Counters sort by fare then newest; actions disable at the shared offer deadline and cards clear after assignment or a persisted fare raise. Persisted proposal/response events reconcile after reconnect.
  - Cancel always shows reason and fee before confirming.
  - Killing and relaunching the app in each status restores the correct UI.
  - Offline state is visible and no action silently fails.

**`history/[rideId]`:** receipt, timeline, dispute.
- AC: shows fare, route, driver, passenger, timeline from events; dispute form validates 10–1000 chars and shows submitted state after success; works offline from cache with a staleness note.

### 17.4 Account screens

**`edit-profile`:** name, email (validated), language, Operational City (from `/zones`).
- AC: dirty-state save button; server validation errors shown inline; discard-changes confirmation.

**`emergency-contact`:** name + +91 phone; ability to clear.
- AC: cannot equal the rider's own number; saved via `PATCH /riders/me`.

**`saved-routes`:** list, create (from search/map or from a past ride), launch, delete.
- AC: "Saved on this device only" notice; launching prefills pickup and drop and triggers a quote; delete asks for confirmation; storage schema-versioned and user-scoped.

**`support`, `legal`:** FAQ, payment dispute guidance, contact options, Terms, Privacy, safety rules.
- AC: loads offline (bundled content); links open in the in-app browser.

---

## 18. Non-Functional Requirements

### 18.1 Reliability and performance
- Cold start to interactive: under 2.5 s on a mid-range Android device.
- Ride screen remains smooth (≥ 50 fps) with live marker updates on low-end Android.
- Bundle hygiene: lazy-load heavy screens (map, history), avoid large images, use Hermes.

### 18.2 Offline behavior
- Cached profile, rides list, and receipts viewable offline with a "Last updated" note.
- Booking, cancelling, counter-responding, and disputing require network; disabled with explanation.
- SOS dialer works without network.

### 18.3 Accessibility
- Minimum 44×44 pt touch targets (48 dp on Android).
- Screen-reader labels for OTP digits, fare steppers, counter countdowns, and map controls; announce status changes ("Driver has arrived").
- Dynamic type supported up to 1.3×; contrast ≥ 4.5:1 for text.
- Don't rely on color alone for status; pair with icons/text.

### 18.4 Localization
- All strings go through an i18n layer from day one (English only in MVP). Bengali and Hindi are candidates post-MVP (`preferredLanguage` already stored).
- Currency, dates, and phone formats via `Intl` with `en-IN`.

### 18.5 Security and privacy
- Tokens only in SecureStore; no PII or OTP in logs, analytics, Sentry breadcrumbs, or push payloads.
- Certificate validation default; no debug endpoints in release builds.
- Redact phone numbers in logs (show last 2 digits).
- Account/data deletion path linked from Profile → Legal/Support (required by Play/App Store policies **(confirm requirement with Product)**).

### 18.6 Observability
- Error reporting: Sentry (or equivalent) with user id (not phone) and ride id tags.
- Analytics events (no PII): `otp_requested`, `otp_verified`, `quote_created`, `ride_requested`, `counter_received`, `counter_accepted`, `counter_declined`, `ride_assigned`, `ride_cancelled{reason,stage}`, `ride_expired`, `ride_settled`, `payment_dispute_submitted`, `sos_triggered`, `share_trip_tapped`, `push_permission{granted}`, `ws_reconnect{attempt}`.
- Track WS reconnect rates and "resume into active ride" success.

---

## 19. Phased Implementation Plan

| Phase | Deliverable | Depends on | Exit criteria |
| --- | --- | --- | --- |
| **0. Foundations** | Expo SDK 57 project config, theme tokens, shared components, `api.ts` with single-flight refresh, SecureStore, query client, i18n scaffold, lint rules, CI, Sentry | Q8 (map choice) | App boots, theme matches driver app, token refresh tested |
| **1. Auth + onboarding + gate** | Welcome, phone, OTP, name, bootstrap gate, guards, logout | Phase 0 | AC §17.1 pass; cold start routes correctly |
| **2. Booking + create ride** | Home and Intercity booking, place search, map, passenger pill, quote lifecycle, fare stepper, idempotent create, One Active Ride rule | Q1, Q5, Q6, Q9, Q10 | Rider can request a ride end-to-end against the live API |
| **3. Active ride core** | `/ride/[rideId]`, status → UI mapping, WS lifecycle, reconciliation, resume-after-restart, active-ride banner, cancel flow | Q1, Q2 | Full lifecycle `OFFERING` → `SETTLED` works; kill/relaunch test passes in every status |
| **4. Counters + push** | Counter reducer (unit-tested against existing event metadata), CounterCard using the shared offer deadline, server clock offset, push registration, notification deep links, deep-link resolver | Q7 | Counters correct under reconnects and clock skew; pushes open the right ride from cold start |
| **5. Activity + receipts** | Activity tab, history detail, event timeline, Repeat and Return Trip | Phase 3 | AC §17.2/17.3 pass |
| **6. Payments + disputes** | PaymentPanel (cash/UPI), UPI intent, dispute flow | Q3 | Payment instructions correct; dispute submission and state verified |
| **7. Safety hardening** | Safety sheet, SOS, Share Trip, OTP secure-screen handling, emergency-contact prompt | Q4 | Safety AC pass; SOS works offline for dialing |
| **8. Profile + templates** | Edit profile, emergency contact, saved routes (versioned), support, legal | Phase 1 | AC §17.4 pass |
| **9. Polish and release** | Accessibility audit, low-end Android perf pass, analytics verification, store assets, crash-free beta | All | Beta crash-free sessions ≥ 99.5%; release checklist signed off |

Phases 5, 6, and 8 can run in parallel once Phase 3 is stable.

---

## 20. Testing Strategy

| Level | Scope | Tooling |
| --- | --- | --- |
| **Unit (required)** | Counter reducer (supersede, shared deadline, assignment clears all, persisted response removal, dedupe, equal-version counter hints, ordering; fare change only after backend support); `formatINR`; fare clamping; phone validation; exhaustive status-to-UI selector (all imported statuses, including dispute history routing); storage migrations; clock-offset math | Jest |
| **Integration** | API client (401 single-flight refresh; invalid refresh rejection clears credentials; network/timeout/5xx/429 preserve credentials and allow retry; error mapping), WS reconnect/backoff and reconciliation with a mock server, query invalidation | Jest + MSW / mock WS |
| **Component** | `FareStepper`, `OtpField`, `CounterCard`, `OtpBanner` visibility rules | React Native Testing Library |
| **End-to-end** | Login → book → counter → assign → OTP → ride → pay → dispute; kill/relaunch in each status; offline/online toggle; push cold-start tap | Maestro or Detox against a staging API |
| **Manual device matrix** | Low-end Android (2–3 GB RAM), mid-range Android, recent iPhone; slow 3G; denied permissions | Test checklist |

Fixtures: a recorded event stream per scenario (happy path, multiple counters, driver cancel, expiry) shared by unit and E2E tests.

---

## 21. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Status enum or transitions differ from assumptions | Rework of ride screen | Lock §6 with API owner in Phase 0; single exhaustive selector over imported `RideStatus`; fixtures cover `OFFERING`, `TRIP_STARTED`, payment intermediates, and `PAYMENT_DISPUTED` |
| Duplicate rides on flaky networks | Wrong charges, driver confusion | Idempotency key + One Active Ride rule + `GET /rides` check on timeout |
| Missed events while backgrounded | Rider unaware of driver arrival | Push notifications + refetch on foreground/reconnect |
| Clock skew breaks counter countdowns | Rider acts on expired offers | Shared `RideDto.offeringExpiresAt` + learned clock offset; server rejects closed offer windows |
| Peer-to-peer payment disputes | Trust and support load | Clear copy, driver-confirmed settlement, dispute path from `PAYMENT_PENDING`, support SLAs |
| OTP leakage (screenshots, logs, push) | Ride/identity safety | Secure-screen flags, no persistence/logging, no OTP in push |
| Map cost or key management | Budget and release friction | Provider-agnostic wrapper; decide early (Q8) |
| Low-end Android performance | Poor ratings | Throttled location store, isolated re-renders, perf budget in CI/manual matrix |
| Saved routes lost on reinstall | User confusion | Clear "this device only" messaging; revisit server sync post-MVP |

---

## 22. Definition of Done (MVP)

- All Phase 0–9 exit criteria met.
- All open questions Q1–Q10 resolved and reflected in this document (remove **(Proposed)** markers as each is confirmed).
- Acceptance criteria in §17 verified on iOS and Android.
- Unit tests for the counter reducer, money formatting, and status mapping pass in CI.
- Kill-and-relaunch resume verified for every active status.
- No OTP, token, or full phone number appears in logs, analytics, or crash reports.
- Accessibility and low-end Android performance checks signed off.
