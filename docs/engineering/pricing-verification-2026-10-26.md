# Pricing verification — 26 October 2026

## Findings and changes

- The admin pricing dialog already saves separate city and outstation base, per-km, and minimum fares for city, state, and global scopes. The admin API create/patch/activate tests pass in the main checkout.
- Quote lookup follows city → pickup state → global. The existing state-pricing tests cover all three levels and global fallback for a state without its own config.
- An intrastate outstation route previously replaced its selected city rate with a state rate. Quotes now use the selected config for intrastate distance and resolve per-state rates only when the route crosses a state boundary. The straight-line Siliguri → Malda test route crossed Bihar; the intrastate regression uses Siliguri → Cooch Behar.
- Interstate quotes contain segment distances, rates, and pricing versions. Ride creation now copies the signed segment pricing versions into its immutable pricing snapshot; the regression checks quote and ride values together.
- A Mongo repair command now reports duplicate ACTIVE price scopes without writing by default. `--apply` retires the extra records, normalizes surviving scope keys, and creates the unique partial ACTIVE index. Its integration test covers dry run, legacy city records with a state code, apply, idempotence, and duplicate rejection by the index.

## Development database audit

The configured development MongoDB returned **0 duplicate active scopes** in the read-only repair dry run. Its `level_1_city_zone_id_1_state_code_1_vehicle_type_1` index is already unique with `{ status: 'ACTIVE' }` as its partial filter. No live pricing records were changed.

For another database, set `MONGO_URI` explicitly and run `pnpm --filter @cabzone/api exec tsx src/scripts/repairActivePricingConfigs.ts` to review the keeper and retirement IDs. Back up `pricing_configs` and pause admin pricing writes before rerunning with `--apply`. The selected keeper is the currently effective config with the highest version, then newest creation time. Review the printed selection before applying it.

## Verification limits

Focused quote/ride, state-pricing, and zone-pricing tests passed (48 tests); both Mongo pricing integration suites passed (3 tests). The admin pricing API suite passed in the main checkout (3 tests). The isolated worktree's admin API suite fails during its WebSocket initialization because its dependencies are linked across drives; the same test passes in the main checkout. The API typecheck passes in the worktree with declaration output disabled for the same linked-dependency reason.

No authenticated admin browser save or live route-provider quote was performed. The save → quote → ride regression uses application use cases and in-memory repositories. A live admin outstation-tier save/quote check remains required before staging sign-off.
