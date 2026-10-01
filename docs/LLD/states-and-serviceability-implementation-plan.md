# States & Serviceability — Implementation Plan for an AI Agent

Reproduces the work done against `docs/LLD/geo-reference-and-routing.md`: state-import fixes, state
history and admin API, the States web screen, and state-aware service classification.

**Out of scope:** routing, tolls, Cities module, state pricing (`/:id/pricing`), `POST /admin/states`.

Read first: `docs/LLD/geo-reference-and-routing.md`, `docs/engineering/coding-standards.md`,
`docs/engineering/module-anatomy.md`, `docs/engineering/frontend-architecture.md`.

---

## 0. Coding rules (follow exactly)

### General
1. **Match the surrounding code.** Same comment density, naming, idiom. Comments explain *why*, not
   what. No banner comments, no restating the code.
2. **Smallest change that satisfies the spec.** Do not refactor unrelated code. Do not touch files
   you have no reason to touch (`ZonesScreen.tsx`, `ZonesTable.tsx` had unrelated user edits).
3. **Additive and backward compatible.** New DTO fields are optional (`?: T | undefined`); older
   stored documents must still load (use `?? default` when mapping from Mongo).
4. **Never silently overwrite data.** Anything replaced is recorded in history first.
5. **No new dependencies.**
6. Run typecheck, lint and tests after each step. Do not proceed on red.
7. Do not commit unless asked. If asked, end the message with the attribution line from the
   session's system reminder.

### Backend (`apps/api`) — clean architecture, per module
- Layers: `domain` (entities, ports) → `application/useCases` → `infrastructure/persistence` →
  `interface` (controller, routes) → `<module>.container.ts` (wiring). Dependencies point inward;
  use cases depend on **ports**, never on Mongo.
- Every repository port has **two implementations**: `mongo…repository.ts` and
  `memory…repository.ts`. Tests use the memory one. Both must implement any new port method.
- Mongo documents use `snake_case` fields; entities use `camelCase`. Mapping lives in the repository
  `toEntity`. New Mongo fields need schema defaults, and `toEntity` must tolerate missing values
  (`doc.config_version ?? 1`).
- Errors: throw `AppError.badRequest / notFound / conflict / forbidden`. Business codes go as a
  message prefix, e.g. `'INTERSTATE_SERVICE_DISABLED: …'`. There is no `VERSION_CONFLICT` fault code;
  use `AppError.conflict(message, { code: 'VERSION_CONFLICT', currentVersion })`.
- Controllers: wrap with `asyncHandler`, validate with `zod`, respond with `sendSuccess(req, res, data, message, status)`.
- Route order in Express matters: register literal paths (`/import`) **before** `/:stateCode`.
- Authorisation: read = `requireAdminRole`; mutate/import = `requireSuperAdmin`.
- Cross-module types: the zone module must not import from `stateBoundary`. Declare a small
  structural interface in the consumer (`GuardedState`) and let the provider satisfy it.
- Imports use the `.js` extension in relative paths (ESM).
- Money is integer paise. IDs come from `newUuid()` (`shared/ids.js`).

### Frontend (`apps/web`)
- Feature folders: `features/<name>/{components,hooks}`; routes in `app/(panel)/<name>/page.tsx`
  wrapped in `<Suspense>`.
- Server state via TanStack Query through `authedQueryOptions` and `useApiMutation`
  (`lib/query/factory`, `lib/query/mutation`). Query keys live in `lib/query/keys.ts`.
  Mutations declare `invalidates`.
- API access only through `lib/api/endpoints/*.ts` using `request()`. `request()` has no custom
  header option, so send the optimistic-concurrency version as `expectedVersion` in the body.
- UI only from `@cabzone/design-system` (Button, Dialog, DataTable, Badge, PageHeader, Skeleton,
  EmptyState, ErrorState, Input). Tailwind tokens (`text-text`, `text-text-subtle`, `text-danger`,
  `border-border`), no hard-coded colours.
- Accessibility: every form control needs a label with text. Checkbox pattern is
  `<input id>` + `<label htmlFor>` (eslint `jsx-a11y/label-has-associated-control` enforces it).
- React keys must be unique and stable. Never key a list on a value that can repeat
  (this caused the original `?` duplicate-key bug). Use `${code}-${index}` when duplicates are possible.
- A flex parent turns every inline child into a column. Wrap running text with inline `<code>` in a
  single `<span>`.

### Testing
- API: Vitest + supertest. Use the memory repositories; stub other use cases with `as never`.
- Update an existing assertion only when the *intended* behaviour changed, and say so.
- Add tests for: happy path, stale version (409), missing version (400), 404, wrong role (403).

---

## 1. Environment gotchas (Windows)

- **Python is not installed.** Do not write Python patch scripts.
- **Multi-line `node -e` / heredoc edits are fragile** in this shell (quotes and backticks break).
  Use the Edit/Write tools. If you must script, write a `.js` file first, then run it.
- **Files use CRLF.** String replacement with `\n` in a script silently matches nothing. Use the
  Edit tool (it normalises) and verify with `grep -c` after any scripted edit.
- Verify every scripted edit actually applied before moving on.
- Commands: `cd apps/api && npx tsc --noEmit && npx vitest run`; `cd apps/web && npx tsc --noEmit && npx eslint <paths>`.
- After code changes run `graphify update .` from the repo root (project rule).

---

## 2. Step-by-step

### Step 1 — Fix the import dialog bugs (web)
File: `apps/web/src/features/zones/components/StateImportDialog.tsx`
1. `result.rejected.map((r, i) => <p key={`${r.stateCode}-${i}`} …>)`.
2. Wrap the info sentence (with the inline `<code>` chips) in one `<span>` inside the flex `<p>`.

### Step 2 — Read code, name and version from the GeoJSON (api)
File: `stateBoundary/application/geojsonFeatures.ts` (rewrite)
1. Full India name→code table (36 states/UTs incl. aliases: Orissa, Pondicherry, NCT of Delhi, …).
2. `normalizeName`: upper-case, `&` → `AND`, strip non-letters, collapse spaces.
3. Lower-case all property keys into a `Map` so lookups are case-insensitive.
4. Code: plain code keys (`stateCode`, `state_code`, `ST_CODE`, `STATE_CODE`; 2-3 letters), else
   prefixed keys (`ISO_3166_2`, `ISO3166_2`, `HASC_1`: last part of `IN-WB` / `IN.WB`), else the
   name table. Otherwise no code.
5. Name keys: `stateName, state_name, ST_NM, NAME_1, STATE, STATE_UT, STNAME, NAME`.
6. New export `datasetVersionFromGeoJson`: collection or first-feature
   `sourceVersion | datasetVersion | dataset_version | version` (numbers stringified, max 60
   chars), else null. The import controller uses
   `body.sourceVersion ?? datasetVersionFromGeoJson(body.geojson)` (a typed value wins).
7. **No allowlist.** Import every state. In `importStateBoundaries.usecase.ts` replace
   `allowedStateCodes` with `activeOnImportStateCodes` (default `LAUNCH_STATE_CODES`): a state new
   to the system is ACTIVE only if listed, otherwise INACTIVE and reported in `disabledOnImport`.
   Replace `skippedNotServiceable` with `disabledOnImport` in the result (also in the web
   `ImportStatesResult`). `missing` stays = launch states absent from the file. Uncodeable features
   are rejected with reason `Could not determine a state code for "<name>".`
8. Update the `src/scripts/importStates.ts` comment and warning, and the web `StateImportDialog`
   copy and result list (wrap flex text in `<span>`; the rejected list needs a scoped
   `eslint-disable-next-line react/no-array-index-key`).
9. Tests: new `test/geojson-features.test.ts` (name normalisation, explicit code wins, ISO/HASC,
   case-insensitive keys, undeterminable code, version detection); the unit test expects
   `imported ['BR','UP','WB']` and `disabledOnImport ['UP']`; the API test expects Kerala imported
   as `KL` and in `disabledOnImport`, and `includeInactive` returns 3 states.

### Step 3 — Extend the state model (api)
- `StateBoundaryEntity` add: `configVersion: number`, `intrastateEnabled: boolean`,
  `interstateDropOffEnabled: boolean`. Document that `version` = boundary version (import only) and
  `configVersion` = admin-edit version (optimistic concurrency).
- Add `StateBoundaryHistoryAction = 'IMPORTED'|'UPDATED'|'ACTIVATED'|'DEACTIVATED'` and
  `StateBoundaryHistoryEntry { id, stateCode, action, version, configVersion, source, sourceVersion, previousGeometry, at }`.
- Port `StateBoundaryRepositoryPort` add: `listAll()`, `getByCode()` (any status),
  `appendHistory()`, `listHistory()`.
- Mongo model: add `config_version` (default 1), `intrastate_enabled` / `interstate_drop_off_enabled`
  (default true); new `StateBoundaryHistoryModel`, collection `state_boundary_history`,
  index `{ state_code: 1, at: -1 }`.
- Implement all of the above in **both** `mongoStateBoundary.repository.ts` and
  `memoryStateBoundary.repository.ts`; `upsertByCode` persists the new fields.

### Step 4 — Import keeps history and configuration (api)
`importStateBoundaries.usecase.ts`
1. Load existing with `getByCode` (any status), not `getActiveByCode`.
2. Preserve `status`, `intrastateEnabled`, `interstateDropOffEnabled`, and name if the file has none.
3. `version = existing ? existing.version + 1 : 1`; `configVersion` likewise increments.
4. After saving, `appendHistory({ action: 'IMPORTED', previousGeometry: existing?.geometry ?? null, … })`.

### Step 5 — State admin use case, controllers, routes (api)
1. New `application/useCases/manageState.usecase.ts` (`ManageStateUseCase`): `get`, `history`,
   `update`, `setStatus`. Every mutation: load → `assertVersion(current.configVersion === expected)`
   else 409 → `upsertByCode({ …, configVersion + 1 })` → `appendHistory`. `setStatus` is a no-op
   returning current when the status is unchanged. Export it from `useCases/index.ts`.
2. Controllers: `makeGetStateController`, `makeUpdateStateController`,
   `makeSetStateStatusController(useCase, status)`, `makeStateHistoryController`. Expected version
   comes from the `If-Match-Version` header, falling back to body `expectedVersion`; neither → 400.
   `PATCH` body must contain at least one of `stateName`, `intrastateEnabled`, `interstateDropOffEnabled`.
   List controller accepts `?includeInactive=true` → `listAll()`.
3. Routes (`/api/v1/admin/reference/states`): `GET /`, `POST /import` (unchanged, own 30mb body
   parser), then `GET /:stateCode`, `GET /:stateCode/history`, `PATCH /:stateCode`,
   `POST /:stateCode/activate`, `POST /:stateCode/deactivate`.
4. Wire in `stateBoundary.container.ts`; expose `manageStateUseCase`.
5. Tests in `state-boundary-api.test.ts` (nested `describe('state management')`): patch with
   `If-Match-Version` then stale → 409; missing version → 400; deactivate/activate and
   `includeInactive`; re-import keeps status, bumps `version`, records previous geometry; 404 for
   unknown code; CITY_ADMIN → 403 on PATCH.

### Step 6 — States screen (web)
1. `lib/api/endpoints/states.ts`: add `configVersion`, `intrastateEnabled`,
   `interstateDropOffEnabled` to `StateBoundaryDto`; add `StateHistoryEntryDto`, `UpdateStateBody`;
   `statesApi.listAll` (`query: { includeInactive: true }`), `update`, `setStatus`, `history`.
   `update`/`setStatus` send `{ …, expectedVersion }` in the body.
2. `lib/query/keys.ts`: `states.admin()`, `states.history(code)`.
3. `features/states/hooks/useStatesAdmin.ts`: `useAllStates`, `useStateHistory`, `useUpdateState`,
   `useSetStateStatus` (mutations invalidate `keys.states.all()`; they pass the row's current
   `configVersion`).
4. Components in `features/states/components/`: `StatesScreen` (PageHeader, DataTable with columns
   state/code/status/intrastate/interstate/boundary version/actions, loading/error/empty states,
   reuse `StateImportDialog`), `StateEditDialog` (name + two checkbox toggles, keyed by
   `code-configVersion` so the form resets; shows the server error on 409), `StateHistoryDialog`.
5. Route `app/(panel)/states/page.tsx` with `Suspense`. Nav: add `States` (`Landmark` icon,
   `activePattern: /^\/states/`) under *Configuration* in `components/nav-items.ts`.
6. `npx tsc --noEmit` and `npx eslint src/features/states` must be clean.

### Step 7 — State-aware classification (contracts + api)
1. `packages/contracts/src/service-classification.ts`: add types `ClassifiedServiceType = 'CITY'|'OUTSTATION'`,
   `RouteScope = 'INTRA_STATE'|'INTERSTATE'`; add optional `serviceType`, `routeScope`,
   `originStateCode`, `destinationStateCode`, `stateBoundaryVersion`, `stateConfigVersion` to
   `ServiceClassificationDto`. Keep the old `type` field.
2. `packages/contracts/src/pricing.ts`: add optional `routeScope`, `destinationStateCode`,
   `stateBoundaryVersion`, `stateConfigVersion` to `QuoteDto`.
3. `ResolvedState` (stateBoundary) gains `configVersion`, `intrastateEnabled`, `interstateDropOffEnabled`.
4. `AssertServiceableUseCase` messages: `'PICKUP_NOT_SERVICEABLE: Pickup location …'` and
   `'DESTINATION_NOT_SERVICEABLE: Drop location …'` (existing test regexes still match).
5. `serviceClassification.usecase.ts`:
   - Define `GuardedState` and type `ServiceabilityGuard.execute` to return `{ pickup, drop }: GuardedState`.
   - Capture `const states = await guard?.execute(...)`.
   - `crossesStates = distinctSegmentStates > 1 || pickup.stateCode !== drop.stateCode`; if true the
     geographic recommendation is `INTERSTATE`.
   - After the final type is chosen: `serviceType = finalType === 'IN_CITY' ? 'CITY' : 'OUTSTATION'`;
     `routeScope = CITY ? null : crossesStates ? 'INTERSTATE' : 'INTRA_STATE'`.
   - `INTRA_STATE` and `!drop.intrastateEnabled` → `INTRASTATE_SERVICE_DISABLED: …`;
     `INTERSTATE` and `!drop.interstateDropOffEnabled` → `INTERSTATE_SERVICE_DISABLED: …`. City trips skip both.
   - Return the new fields (`?? null` when no guard).
6. Snapshot: add the four optional fields to `QuoteTokenPayload`, the token payload construction and
   the returned `QuoteDto` (`createQuote.usecase.ts`); to `ZoneSnapshot` (`ride.entity.ts`) and copy
   them from the quote in `createRide.usecase.ts`. The ride's `zone_snapshot` is `Mixed`, so no
   schema change.
7. Tests in `state-boundary.test.ts` (`describe('route scope and state serviceability')`): stub
   `resolveZonesUseCase` returning `{ city: { id, name, boundary }, destinationCity: null, isWithinBuffer: false }`.
   The city's `boundary` must be a GeoJSON polygon that does **not** contain the drop for outstation
   cases and **does** contain it for the city case. Cover interstate, intrastate, both disabled
   flags, and city-trip-ignores-flags.

### Step 8 — Docs and graph
1. Update `docs/LLD/geo-reference-and-routing.md` §42 (import behaviour, `configVersion`,
   history, endpoint list, what is not implemented).
2. `graphify update .`.

---

## 3. Definition of done
- `cd apps/api && npx tsc --noEmit && npx vitest run` — all green (187 tests at last run).
- `cd apps/web && npx tsc --noEmit` clean; `npx eslint src/features/states` clean.
- Re-importing a state never loses its previous border (history entry with `previousGeometry`).
- A stale `expectedVersion` returns 409; a missing one returns 400.
- A disabled flag blocks only the matching trip type; city trips are unaffected.
- Quotes and rides carry `routeScope`, `destinationStateCode`, `stateBoundaryVersion`, `stateConfigVersion`.

## 4. Known limitations (do not "fix" without being asked)
- Version check is read-then-write, not an atomic conditional update.
- Ride creation does not re-validate state versions.
- Route state segments are not computed from a route line (routing is out of scope).
- City zone version is not in the snapshot.
- States screen has no boundary map or pricing section.
