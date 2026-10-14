# Cabzonee Backend Engineering Audit Plan

**Status:** Active implementation audit; current status and remaining gates below  
**Scope:** `apps/api`, backend persistence and runtime configuration, `packages/contracts`, and the backend requirements that constrain them  
**Review baseline:** repository revision `fdb51bbea856d5547fe70d33db0bd9e5891efe89`  
**Purpose:** Give an engineer a repeatable, evidence-led plan to verify backend behavior against product decisions and identify correctness, security, reliability, scaling, and test gaps. Baseline findings below describe the original code; the current status section records subsequent implementation.

## What this repo does and audit assumptions

Cabzonee is a ride booking and driver dispatch platform. Its API handles phone and admin authentication, KYC onboarding, geographic classification and fare quotes, ride dispatch and lifecycle, driver wallet commission, realtime events, and operations endpoints. This audit assumes a production deployment with multiple API processes, concurrent riders and drivers, MongoDB replica-set persistence, Redis-backed driver presence, and unreliable client or provider networks.

The baseline review traced the highest-impact code paths and read the project README, PRD, decision log, relevant LLDs, backend engineering guidance, API entry points, selected persistence adapters, deployment configuration, and representative unit and MongoDB integration tests. Subsequent implementation ran backend tests and MongoDB replica-set integration cases. Deployment, load, restore, provider and live multi-instance checks are still required before treating the backend as launch-ready.

## Requirements baseline and known conflicts

Use the latest approved, non-superseded decision in `docs/decision-log.md` and the matching current LLD as the product behavior baseline. Use `docs/prd.md` for product scope and `docs/engineering/` for engineering requirements. Treat old implementation plans, historical daily logs, and superseded decisions as context, not as current requirements.

Reconcile these conflicts before closing the related audit items:

1. **Resolved in D-039:** city pricing overrides state pricing, which overrides global pricing. Outstation trips crossing states use each state's rate for its segment, with global fallback. D-039 supersedes D-037's uniform-rate rule. Reconcile stale LLD prose and verify the route geometry and segment totals.
2. D-037 says pickup within an active city is the only serviceability gate, while D-038 permits pickup outside a city and prices from its nearest active city. D-038 appears later; confirm it is authoritative everywhere, including the PRD, zone LLD, API contract, and tests.
3. `ServiceClassificationUseCase` accepts a rider-requested service type even when it differs from its geographic recommendation. `docs/LLD/zones.md` says zones must not silently change rider choice, while `docs/LLD/zone-engine.md` and other design text emphasize geographic classification. Define whether a rider may choose City versus Outstation when the geography indicates otherwise, and which value determines pricing and dispatch eligibility.
4. **Resolved in D-040/D-041:** direct cash/personal UPI completion leaves `PAYMENT_PENDING`; the assigned driver's receipt confirmation settles and charges commission once. Rider-win dispute resolution refunds that commission with an immutable compensating entry; driver-win resolution retains it.
5. Some LLD content is stale: for example, `docs/LLD/database-schema.md` describes D-037 uniform pricing while D-038 adds a separate outstation tier. Update the source documents as part of requirement reconciliation, not by treating old prose as current code requirements.

The questions above are product or engineering decisions. The auditor should document the chosen answer and decision owner, then measure the implementation against that answer.

## Priority and evidence rules

- **P0 — stop-ship:** credible risk of unauthorized action, lost or duplicated money, invalid ride assignment, or irreversible state corruption.
- **P1 — launch blocker:** a required core flow can be bypassed, is missing, or can leave the system in inconsistent state.
- **P2 — significant:** important operational, privacy, test, API, or load weakness that needs an explicit acceptance or fix before broad production use.
- **P3 — follow-up:** measurable improvement with bounded current impact.

An item marked **Confirmed** is directly supported by inspected code. **Decision needed** means the docs disagree or the requirement is open. **Verify** means static evidence indicates a risk that must be reproduced against the real runtime or database. Do not convert an untested risk into a confirmed production incident.

For every issue, record the triggering request or race, observed result, expected result and source, severity, affected files, a minimal proposed remedy, regression evidence, owner, and status. Keep separate issues separate when different owners or fixes are involved.

## Findings to verify and address

### Must fix

#### 1. Wallet posting and ride completion are not one atomic settlement

**Priority:** P0 · **Status:** Confirmed from code; reproduce against replica set.

- **Evidence:** `apps/api/src/modules/rides/application/useCases/completeRide.usecase.ts` writes a commission transaction, saves the wallet balance, writes ride events, and then saves the settled ride as separate operations. `MongoWalletRepository` also writes the transaction and balance in separate operations. The interfaces expose no database-session or conditional version operation.
- **Problem:** If the process exits after the ledger write but before the ride transition, a retry can post again or encounter a unique idempotency-key error while the ride remains started. If two completion requests run together, both can read the same ride and wallet, then overwrite the balance or disagree about the ledger. A transaction record and materialized balance can therefore diverge despite the intended idempotency key.
- **Audit instructions:** Run two simultaneous completion requests for one started ride; inject a failure after each persistence step; restart and retry. Compare ride state, wallet balance, transaction count, transaction before/after balances, and events. Repeat the same failure and concurrency matrix for admin wallet adjustments and cancellation compensation.
- **Acceptance:** Each business operation commits its state transition, balance change, immutable ledger entry, and required event as one MongoDB transaction or a documented, idempotent recovery protocol. Concurrent requests yield exactly one financial posting; retries return the same result. Reconciliation detects and reports deliberately injected inconsistencies.
- **Reason:** Financial entries are difficult to reverse safely, and the wallet LLD requires an auditable ledger and concurrency protection.

#### 2. Ride acceptance checks the wallet but not all authoritative driver eligibility

**Priority:** P0 · **Status:** Confirmed at use-case boundary; verify any upstream dispatch gates.

- **Evidence:** `apps/api/src/modules/rides/application/useCases/acceptRide.usecase.ts` checks wallet balance and atomically claims a ride. `DriverOfferEligibility` checks wallet and existing active rides. `canDriverGoOnline` checks account, KYC, and vehicle assignment. The acceptance use case does not call the full eligibility rule or verify approved vehicle category, valid required documents, suspension/fraud status, or a concurrent assignment to another ride.
- **Problem:** A driver who goes offline, has expired documents, becomes suspended, or accepts another ride after an offer is created can still claim the ride if they retain a valid token and a positive wallet. The ride claim is atomic for the ride, but the driver's availability across rides is not reserved atomically.
- **Audit instructions:** Create an offer, then independently take the candidate offline, expire a required document, suspend the driver, set their wallet to zero, and assign them to another active ride before acceptance. For each case, call the accept endpoint directly (do not rely on the offer list or WebSocket filtering). Race two different rides against one driver.
- **Acceptance:** The server revalidates all D-036 eligibility conditions at claim time and provides an atomic per-driver reservation or equivalent database invariant so one driver cannot win two active rides. Invalid claims return a stable conflict or forbidden response and do not mutate the ride.
- **Reason:** Dispatch filters are advisory; the final state-changing endpoint must enforce the business rule independently.

#### 3. Ride lifecycle updates can overwrite concurrent state changes

**Priority:** P0 · **Status:** Confirmed pattern; reproduce competing transitions.

- **Evidence:** `MongoRideRepository.save` uses `findByIdAndUpdate` with an upsert and no expected version or prior status predicate. `StartRideUseCase`, `CompleteRideUseCase`, `CancelRideUseCase`, `ExpireOffersUseCase`, and other transitions read a ride, validate it in application code, then save the full entity.
- **Problem:** Two callers can both validate the same old state and both write different next states. For example, a rider cancellation and driver arrival can race; expiry can race with acceptance; two completion requests can both pass the `TRIP_STARTED` check. Last-write-wins may erase a valid action or create financial/event records for a transition that did not win.
- **Audit instructions:** Race cancel versus arrive, accept versus expiry, start versus cancel, and duplicate complete requests repeatedly against MongoDB. Assert final state, exactly one winning transition, no contradictory timestamps, and no event/ledger entry for a losing transition.
- **Acceptance:** State changes are conditional on the expected current status and version (or equivalent atomic update); a losing request has no side effects. `save` cannot silently create a new ride during an update of an unknown id.
- **Reason:** Ride status governs rider safety, eligibility, and money. An in-memory check is not a concurrency guarantee.

#### 4. City-admin permissions are not enforced at the resource boundary

**Priority:** P0 · **Status:** Confirmed route wiring; test cross-city access.

- **Evidence:** `requireZoneAccess` checks assigned city ids, but `apps/api/src/routes.ts` wires zone and pricing admin routers with only `requireRole('SUPER_ADMIN', 'CITY_ADMIN')`. `identity.container.ts` does not apply the zone-scope middleware to those mutations. Driver-application review similarly allows both roles without an assigned-city check.
- **Problem:** A CITY_ADMIN can submit a valid id for a zone or pricing configuration outside their assignment, or review an application outside their city. Role membership alone does not enforce the City Admin scope described in `docs/LLD/auth.md` and `docs/LLD/open-questions.md` OQ-025.
- **Audit instructions:** Create two city zones and a CITY_ADMIN assigned to only one. Try list, detail, create, update, activate, delete, geometry mutation, pricing CRUD/activation, and driver-application read/review against the other zone. Test id fields in both URL and request body, and test a zone id that is missing or malformed.
- **Acceptance:** Each operation enforces resource scope on the server, including indirect relationships such as application-to-driver-to-city. SUPER_ADMIN keeps the explicitly approved global scope. Unauthorized and nonexistent resources do not leak sensitive detail.
- **Reason:** The LLD explicitly calls out city-level authorization; the middleware exists but is not part of the relevant route chain.

#### 5. Admin ride endpoints allow actor substitution and contain simulation identities

**Priority:** P0 · **Status:** Confirmed implementation; establish exposure and reproduce.

- **Evidence:** `apps/api/src/modules/rides/interface/rides.controller.ts` lets admin roles select `riderId` or `driverId` from the request body and falls back to fixed seeded identifiers. The admin route policy allows multiple admin roles on lifecycle routes. `SimulateFleetUseCase` publishes fixed simulated driver identities, and the admin dispatch simulator is available outside a production-only guard.
- **Problem:** An admin-authorized caller can act as another rider or driver through normal ride lifecycle endpoints. A simulator intended for operations or development can create production-like presence. Hard-coded identifiers can target real seeded data if deployment data overlaps.
- **Audit instructions:** Enumerate every admin role against ride create, accept, arrive, start, complete, and cancel. Trace the caller id written to events and financial entries. Test simulator enable/clear in production configuration and confirm simulated presence cannot enter candidate selection in a live deployment.
- **Acceptance:** Admin simulation uses a separately authorized, environment-gated path and cannot impersonate a production actor. Legitimate support overrides have an explicit permission, reason, audit actor, and narrow scope. Production disables simulated fleet data by configuration that is validated at startup.
- **Reason:** Privileged operations need attributable identity and separation from production business actors.

#### 6. Authentication defaults to in-memory OTP storage and a console SMS adapter

**Priority:** P0 · **Status:** Confirmed dependency wiring; verify production boot behavior.

- **Evidence:** `apps/api/src/modules/identity/identity.container.ts` defaults to `MemoryOtpStoreAdapter` and `ConsoleSmsGatewayAdapter`. These are process-local adapters; OTP state is lost on restart and is not shared across API replicas. The SMS adapter stores OTPs in memory rather than delivering them to a provider.
- **Problem:** A production login cannot reliably deliver an OTP, and verification can fail when a request lands on a different process or after restart. The current fallback does not appear to prevent a deployment from booting with these adapters.
- **Audit instructions:** Inspect each stage/prod entry point and deployment environment. Start two API instances with the production settings, request OTP on one, verify on the other, restart between request and verify, and inspect logs and responses for OTP disclosure. Confirm provider credentials, delivery callbacks, and failure behavior.
- **Acceptance:** Production/stage require an explicit durable/shared OTP store and real SMS gateway. Startup fails closed if an unsafe adapter is selected for a live environment. A provider failure returns a generic, retry-safe response and cannot leave a usable OTP undisclosed to its recipient.
- **Reason:** Phone verification is the identity root for rider, driver, and admin-adjacent accounts.

#### 7. OTP and quote endpoints need distributed abuse controls

**Priority:** P1 · **Status:** Confirmed in route wiring; check edge proxy controls.

- **Evidence:** OTP request and verify routes have no visible route-level throttling; the request cooldown uses the process-local default OTP store. The separate quote rate limiter is not visibly wired into `pricing.container.ts`, `buildPricingRouter`, or `routes.ts`. Quote token verification checks signature, JSON parsing and expiry but does not validate the decoded payload schema or numeric bounds.
- **Problem:** Requests spread across instances can bypass a local cooldown and increase SMS or routing-provider costs. Malformed signed claims can reach downstream pricing logic if token contents violate the expected shape.
- **Audit instructions:** Burst OTP and quote requests by phone, IP and user across multiple API instances; distribute wrong OTP attempts; compare registered versus new phone responses; test malformed, expired, oversized and incorrectly shaped signed quote payloads. Confirm edge/WAF limits and provider budgets.
- **Acceptance:** Shared or edge rate limits cover OTP delivery, verification and quote generation. Validate the signed quote payload against a runtime schema; keep errors generic enough to prevent account enumeration; alert on provider spend and sustained throttling.
- **Reason:** OTP and quote generation are externally costly or security-sensitive entry points.

#### 8. Document uploads accept client-supplied storage keys without a visible upload security boundary

**Priority:** P1 · **Status:** Confirmed API contract; storage implementation needs end-to-end verification.

- **Evidence:** `uploadDriverDocumentRequestSchema` accepts a `storageKey` string and hash from the client. `UploadDriverDocumentUseCase` stores those values but does not verify that the object was uploaded by this user, belongs to this application, is private, has an allowed MIME type/size, or is scanned. `GetDriverProfileUseCase` returns document entities to the driver profile controller.
- **Problem:** A driver may reference another object, submit a fabricated hash, or cause arbitrary object keys to be stored. If the profile endpoint returns keys or signed URLs without policy checks, private identity documents may become accessible outside the intended reviewer flow.
- **Audit instructions:** Trace the mobile upload contract, signed-upload creation (if any), object ACL, download/preview route, document DTO serialization, retention/deletion, consent capture, malware scanning, and access logs. Try cross-user keys, expired uploads, unsupported file types, oversized objects, and guessed object identifiers.
- **Acceptance:** The API binds an upload authorization token to actor, application, expected document type, size and expiry; the server verifies object metadata and ownership before saving it. Only authorized reviewers can fetch private files; reads are audited; retention, deletion, encryption, consent, and redaction are specified.
- **Reason:** Government identity documents are high-impact personal data. Metadata validation alone does not secure the uploaded object.

#### 9. Money and ride state do not implement the documented payment-confirmation flow

**Priority:** P1 · **Status:** Confirmed mismatch; product decision needed.

- **Evidence:** `CompleteRideUseCase` moves a started ride directly to `SETTLED` and debits commission. The active ride router has no cash-received, payment dispute, UPI confirmation, or settlement endpoint. Payment models exist in the ledger package but are not in the inspected route/container flow. `docs/LLD/ride-lifecycle.md` and D-033 describe `PAYMENT_PENDING`, driver cash confirmation, and `PAYMENT_DISPUTED`.
- **Problem:** The API can report a ride as settled and collect platform commission without evidence that the rider paid. A rider also has no backend dispute path required by D-033. This may be intentional only if the direct cash/personal-UPI model in the driver-app spec supersedes D-033.
- **Audit instructions:** Resolve the source conflict first. Then exercise cash and personal UPI completion, interrupted confirmation, duplicate confirmation, disputed payment, and commission posting. Verify rider and driver see the same payment state and the admin can resolve a dispute with a traceable outcome.
- **Acceptance:** The selected payment model has explicit states and authorized transitions; payment confirmation is durable and idempotent; disputes are recorded and reviewable; commission timing follows the approved decision. Tests prove that completion alone cannot imply payment unless the approved model expressly defines it so.
- **Reason:** Payment status is a financial claim to both parties and drives commission accounting.

#### 10. Admin wallet writes and top-up/reversal flows lack a complete enforced ledger contract

**Priority:** P1 · **Status:** Confirmed missing product paths and non-atomic writes; provider scope needs decision.

- **Evidence:** `AdminAdjustWalletUseCase` records a transaction and then saves a new balance as separate operations. The driver wallet router exposes only `GET /me`; the inspected routes have no top-up, payment provider callback, reconciliation, or reversal operation. The LLD wallet design requires immutable ledger entries, top-up, reversal, and reconciliation. A `PAYMENT_WEBHOOK_SECRET` exists in config but no payment webhook route is wired in `routes.ts`.
- **Problem:** Drivers cannot complete the required prepaid top-up through the API, and an interrupted or retried admin adjustment can disagree with the stored balance. Configuration can suggest webhook support even though no route handles the callback.
- **Audit instructions:** Inventory all transaction reference types and create/read/update paths. Verify the actual deployed recharge provider flow, callback signature verification against the raw request body, provider-event idempotency, duplicate/out-of-order callbacks, chargeback/refund handling, and daily reconciliation. Run simultaneous adjustments against the same wallet.
- **Acceptance:** Every balance-changing route validates amount, actor, owner and idempotency key; ledger posting and balance update are atomic; provider events are authenticated and replay-safe; reversals append compensating transactions instead of editing history. Unimplemented provider configuration is removed or explicitly marked unused after an owner decision.
- **Reason:** A wallet is a ledger, not just a mutable balance field.

#### 11. Ride snapshots do not retain all quote facts and can fail to freeze prices

**Priority:** P1 · **Status:** Confirmed in ride creation; reconcile current fare policy.

- **Evidence:** `CreateRideUseCase` copies route distance and provider into a ride but sets `routeSnapshot.polyline` to an empty string. It saves selected pricing fields but not a full fare breakdown or state-distance breakdown. `CreateQuoteUseCase` may apply state-specific rates. `UpdatePricingConfigUseCase` changes fields on the same config without incrementing `version`; `CreateRideUseCase` only rejects a quote when the current version differs from the signed quote's version.
- **Problem:** A quote can remain valid after rates change if the config version stays constant. The ride then snapshots the changed rates alongside a quote fare computed from the older rates. Missing route geometry and component breakdown also prevent reliable reconstruction and fare dispute review.
- **Audit instructions:** Issue a quote, edit each rate/commission field, and submit the old token. Test update, activate, retire, and two concurrent config changes. Compare quote token, current config, ride snapshot, and resulting fare. Compare saved route/pricing snapshot with the route and quote response.
- **Acceptance:** Any price-affecting edit creates an immutable new version or otherwise invalidates outstanding quotes. The ride retains the exact effective inputs and outputs needed to reproduce its quote, with any location data minimized under an approved retention policy. Old rides never read current pricing to explain or settle themselves.
- **Reason:** D-005/D-034 require fare inputs to be frozen at request time and historical rides to remain explainable.

#### 12. Classification and state-pricing behavior diverge from potentially current decisions

**Priority:** P1 · **Status:** Decision needed; implementation evidence confirmed.

- **Evidence:** `ServiceClassificationUseCase` derives a geographic recommendation but sets `finalType = requestedService ?? geoRecommendedType`; it can classify an outstation route as city if a request supplies `IN_CITY`. `CreateQuoteUseCase` computes state segments and loads per-state pricing configs for outstation quotes, although D-037 says route scope is display-only and D-038 introduces a separate outstation tier. The current tests include state-distance pricing assertions.
- **Problem:** A client-supplied service choice can change which fare tier is used, and state-rate overrides can affect fares in a model whose decision log says state rates were removed. This creates inconsistent fares and tests depending on which document the team reads.
- **Audit instructions:** Resolve the document conflicts in the baseline section. Build a decision-to-code matrix for each combination of pickup inside/outside a city, drop in same/other city, within/outside buffer, route scope, vehicle category, and requested service. Verify quote, ride, admin fare view, and driver offer all preserve the same classification and pricing tier.
- **Acceptance:** The decision owner signs one canonical classification rule. The implementation, LLDs, shared DTOs, and tests match it. If state breakdown remains display-only, it cannot alter the calculated fare; if requested service is allowed to override geography, the allowed combinations and safety limits are explicit.
- **Reason:** A disagreement in pricing policy cannot be resolved safely by code inspection alone.

#### 13. Reapplication, expiry, and KYC-provider verification are incomplete or unverified

**Priority:** P1 · **Status:** Partial workflow confirmed; remaining requirements need implementation evidence.

- **Evidence:** The submit flow checks for document types and an assigned vehicle. The inspected identity container wires no external KYC provider; application verification fields are present. `CreateDriverApplicationUseCase` increments `reapplyCount` after rejection but does not enforce a cap or cooldown. `canDriverGoOnline` checks driver status and KYC status, not document expiry. Review updates the application, driver, vehicle, and documents sequentially.
- **Problem:** A driver can potentially reapply repeatedly; document expiry is not part of the checked online eligibility function; provider verification may be absent. A failed review update can leave application, driver, vehicle, and document states inconsistent.
- **Audit instructions:** Verify provider calls and callbacks in all environments. Test document expiry at boundary time, missing/invalid RC, insurance and permit documents, fixable versus hard-fraud rejection, reapplication cooldown/cap, concurrent review, and failure between each approval write. Identify any expiry sweep/job and alerting.
- **Acceptance:** The product owner decides cap/cooldown and re-verification rules; approved documents are verified, unexpired and complete before offers; provider evidence is stored safely; review has one atomic or recoverable transition with immutable reviewer and reason metadata.
- **Reason:** D-036 defines document validity as an offer gate; the PRD requires government ID and driving licence verification followed by review.

#### 14. The trust score uses cancellation proxies and omits dispute evidence

**Priority:** P1 · **Status:** Confirmed calculation input gap; confirm public display exposure.

- **Evidence:** `adminRiders.usecase.ts` derives list cancellations as `totalRides - completedRides`, which includes every non-completed state, not only cancellations. It calls `calculateTrustScore` without `disputesCount`, which defaults to zero. The trust-score calculator includes a dispute penalty and the requirements recommend dispute history and recency.
- **Problem:** Active, expired, disputed, and otherwise incomplete rides can be counted as cancellations, while no disputes ever affect the score in this path. A score shown to drivers or riders may therefore communicate a materially inaccurate trust assessment.
- **Audit instructions:** Compare rider and driver score inputs against canonical ride and dispute records. Test empty history, active rides, expired offers, driver/rider cancellations, no-shows, resolved and unresolved disputes, rating changes, and list versus detail endpoints. Confirm minimum history and score visibility match approved policy.
- **Acceptance:** Scores use explicitly defined event categories and a real dispute source, with the same deterministic result in list and detail views. Public exposure is gated by the approved minimum-history and review-appeal rules. If no authoritative dispute module exists, the API must not represent its count as zero by default without disclosure.
- **Reason:** Trust scores affect marketplace access and reputation, so incorrect input classification can harm users.

#### 15. Realtime events and notifications are best-effort and process-local

**Priority:** P1 · **Status:** Confirmed delivery model; verify recovery behavior.

- **Evidence:** `RideRealtimeNotifier` catches delivery errors; `RealtimeHub` keeps sockets in process memory and sends offers to connected drivers. The notification worker's handler only logs job metadata. There is no inspected durable outbox, cross-instance publish path, or completed notification delivery. Rider updates target the booker, not clearly a distinct passenger.
- **Problem:** A process restart, disconnected client, or multi-replica deployment can lose an offer or lifecycle notification. Offline drivers and passengers booked by another rider may miss required updates; queue wiring can appear healthy while doing no delivery.
- **Audit instructions:** Test disconnected/reconnecting clients, API restart after state changes, two API replicas, Redis/pub/sub outage, duplicate events, worker failure/restart, offline offers, and a separate passenger identity. Verify replay and authoritative state reconciliation against WebSocket contracts.
- **Acceptance:** Define delivery guarantees per event. Business-required events are durably retried or recoverable, reconnect returns authoritative state, multi-instance fan-out works, and consumers handle duplicates. Add monitoring for queue lag and delivery failures.
- **Reason:** Dispatch and ride safety are time-sensitive; best-effort process-local delivery is not a deployment-wide guarantee.

#### 16. Admin audit history is not consistently coupled to sensitive mutations

**Priority:** P1 · **Status:** Confirmed on inspected examples; perform a full mutation inventory.

- **Evidence:** Zone geometry updates save the changed zone and then separately save an optional audit record. Ride lifecycle changes sometimes write events, but create and accept do not consistently write the immutable event sequence specified by the LLD. Pricing edits update a config without an inspected audit entity or versioned change event. Admin route responses can be changed before audit persistence succeeds.
- **Problem:** If audit persistence fails, an administrative change can take effect without a durable record of actor, before/after values, and reason. Auditors cannot reliably reconstruct who changed pricing, geometry, approval state, or financial adjustments.
- **Audit instructions:** Inventory every admin `POST`, `PATCH`, `DELETE`, activation, approval and adjustment. For each, capture actor, role, request id, reason, before/after snapshot, and timestamp. Inject audit-write failures and inspect whether the business mutation still commits. Verify audit access control, retention, and tamper resistance.
- **Acceptance:** Required sensitive mutations and audit records commit together or use a durable retry/outbox design. Events are append-only, identify the authenticated administrator rather than a client-supplied actor, and cannot be silently edited or deleted through normal API paths.
- **Reason:** Administrative accountability and auditability are explicit MVP requirements.

### Should fix

#### 17. Ride-for-someone-else and cancellation policy are only partially represented

**Priority:** P1 · **Status:** Confirmed in lifecycle inputs; fees need requirement confirmation.

- **Evidence:** `CreateRideUseCase` sets `passenger.riderId` to the booking rider, while accepting name and phone separately. `RideRealtimeNotifier` looks up the booker for rider updates. Cancellation fee constants are hard-coded in `cancellationFee.service.ts`; the daily cancellation count uses server-local midnight.
- **Problem:** A distinct passenger cannot be represented as a verified user independently of the booker, and receives no identified realtime updates. Hard-coded fees cannot be configured by city/vehicle as proposed in OQ-028. Cancellation counts near midnight can fall into the wrong day if server timezone differs from the operating timezone.
- **Audit instructions:** Test a verified booker with a different passenger phone and no passenger account; check OTP retrieval, tracking, receipt, history and dispute ownership. Confirm approved fee policy and business timezone; test grace boundaries and cancellations around local midnight.
- **Acceptance:** Booker and passenger fields have clearly defined identity and liability semantics; passenger contact is verified as required and receives only authorized ride updates. Approved fee configuration and timezone rules are explicit; counts are computed against the configured business day.
- **Reason:** The PRD explicitly identifies third-party bookings, accountability, and cancellation behavior as loopholes to close.

#### 18. API and data contracts need a route-to-contract consistency audit

**Priority:** P2 · **Status:** Audit needed.

- **Evidence:** The API is split across Express route modules and generated OpenAPI registrations, while cross-package request and response types live in `packages/contracts`. Payment and review entities exist or are required by LLDs but corresponding public routes were not found in the inspected route tree. Optional router builders and simulated/test routes also create conditional API surfaces.
- **Problem:** Mobile clients can be generated against a contract that does not match actual auth, response fields, role requirements, error codes, pagination, or lifecycle states. Undocumented or missing routes can block required product flows.
- **Audit instructions:** Enumerate every mounted route and middleware in `apps/api/src/routes.ts`; match each to Zod request schema, shared DTO, Swagger operation, authorization test, and user story. Validate generated OpenAPI against the actual router and inspect `toRideView` for sensitive or private fields.
- **Acceptance:** Every shipped route has one documented request/response contract, authorization rule, stable error mapping, and contract test. No required MVP story depends on an absent endpoint. Public projections exclude hashes, provider secrets, internal metadata and unnecessary personal data.
- **Reason:** Shared contracts are the boundary between backend, admin web, and driver client.

### Nice to have

#### 19. Finance queries and process-local infrastructure need scale tests

**Priority:** P2 · **Status:** Confirmed query and architecture shape; measure at expected scale.

- **Evidence:** `MongoWalletRepository.getStats` loads all wallets and transactions; `listWallets` loads transaction history and paginates in application memory. `TtlRouteCache` and `RealtimeHub` are process-local, the API runs offer-expiry sweeps in each process, and stale Redis GEO members are cleaned lazily.
- **Problem:** Financial dashboard work and memory use grow with total history. Multiple API replicas can duplicate expiry scans, route-provider calls, and notifications, while local connection maps cannot fan out across instances. Stale presence can accumulate until later cleanup.
- **Audit instructions:** Seed 10k, 100k and projected-scale financial data; measure database reads, memory and p95. Run multiple API processes; record route-provider cache hits, repeated expiry attempts, stale GEO members, event duplicates, and reconnect behavior. Restart one instance during active rides.
- **Acceptance:** Finance queries aggregate and paginate with bounded database work. Process-local scheduling, cache and sockets have documented limits, measured costs, and safe duplicate behavior. Stale presence is cleaned on a bounded schedule; shared coordination is used where correctness or measured cost requires it.
- **Reason:** The service has independently scalable API and worker processes, while query and coordination behavior grows with data or instance count.

#### 20. Architecture rules and production release checks need broader evidence

**Priority:** P2 · **Status:** Confirmed configuration; production artifact not executed.

- **Evidence:** `apps/api/.dependency-cruiser.cjs` sets `MODULE_TIERS = [['health']]`, so generated module-tier rules cover only one module. Dependency-cruiser passed for 320 modules and 990 dependencies, but `apps/api/Dockerfile`, production Compose, and API/worker containers were not built or run. The Dockerfile package filter casing differs from the package name and needs verification.
- **Problem:** The architecture gate can pass while other module boundaries drift. Source typechecking does not prove production artifacts contain the right files, start with safe adapters, pass health checks, or stop cleanly.
- **Audit instructions:** Compare imports with the engineering boundary rules and add negative checks for forbidden edges. Build API and worker from a clean checkout with a frozen lockfile; start production Compose; smoke-test health, auth, quote and settlement; restart API/worker during work; inspect shutdown, logs, secrets, backups and restore.
- **Acceptance:** Every critical module boundary has an enforced, tested rule. Production build and runtime smoke pass from a clean checkout; non-root containers, correct entry points, health checks and safe adapter selection are verified. Record a restore drill.
- **Reason:** A passing source-level check is not evidence that the deployed artifact or the full documented architecture works.

## Ordered audit execution plan

### Phase 1 — Freeze the requirement baseline

1. Read `docs/prd.md`, `docs/decision-log.md`, `docs/LLD/open-questions.md`, and the current ride, fare, zone, auth, database, dispatch, wallet, API, and WebSocket LLDs.
2. Search for superseded decisions and historical descriptions in all `docs/`, `daily-work/`, and root project plans. Record each conflict in a small decision table with document, section, date, status, and affected backend behavior.
3. Ask the product/engineering decision owner to resolve the five conflicts in the baseline section. Record the answer in the decision log and update affected LLDs before using them as acceptance criteria.
4. Convert each confirmed decision into a traceability row: requirement id, actor, trigger, expected state/result, source document, API endpoint, code owner, tests, and audit status.

**Exit check:** No P0/P1 business rule in fares, assignment, settlement, KYC eligibility, cancellation, privacy, or admin scope depends on an unresolved document conflict.

### Phase 2 — Secure boundary and identity review

1. Draw the HTTP route tree from `apps/api/src/routes.ts`. For every route, write the middleware order and authorized roles. Include WebSocket upgrades and all admin routes.
2. Trace OTP request, OTP verify, login, refresh, logout, suspension, password-based admin login, and role changes across at least two API processes. Verify session revocation after privilege removal and account suspension. Race refresh-token reuse and concurrent refresh calls.
3. Trace driver document upload from client authorization through object creation, metadata persistence, review access, serialization, retention, and deletion. Confirm secrets and PII do not appear in logs, error responses, public Swagger, ride event payloads, or unauthorized profile responses.
4. Verify city-admin access at the target resource and at related resources (pricing, drivers, applications, rides, wallets, zones). Do not count role middleware as city scoping.
5. Test rate limits and lockouts with distributed requests and provider failures. Confirm production startup rejects console SMS, in-memory OTP, fixed OTP, test approval, and simulator behavior unless an explicitly approved staging override applies.

**Exit check:** A permission matrix and data-flow diagram are reviewed; every denial is enforced server-side; all user and admin mutations have actor attribution; the production adapter set is verified.

### Phase 3 — Ride state, dispatch, and realtime correctness

1. Write the approved ride state transition table from `docs/LLD/ride-lifecycle.md`, including actor allowed to request each edge, required fields, emitted event, and payment consequence.
2. For each state-changing endpoint, execute happy path, duplicate request, invalid state, wrong actor, missing entity, stale version, process crash, and concurrent transition cases against MongoDB replica-set storage.
3. Verify D-036 eligibility at both online transition and final acceptance. Race one driver across two rides and two drivers across one ride. Confirm one winner, one driver reservation, and a consistent offer expiration result.
4. Exercise expiry with multiple API processes. Confirm expired rides remain in history, retrying the job is harmless, and riders receive an explicit recoverable notification.
5. Test WebSocket authentication, role/channel isolation, pickup OTP visibility, driver location authorization, ping limits, slow clients, reconnect replay, multi-replica fan-out, and offline offer recovery. Ensure no driver can subscribe to another driver's or rider's private ride data.
6. Verify passenger/booker separation and who receives ride status, safety notifications, pickup OTP, payment receipt, and dispute updates.

**Exit check:** One authoritative ride state wins every race; each participant sees only authorized data; event loss or reconnect has a defined recovery path.

### Phase 4 — Fare, geography, and immutable records

1. Build the geography/classification matrix: pickup in city, outside city, within/outside buffer; destination in same/other city; domestic boundary; unknown geocode; service type; vehicle category. Include polygon edge and overlapping-zone cases.
2. Test routing provider timeout, retry, malformed response, no route, cached result, provider outage, and cache expiry. Verify route distance—not straight-line distance—is used in production and Haversine is blocked in production.
3. For each classification, independently recompute the fare using integer paise, correct city/outstation tier, minimum fare, buffer surcharge, floor/ceiling, vehicle category, and commission snapshot. Reconcile API, contract, rider display, driver offer, and saved ride fields.
4. Create a quote, mutate every pricing field, activate a newer version, deactivate the config, and then attempt ride creation with the old token. Verify the approved stale-quote policy and exact saved snapshot.
5. Verify quote signature, TTL, payload schema, route/provider provenance, precision of coordinates, and all error cases. Confirm no geocoding or route provider fallback changes an approved fare silently.
6. Review stored route polylines and addresses as personal location data; establish minimum retention, authorized access, and deletion/retention behavior.

**Exit check:** The fare for a quote can be independently reproduced from an immutable snapshot, and all classification cases follow one approved current rule.

### Phase 5 — Financial lifecycle and reconciliation

1. Agree on payment states and whether direct personal UPI/cash acknowledgement supersedes D-033. Map each transition to an authenticated actor and immutable event.
2. Race completion, commission settlement, cancellation compensation, admin adjustment, top-up, provider callback, reversal, and duplicate retry. Inject a process failure after every individual write.
3. Compare wallet balance to the sum of immutable entries for every test wallet. Check non-negative constraints where required, zero-wallet behavior during an active trip, commission percentage snapshot, integer-paise rounding, and uniqueness of idempotency keys.
4. Test out-of-order and repeated provider webhooks, invalid signatures, amount/currency mismatch, unknown payment reference, chargeback, refund, and partial settlement.
5. Run a reconciliation report that identifies missing transaction, duplicated transaction, incorrect before/after balance, and settled ride with no expected commission. Verify the report is actionable and access-controlled.

**Exit check:** A retry cannot duplicate value; an injected failure cannot leave an undetected ledger/balance/ride disagreement; disputes and reversals preserve original evidence.

### Phase 6 — Driver verification, trust, and operational administration

1. Test application draft, submit, automatic/provider verification, manual approval, each rejection class, document replacement, reapplication cap/cooldown, document expiry, suspension, and reinstatement.
2. Race admin approvals and rejections and inject failures between each persisted entity update. Confirm one coherent outcome and full reviewer audit history.
3. Compare trust score inputs against canonical completed/cancelled/no-show/expired rides, verified reviews, ratings, and disputes. Confirm list, detail, driver offer, and client-facing score agree and respect the minimum-history policy.
4. Check reviews are only available for eligible completed rides, are unique per actor and ride, have approved visibility timing, and cannot be used for retaliation or repeated rating changes.
5. Review admin finance, dispatch, rider, driver, routing, zone, pricing, and application views for least privilege, pagination, PII exposure, bounded queries, and audit history.

**Exit check:** Driver eligibility can be explained from current approved documents and account state; all sensitive admin actions are attributable and scoped.

### Phase 7 — Contract, load, CI, and production release

1. Generate the OpenAPI document and diff it against actual mounted routes and `packages/contracts`. Check every error envelope, role requirement, status transition, pagination bound, WebSocket event, and deprecated/superseded field.
2. Run the repository's focused unit and integration suites, then the root CI command documented in `README.md`. Record exact command, commit, environment, duration, and pass/fail. Do not count skipped integration tests as passing.
3. Build the production Docker image from a clean checkout with frozen lockfile. Start the production Compose stack and perform smoke tests for API, worker, MongoDB replica-set transactions, Redis presence, route provider, auth, and graceful restart.
4. Load-test quote generation, OTP, nearby-driver search, location updates, ride acceptance races, ride list/history, finance queries, and WebSocket fan-out at an agreed expected peak and a documented headroom target. Record p50/p95/p99 latency, error rate, CPU/memory, database pool pressure, Redis memory, provider requests/cost, and queue lag.
5. Review dependency audit/SBOM, secret handling, backups, restore rehearsal, retention and deletion, alerting, and incident/runbook ownership. Confirm development test credentials and simulated data are absent from production.

**Exit check:** CI, tests, production build, runtime smoke, recovery drill, and load criteria all have recorded evidence and named owners for residual P2/P3 issues.

## Required test scenarios

Use deterministic clocks, fixed identifiers, isolated databases, and injected failures where possible. For concurrency cases, use the real MongoDB replica-set integration configuration so database atomicity is actually exercised.

| Area           | Required scenarios                                                                                                                                                          | Evidence to retain                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Authentication | OTP delivery failure; OTP expired, reused, guessed, locked; cross-replica verification; distributed rate limit; refresh rotation race/reuse; revoked admin; device mismatch | Request/response, session rows, provider log and rate counter     |
| Authorization  | Every role against every route; CITY_ADMIN outside assigned city; cross-rider and cross-driver ids; WebSocket channel isolation; test/simulator endpoint under prod config  | Route permission matrix and negative test report                  |
| Ride lifecycle | Invalid transition; wrong actor; duplicate retry; cancellation/arrival race; accept/expiry race; one driver/two rides; two drivers/one ride; stale offer                    | Before/after ride, event log, wallet and API status               |
| Pricing        | City, buffer, outstation, interstate label, outside-city pickup, polygon boundary, unknown state, E_RICKSHAW; quote expiry and config mutation                              | Independent paise calculation and stored snapshot                 |
| Money          | Completion retry; concurrent completion; injected crash after each write; duplicate adjustment; top-up webhook replay/out-of-order; reversal; zero balance mid-trip         | Ledger/balance reconciliation and payment provider references     |
| KYC            | Missing/expired docs; provider failure; fixable/hard rejection; reapplication; concurrent review; unauthorized file access                                                  | Application, driver, vehicle and document state plus audit record |
| Realtime       | Disconnected clients; API restart; multiple replicas; slow socket; repeated event; stale version; passenger distinct from booker                                            | Event delivery/replay timeline and recipient list                 |
| Operations     | Mongo/Redis/provider outage; worker restart; expiry with multiple instances; backup restore; production image smoke test                                                    | Logs, metrics, recovery time and restored record counts           |

## Audit evidence and issue report template

For every executed check, record:

```text
Audit ID:
Requirement and source:
Code path / endpoint:
Environment and commit:
Setup and exact trigger:
Expected result:
Observed result:
Evidence (test, query, log, trace):
Severity and confidence:
Root cause:
Smallest safe corrective action:
Regression test required:
Owner / target date:
Disposition: Open | Fixed | Accepted with owner and expiry | Not reproducible
```

For accepted risk, record the decision owner, business reason, compensating control, expiration/review date, and customer impact. Do not close a finding solely because a unit test passes; verify the persistence and deployed middleware path relevant to the failure.

## Initial finding register

### Current implementation review — 2026-10-13

The baseline register and historical progress note below retain their original evidence; they are **not** current status. D-039–D-041 now settle pricing, payment and dispute commission treatment. The user deferred selection and integration of SMS, external KYC verification and wallet top-up providers. Live authentication fails closed without a real SMS gateway.

| IDs          | Implemented in this working tree                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Remaining acceptance gate                                                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, 3, 10, 16 | Mongo transactions and version checks protect ride transitions, settlement, cancellation compensation, KYC review and wallet adjustments. Ride create/assign/start events are present. Adjustment and cancellation replay checks exist.                                                                                                                                                                                                                                           | Historical ledger reconciliation, reversal/dispute compensation, cancellation cap race, administrative audit coverage; top-up provider deferred.                                                              |
| 2            | Acceptance checks driver/user/vehicle/documents/presence. A unique Mongo index limits drivers to one active ride; a real Mongo competing-ride test passes.                                                                                                                                                                                                                                                                                                                        | Repair pre-existing duplicate active assignments before index deployment; complete mandatory-document onboarding consistency and sustained race tests.                                                        |
| 4, 5         | City admins are scoped to assigned zones and city pricing. Inferred state pricing creation is denied. Rider/driver actor substitution and production simulator routes are blocked.                                                                                                                                                                                                                                                                                                | City driver-application review lacks an authoritative city mapping and is restricted to super admins; adapt the admin simulator client and finish the role/route matrix.                                      |
| 6, 7         | Mongo-backed OTP challenges/attempts and IP rate counters have replica-set tests. Signed quote claims receive runtime validation. Unsafe production SMS/OTP composition fails closed.                                                                                                                                                                                                                                                                                             | Real SMS provider deferred; provider spend alerts and edge controls remain.                                                                                                                                   |
| 8, 13        | Driver profile request rejects substituted user IDs. Submission and approval require all five current document types, and DL/RC/insurance/permit require future expiry dates. Ride acceptance rechecks document validity. Manual KYC review is transactional and version checked, with concurrent review/rollback tests. Driving licences now use an authenticated private Cloudinary upload with a 500 KB PDF/JPEG limit and server-computed hash; the metadata-only HTTP route rejects DL submissions. | Private upload/ownership for other KYC document types, authenticated admin preview, DL expiry capture in the app, renewal notifications, reapplication policy details and external verification provider remain. |
| 9            | Trip completion leaves payment pending; driver receipt confirmation settles and charges commission once. A rider can file a reasoned post-confirmation dispute; support/super admin can resolve it. Rider-win outcomes append one commission-refund credit; driver-win outcomes keep the debit. Ride events serve as immutable dispute tickets, and open tickets have an admin list. HTTP authorization and Mongo rollback tests pass.                                            | Provider receipt evidence and a dedicated searchable history of closed tickets remain; notification delivery is still best effort.                                                                            |
| 11, 12       | City → state → global lookup and interstate state-segment rates are implemented; signed quote pins primary and segment pricing versions; ride snapshot preserves geometry and segments. Pricing updates and activation increment versions. Active replacement runs in a Mongo transaction; injected failure rolls retirement back in a replica-set test. A partial unique index enforces one ACTIVE price per level/scope/vehicle, with a concurrent first-activation regression. | Reconcile any pre-existing duplicate ACTIVE prices before deploying the index; verify real route geometry and fallback combinations against independent fare calculations; resolve rider service-choice rule. |
| 14, 15, 17   | Cancelled counts exclude unfinished rides; Redis fanout reaches sockets on other API instances in a two-hub test; cancellation business day uses India time.                                                                                                                                                                                                                                                                                                                      | Dispute counts, durable notifications/replay, passenger versus booker recipients/statistics, configurable cancellation policy and daily cap race remain.                                                      |
| 18–20        | Ride/profile OpenAPI shapes updated, the shared RideDto matches the public ride response, and a live ride response is checked against its OpenAPI schema. Architecture tiers expanded; Dockerfile package filter and geo build fixed; production rejects Haversine routing.                                                                                                                                                                                                       | Complete route-by-route contracts, finance query scale, production image/runtime, backup restore and load tests. Docker daemon was unavailable.                                                               |

**Regression evidence at this review:** all **338 tests across 38 backend files passed**, including Mongo replica-set rollback of a dispute refund, active pricing replacement, concurrent first activation and driver personal-profile persistence. API TypeScript and ESLint passed (0 errors, 6 existing script warnings); mobile TypeScript and lint passed (0 errors, 4 existing warnings), and its date/payload regression passed. Web TypeScript passed after its finance-hook change. Dependency-cruiser passed (329 modules, 1,064 dependencies). The API server and worker bundles built. The city-admin scope exploit, activation-version and payment-dispute tests failed before their fixes and passed afterward.

**Driver profile integration:** personal details now save before the onboarding wizard advances. The client uses the backend `name`, `dateOfBirth` and `gender` fields; a new profile-photo field stores a server-uploaded Cloudinary URL. Photo uploads accept bounded JPEG/PNG data and use server-held credentials. The user reports that Cloudinary setup is complete. Replaced/removed photo assets still need storage cleanup. Profile-photo storage does not close the separate private KYC document-storage finding. Fake local OTP credentials were removed and refresh-session identity handling was aligned with the actual backend response. Provider behaviour is covered by a mocked upload test; live Cloudinary and physical-device testing remain unverified in this workspace.

**Local runtime gate:** the mobile API URL is `http://192.168.1.5:4000`. The earlier Redis outage was resolved locally; a fresh MongoDB replica-set container was started and the development seed ran without `--reset`. On 2026-10-13, `/api/health` reported MongoDB and Redis healthy, the seeded admin login succeeded, and the authenticated driver-applications endpoint responded. The Android development bundle returned HTTP 200. Live phone, SMS and Cloudinary upload checks remain pending.

**Next sequence:** reconcile historical money and add dedicated closed-dispute search/payment evidence; secure private document storage; reconcile existing duplicate active pricing before index deployment; address passenger/booker and notification durability; then run full contract, deployment, restore and load gates. Provider integrations stay deferred until product supplies the providers.

### Historical progress review — 2026-10-13

- **20 findings total: 0 fully closed, 4 partially addressed (#1, #3, #10, #16), 16 open.** Counts describe finding status, not a percentage of engineering effort. The conditional ride-write work in #3 is implemented; broader concurrency verification remains.
- Reviewed the current working-tree changes and production wiring against the progress table below. The interrupted continuation added no further backend fixes. Existing changes remain uncommitted.
- Ran `graphify update .` successfully before this review. AST extraction completed for 584 files using the sequential fallback; no code-graph topology changes were detected. A Graphify query confirmed the transaction, repository, container and regression-test relationships.
- **Approved pricing hierarchy:** city-specific pricing takes precedence over state-specific pricing; state-specific pricing covers cities in that state without their own pricing; global pricing covers states and cities without a more specific configuration. This user clarification supersedes earlier conflicting documents for fallback selection. Implementation and scenario verification under #12 remain open; service-selection rules are a separate question.
- **Payment policy remains unresolved:** the documents disagree on immediate settlement versus payment confirmation and disputes. The first slice preserves existing immediate settlement. A product decision is still needed before changing that behavior under #9.
- The 296-test result below belongs to the completed implementation slice. Tests, build and deployment checks were not rerun during this documentation review.
- Next implementation order: final acceptance eligibility and one active ride per driver (#2); city-admin resource scope (#4); actor substitution and simulator isolation (#5); production OTP delivery/storage (#6); then remaining financial replay and reconciliation work (#1/#10).

### Implementation progress: transactional financial writes and ride transitions

The first implementation slice addresses the persistence risks in findings 1 and 3 and the atomic-write parts of findings 10 and 16. The original evidence above describes the review baseline; use the progress table below for current status. All other findings remain open.

| Finding | Current implementation                                                                                                                                                                                                                                                    | Remaining work                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1       | Completion, cancellation compensation and admin adjustments run in a MongoDB transaction. Retried completion of a settled ride returns without another commission or event pair.                                                                                          | Admin-adjustment and cancellation replay contracts; ledger reconciliation and recovery of pre-existing inconsistent data. |
| 3       | Lifecycle transitions compare the expected persisted ride version, increment it, and reject stale changes without an upsert. Start attempts also use version checks. Claims enforce the offering deadline at persistence time; expiry updates and events commit together. | Broader stress testing and the separate per-driver reservation/eligibility rules in finding 2.                            |
| 10      | Admin-adjustment ledger and wallet writes commit or roll back together; concurrent adjustments retain both amounts.                                                                                                                                                       | Provider top-up, reversal/reconciliation flows, and request idempotency keys.                                             |
| 16      | Existing en-route, arrived, cancellation, completion/settlement and expiry events share the transaction of their state changes.                                                                                                                                           | Missing creation, acceptance and start events; administrative audit coverage outside these paths.                         |

Production composition now injects `MongoUnitOfWork` through a required `UnitOfWorkPort`. It uses Mongoose's automatic transaction session propagation, verified in the installed package and the [official transaction documentation](https://mongoosejs.com/docs/transactions.html#using-asynclocalstorage). Financial writes remain sequential inside each transaction; realtime notifications run after commit. The configured MongoDB replica set is required; transaction failures never fall back to non-transactional writes.

Regression evidence includes one failing trip-start race before the conditional-write fix, then a passing result after it. Mongo integration tests verify single-posting completion retries, concurrent completion of one ride, concurrent settlement of different rides against one wallet, rollback after persisted wallet/event failures, cancellation and adjustment rollback, concurrent adjustments, competing expiry sweeps, and rejection of expired claims and stale/unknown ride updates. A behavioral pre-fix run was not captured for the new Mongo cases; they validate the implemented persistence guarantees.

Verification for this slice: **296 tests passed across 29 backend test files**, including **20 MongoDB replica-set integration cases**. TypeScript passed; dependency-cruiser passed for **323 modules and 1,008 dependencies**; ESLint reported **0 errors and 6 existing warnings** in development/seed scripts. API and worker production bundles built successfully. Docker deployment and load tests remain pending.

### Baseline register

| ID  | Priority | Finding                                                                                        | Status                                            |
| --- | -------: | ---------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   |       P0 | Wallet posting and ride completion are not atomic                                              | Confirmed; reproduce                              |
| 2   |       P0 | Final ride acceptance does not enforce all driver eligibility rules                            | Confirmed at use-case boundary                    |
| 3   |       P0 | Ride lifecycle writes are not conditional on current state/version                             | Confirmed; reproduce races                        |
| 4   |       P0 | CITY_ADMIN scope is not wired to zone, pricing, and application resources                      | Confirmed route wiring                            |
| 5   |       P0 | Admin actor substitution and simulator identities need production isolation                    | Confirmed implementation                          |
| 6   |       P0 | Identity container defaults to in-memory OTP and console SMS                                   | Confirmed wiring                                  |
| 7   |       P1 | OTP and quote endpoints need distributed abuse controls                                        | Confirmed route wiring and payload validation gap |
| 8   |       P1 | Document upload ownership and private-file controls are not enforced at the inspected boundary | Confirmed API contract                            |
| 9   |       P1 | Ride completion bypasses payment confirmation and dispute workflow                             | Confirmed; decision needed                        |
| 10  |       P1 | Wallet top-up/reversal and atomic adjustment are incomplete                                    | Confirmed inspected paths                         |
| 11  |       P1 | Pricing updates can leave quote versions unchanged; snapshots omit quote facts                 | Confirmed                                         |
| 12  |       P1 | Service selection and state pricing conflict with current decision history                     | Decision needed                                   |
| 13  |       P1 | KYC expiry, reapplication, provider verification, and atomic review need verification          | Partial gap confirmed                             |
| 14  |       P1 | Trust score inputs misclassify unfinished rides and omit disputes                              | Confirmed                                         |
| 15  |       P1 | Realtime and notification delivery is process-local and best effort                            | Confirmed architecture                            |
| 16  |       P1 | Sensitive changes and ride events are not consistently coupled to audit records                | Confirmed on inspected examples                   |
| 17  |       P1 | Third-party passenger, configurable cancellation policy, and business timezone need completion | Partial gap confirmed                             |
| 18  |       P2 | API, OpenAPI, and shared contracts need route-level consistency review                         | Audit needed                                      |
| 19  |       P2 | Finance queries and process-local infrastructure need scale tests                              | Confirmed query and architecture shape            |
| 20  |       P2 | Architecture rules and production release checks need broader evidence                         | Configuration confirmed; runtime not checked      |

## Review results and limits

- Direct TypeScript check passed: `node node_modules/typescript/bin/tsc --project apps/api/tsconfig.json --noEmit --incremental false`.
- Dependency-boundary check passed: direct dependency-cruiser reported no dependency violations across 320 modules and 990 dependencies. This result does not prove that the configured rules cover every intended module tier.
- The baseline audit did not run unit, integration, load, vulnerability, Docker, or deployment tests. The implementation slice subsequently ran the complete backend suite; results are recorded in the progress section. The earlier pnpm wrapper attempted package-manager setup before the baseline checks could run through it; direct commands were used instead.
- The highest-risk inspected paths were rides, wallet ledger, auth, dispatch, quote/classification, KYC, admin route wiring, realtime, deployment and their design references. Not every backend module, every test, production secret, cloud policy, client, or live provider configuration was inspected.

**Current verdict:** Core transactional and authorization fixes are in progress and have regression coverage. This audit is not fully closed: financial reconciliation, private document storage, durable notifications, closed-dispute search and deployment/load evidence remain. D-039 governs city/state/global pricing and state-segment outstation rates; D-040/D-041 govern payment confirmation and disputes. The remaining service-selection rule still needs a product decision.
