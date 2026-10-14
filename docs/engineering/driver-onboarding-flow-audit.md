# Driver onboarding: six-step flow audit and implementation plan

**Audited:** 2026-10-14  
**Scope:** `apps/driver-mobile` onboarding steps 1–6, review/submission, their API handoffs, and the current backend submission contract. This document records findings and code instructions; it changes no app behavior.  
**Evidence level:** `Confirmed` means directly visible in current code or the user's Android review screenshot. `Device check` means the implementation presents a risk that needs a physical Android/iOS run before calling it a reproduced defect. The earlier Android licence picker permission error was reported and then reported fixed; this audit treats it as a regression case, not a current failure.

## Flow and persistence map

| View | User action | Current persistence | Main gap |
| --- | --- | --- | --- |
| 1. Personal information | Name, DOB, gender, optional photo | `POST /driver/profile` on Continue | Gender and vehicle-style defaults can be accepted as real data without deliberate choice; photo is duplicated in step 6. |
| 2. Operating city | Choose a card or type a city | Only wizard memory; saved as profile `address` at final submit | Defaults to Siliguri; arbitrary custom text is accepted; unfinished custom entry can silently submit old city. |
| 3. Vehicle | Type, registration, make/model/color | Only wizard memory; vehicle registered at final submit | Manufactures a 2022 year; registration input is shorter than the shared regex allows. |
| 4. Driving licence | Number, expiry, PDF/JPEG | Profile, draft application and file API on Continue | Date entry differs from other dates; network failure can leave a partly saved step. |
| 5. ID and vehicle documents | Four files, three expiries | Sequential file APIs on Continue | Government ID incorrectly asks for expiry; validation happens during sequential uploads. |
| 6. Profile photo | Capture and save image | Profile API on Continue | Gallery image from step 1 already satisfies a screen described as a “live selfie”; no liveness check exists. |
| Review → submit | Review, edit, submit | Profile → draft application → vehicle → submit | Checklist comes from local booleans and can disagree with backend; sample values and raw error can be shown. |

The backend's `SubmitDriverApplicationUseCase` requires current files for every type in `DOCUMENT_TYPES` (Government ID, DL, RC, insurance, permit) and a registered vehicle. It returns `DOCUMENTS_REQUIRED: ...` if a current document is missing. The user screenshot shows this raw message on review despite green checkmarks. Treat server state as authoritative throughout the flow.

## Priority 0 — prevent misleading or invalid submission

### F01 — Review presents fabricated values and an unverified checklist (`Confirmed`)

**Evidence:** `step-review.tsx:76,94` falls back to `15/05/1995` and `WB74AB1234`; `kyc-wizard.tsx:79` also substitutes that registration in the API payload. `step-review.tsx:108–136` uses draft booleans and always checks the selfie. The screenshot shows the resulting contradiction: all documents checked, backend says the DL is required.

**Why it matters:** A driver may certify another DOB/registration, and a green tick incorrectly implies the file reached the server. A UI checkbox is not evidence of current storage or expiry.

**Code instructions:**

1. Remove the two sample-value fallbacks from `step-review.tsx` and the registration fallback from `kyc-wizard.tsx`. Missing required fields must display **Missing** and disable submission, with an edit action.
2. Derive document rows from `useAuth().documents`, comparing type, non-`mock/` storage key, and expiry using the same required-document rule as `submitDriverApplication.usecase.ts`. Use `driver`/`vehicle` from `GET /driver/profile/me` for persisted fields. Keep local draft values visibly marked “Not yet saved” only where the flow intentionally defers saving.
3. Refetch profile on entering review, show a loading state, then render `Ready`, `Missing`, `Expired`, or `Upload pending` per item. Do not show a green check for a picked but unsaved file, or for the selfie without a persisted `profilePhotoUrl`.
4. Add `onEditStep(5)` for ID/RC/insurance/permit and direct the DL edit to step 4. Map a submit-time missing-type response back to the matching step, refetch, and preserve the entered draft.

**Acceptance:** A missing/expired DL shows an actionable red row before Submit; review cannot show example identity or vehicle data; a stale client still receives and displays the server error without losing progress. Add a mobile pure-state test for document status plus the existing API missing-document integration scenario.

### F02 — Vehicle year is always submitted as 2022 (`Confirmed`)

**Evidence:** `types.ts:49`, `step-vehicle-info.tsx:71`; wizard hydration does not read `vehicle.manufactureYear`. Backend `kyc.validation.ts:101–109` allows a nullable/optional year.

**Why it matters:** It creates false vehicle records for every other model year, including a returning driver with a saved year.

**Code instructions:** Make `manufactureYear` optional/null in `OnboardingDraft`, hydrate it from `vehicle`, and add a labelled year input/selector on step 3 only if the product needs the value. Validate integer 2000 through current year + 1 with the shared API limit. Otherwise omit the property from `registerVehicle` entirely. Never silently assign 2022. Display the entered year on review if collected.

**Acceptance:** A 2019 vehicle submits 2019; an unknown year is omitted; reload preserves a saved year; invalid years cannot pass the form.

### F03 — Flow state is lost on remount and partially hydrated (`Confirmed`)

**Evidence:** `kyc-wizard.tsx:18–45` initializes once from auth data and `:45` always starts at step 1. City and vehicle are only sent to the backend on review submission. Step 3 does not hydrate year. Photo/file selections exist only in component memory.

**Why it matters:** Background process death or app restart can force a driver to repeat steps 2–3 and lose unsaved inputs. A profile refresh does not automatically reconcile the one-time draft state.

**Code instructions:** Persist a **minimal, non-sensitive** wizard draft and last completed step using the existing storage service, keyed by authenticated user ID; clear on logout and successful submission. Rehydrate after the authoritative profile load and merge persisted server fields ahead of local values. Do not persist base64 document/photo data or temporary picker URIs; after restart require re-selection and say so. Alternatively, save city and vehicle to backend earlier and derive the resume step from backend state; prefer this if it fits existing API semantics. Guard against resuming at review until the fresh backend preflight passes.

**Acceptance:** After restarting on step 5, name/city/vehicle values remain, actual uploaded documents remain visible, unsent files explicitly need re-selection, and another account never sees the first account's draft. Add a resume/logout test.

### F04 — Step 5 permits submission before expiry validation and uploads partly (`Confirmed`)

**Evidence:** `step-vehicle-documents.tsx:133–137` enables Continue for any selected file. `:139–190` validates each expiry inside a loop after earlier files may already have uploaded; Government ID is first.

**Why it matters:** A missing insurance expiry can be reported only after ID and RC uploads; users cannot tell which files were saved and may retry unpredictably.

**Code instructions:** Validate all selected files and their relevant expiry dates into a local payload list before the first request. Disable Continue until each required item is either already current on the server or has a valid selected replacement. Show field-level date errors immediately, focusing/scrolling to the first invalid card. Then upload one-by-one with explicit `Queued / Uploading / Saved / Failed` states and preserve successfully saved rows for retry. Refetch profile after any partial failure. Keep server-side validation as the trust boundary.

**Acceptance:** Invalid/missing expiry triggers zero upload requests; a failure on file 3 shows files 1–2 as saved and retry sends only outstanding files. Test leap dates, today/expired dates, and simulated network failure on the third request.

## Priority 1 — fix the six-step form and UX contract

### F05 — Step 1 can save an unchosen gender (`Confirmed`)

**Evidence:** `types.ts:44` defaults `MALE`; wizard and `step-personal-info.tsx:81` both fall back to Male. The form only requires first name and adult DOB.

**Fix:** Use an unset gender in a new application; require an explicit selection before Continue. Preserve an existing saved gender on edits. Keep last name optional only if that is intended by backend policy, and label it “Optional”. Show DOB errors beside DOB, not only below the CTA. Do not generate a fake DOB in review.

**Acceptance:** A new driver cannot pass without gender selection; a returning driver sees the saved value; invalid dates and under-18 dates receive distinct messages.

### F06 — DOB picker and manual date rules differ (`Confirmed`)

**Evidence:** Step 1 validates manual DOB through `services/profile.ts`; the picker year range ends at 1950 while manual typing can accept older dates. The DOB input is nested in a pressable date-picker wrapper (`step-personal-info.tsx:390–425`).

**Fix:** Define one allowed DOB range and one date parser in `services/profile.ts`, use it for both picker and typed entry, and reject future/invalid calendar dates. Keep text entry and date-picker controls separate so tapping the text cursor edits text and tapping the calendar opens the picker. Add accessible labels and a visible `DD/MM/YYYY` hint.

**Acceptance:** Both input methods accept/reject the same boundaries; TalkBack can focus text and calendar separately; typing is not interrupted by the picker.

### F07 — City selection can silently keep the default or old choice (`Confirmed`)

**Evidence:** `types.ts:45` and `step-operating-city.tsx:99` preselect Siliguri. `:122–135` applies custom city separately; Continue still uses `selectedCity` if a custom entry is open but unapplied. The city is ultimately stored as free-text profile `address`, not an operational zone ID.

**Fix:** For new users start without a selected city; require a deliberate card selection or successful custom-city apply. While the custom editor has unapplied text, disable Continue or make Continue apply/validate that text. Display the exact selected city in review and let its Edit link return to step 2. Before exposing arbitrary custom cities, compare against the backend's active city/zone list or label it “Request a new area” and prevent promising active dispatch until approved. Do not claim that a typed city automatically creates serviceability.

**Acceptance:** Typing a new city cannot submit an older selection by accident; unavailable cities are not presented as active service regions; city survives resume.

### F08 — Registration field is narrower than the shared contract (`Confirmed`)

**Evidence:** `step-vehicle-info.tsx:50–53,166` strips to/maxes at 10 characters. `packages/contracts/src/vehicles.ts:33` allows 2 letters + 1–2 digits + 0–3 letters + 4 digits, up to **11** characters.

**Fix:** Derive maximum length from the accepted registration formats or set it to 11 in step 3. Normalize spaces/hyphens while preserving all valid characters. Show a specific format error only after blur or attempted Continue, not while the driver is mid-entry. Check whether the backend's `vehicleRegistrationSchema` has further restrictions before copying the same rule into the UI.

**Acceptance:** A valid 11-character plate can be fully entered and sent; invalid length/characters cannot pass. Add a shared-contract test case.

### F09 — Vehicle form silently submits presets and loses edits (`Confirmed`)

**Evidence:** `types.ts:43–50` defaults Cab, Maruti, Dzire, White. `step-vehicle-info.tsx:114–144` changes type and immediately overwrites model/make. Editing a preset model clears make at `:202–214`.

**Fix:** For a new driver require intentional vehicle type, make/model and color confirmation, or clearly label presets as examples with an explicit choice. Preserve each type's entered values when toggling Cab/E-Rickshaw, or confirm before discarding edits. A manual model edit should not blank a valid manufacturer unless the user explicitly clears it; allow selecting a preset to populate make. Place validation messages next to registration/make/model/color.

**Acceptance:** Changing type and back restores the previous manual values, or warns before loss; a driver cannot accidentally certify the sample vehicle.

### F10 — Vehicle errors surface only after all uploads (`Confirmed`)

**Evidence:** `kyc-wizard.tsx:59–86` registers the vehicle on final Submit, after steps 4 and 5 uploaded files. The step 3 Continue only changes local state.

**Fix:** Register/validate the vehicle at step 3 when the backend permits draft registration, or expose a non-mutating validation route if registration must wait. On duplicate/invalid plate, keep the user at step 3 with a field-level error. If the existing endpoint is idempotent for the same driver, reuse it; inspect its update behavior before moving the call. On final Submit, avoid repeating a successful registration unless values changed.

**Acceptance:** Duplicate/invalid registration is reported at step 3; document uploads are not prerequisites to seeing that error; returning driver edits do not create duplicate vehicles.

### F11 — Licence date and document statuses are inconsistent (`Confirmed`)

**Evidence:** Step 4 uses raw `YYYY-MM-DD` expiry while DOB and step 5 use `DD/MM/YYYY`. `step-driving-licence.tsx:133–151` shows a green check for a picked but unsaved file, although the caption says it will upload on Continue.

**Fix:** Show `DD/MM/YYYY` across human-facing forms and convert to ISO only in the API request, using one strict calendar-date helper; alternatively use a platform date picker consistently. Split selected/saved/expired states visually and in accessibility text. Show the saved DL expiry alongside the saved-file state. Retain the 500 KB PDF/JPG/JPEG validation in `services/driver-license.ts` and backend signature/size validation.

**Acceptance:** A selected file reads “Ready to upload”, a persisted file reads “Saved for review”, and an expired file reads “Expired”; invalid dates never enable Continue. Regression-test Android Files/Downloads/Drive PDF and JPEG picks, including the previously observed read-permission case.

### F12 — Government ID card requests an expiry its endpoint does not take (`Confirmed`)

**Evidence:** `step-vehicle-documents.tsx:313` renders expiry for every selected file. `:153–159` calls `uploadIdentityDocumentFile` without expiry; `kyc.validation.ts:132–134` accepts only `fileDataUrl`.

**Fix:** Render the expiry input only for RC, insurance and permit. Render the selected-file name and Remove action for Government ID too; currently the filename banner is excluded at `:297`. Keep ID copy to the accepted formats and explain that it is saved for admin review, not instantly verified.

**Acceptance:** Selecting Government ID shows name, size/status and Remove, with no expiry field; the other three files require validated expiry.

### F13 — Document instructions mention a chassis number never collected (`Confirmed`)

**Evidence:** `step-vehicle-documents.tsx:351`; step 3 collects type/registration/make/model/color, not chassis number.

**Fix:** Remove that sentence or replace it with “Ensure the registration number on your RC matches the number you entered in Step 3.” Add chassis number only if the backend, admin review and product spec all require it; do not introduce an unpersisted field.

**Acceptance:** Guidance matches fields actually captured.

### F14 — “Live selfie” and verified-looking badge overstate the check (`Confirmed`)

**Evidence:** Step 1 can pick from camera or gallery; step 6 accepts any saved `profilePhotoUri`. `step-profile-photo.tsx:76,100–110` calls it a live selfie and renders a green check, while `services/profile-photo.ts` only picks an image and the backend stores it. The spec says face verification is separate work.

**Fix:** Choose one honest product rule. Recommended now: call it **Profile photo**, allow the already saved step-1 photo, label the state “Photo saved” instead of “verified/live”, and keep an option to retake/replace. If a live capture is mandatory, remove step-1 gallery as an accepted substitute and add backend-supported verification before claiming liveness. Do not imply rider visibility before the admin policy permits it.

**Acceptance:** Copy and state reflect exactly what was saved; a gallery photo is not described as live-verified.

### F15 — Review errors are raw and edit routes are incomplete (`Confirmed`)

**Evidence:** `step-review.tsx:29–38` displays `err.message`; screenshot shows `DOCUMENTS_REQUIRED`. The single Documents Edit action at `:102–107` returns only to step 4. `step-review.tsx` does not mark the error banner as an accessibility alert.

**Fix:** Add a small mapping in the review screen from known API error codes/missing document names to plain instructions: e.g. “Your driving licence is missing or expired. Upload it in Step 4.” Give separate DL and vehicle-document edit actions. Preserve the server request ID in logs without showing stack/raw codes to drivers. Make the error an announced alert and scroll it into view after failed submit.

**Acceptance:** The screenshot scenario gives the driver a direct repair path; unknown errors retain a generic retry message and diagnostic request ID if available.

## Priority 2 — layout, scrolling, accessibility and resilience

### F16 — Keyboard and bottom safe-area behavior needs device calibration (`Device check`)

**Evidence:** Steps 1–5 use `KeyboardAvoidingView` only for iOS (`behavior` is undefined on Android), with a full-screen `ScrollView`; none scrolls the focused lower input into view. Steps 6/review switch to React Native `SafeAreaView` and fixed `paddingBottom: 40` (`step-profile-photo.tsx:67–69`, `step-review.tsx:43–45,174–178`). The supplied Android review screenshot places the bottom CTA very close to the system navigation region. This is a layout risk, not a verified obstruction on every device.

**Fix:** Use `react-native-safe-area-context` insets consistently for all six steps and review; give scroll content at least `insets.bottom + CTA spacing`. On Android test `adjustResize`/Expo keyboard configuration already in the project before adding packages. On focus, scroll the active field and its error above the keyboard; ensure taps on the CTA dismiss the keyboard or work with it open. For the long step-5 form, prefer a content ScrollView with a safe-area footer CTA only after proving it does not cover expiry inputs. Keep back and CTA reachable with large text and landscape height.

**Acceptance/device matrix:** On the user's Android phone plus one small 320–360 dp Android device and one iPhone, test keyboard open on last input of steps 1, 2, 3, 4, 5; scroll to bottom; rotate if supported; 200% font scaling; gesture and 3-button navigation. No field, error or CTA is hidden or untappable. Capture screenshots for each failure and rerun after fix.

### F17 — Form accessibility is uneven (`Confirmed`)

**Evidence:** Step 1/2 city and gender selections have radio roles; step 3 vehicle and color chips do not. Step 5 document picker rows have a button role but no descriptive `accessibilityLabel`, expiry inputs have no explicit label, and the remove icon is unlabeled. Steps 6/review icon/text `Pressable`s lack role/label; review error lacks `accessibilityRole="alert"`.

**Fix:** Give every actionable `Pressable` a role, purpose and selected/disabled/busy state where applicable. Label text fields with their visible name and required status. Give document controls labels such as “Upload registration certificate, missing”, “Replace insurance, saved”, “Remove selected Government ID”. Treat decorative icons/progress bars as hidden from screen readers and announce “Step 4 of 6” once. Verify effective tap target at least 44×44 pt (use hitSlop where visual size is smaller), contrast and text growth without clipped labels. Follow existing accessible controls from steps 1–2 rather than introducing a new component system.

**Acceptance:** TalkBack and VoiceOver can complete all six steps and review in logical order without guessing icon meaning; error is announced; chip selection is announced.

### F18 — Loading and offline feedback are too coarse (`Confirmed`)

**Evidence:** Step 5 has one CTA spinner while up to four serial Cloudinary uploads run. Steps 4 and 6 use alert dialogs for network errors; review uses one generic banner. The flow has no visible retry/progress state per upload.

**Fix:** Keep buttons disabled only during the request they initiate, show which document is uploading and what persisted, and offer Retry for the failed item without reselecting already saved documents. Distinguish offline/timeout, authentication expiry and validation failures using existing API error shape. Preserve input state after failure and refresh authoritative state before marking success. Avoid logging base64, IDs or document contents.

**Acceptance:** With throttled/offline network, users see what was saved, can retry safely after reconnect, and never see “saved” until the API confirms it.

### F19 — Submission completion and rejection recovery should be explicit (`Device check + code risk`)

**Evidence:** `kyc-wizard.tsx:88–91` awaits `refreshProfile()` before showing the submitted screen; `index.tsx:37–49` decides pending vs wizard by backend status. The submitted screen's Go Home merely refreshes profile. Rejection states appear to return to the wizard rather than a dedicated explanation.

**Fix:** After a successful submit response, show confirmation even if a subsequent profile refresh fails; retry reconciliation in background. On resume, route submitted/under-review applications to pending without replaying Submit. For rejected applications, show backend rejection reason and permitted reapply action, aligning with `docs/LLD/open-questions.md` policy before implementing changes. Confirm current backend state transitions first.

**Acceptance:** A lost refresh response after successful submit never encourages a duplicate submission; rejected driver sees the reason and allowed next action.

### F20 — Staged E-Rickshaw category is presented as active (`Confirmed`)

**Evidence:** `packages/contracts/src/vehicles.ts:6–27` and decision D-025 mark `E_RICKSHAW` as `COMING_SOON`. Step 3 (`step-vehicle-info.tsx:143–155`) makes it selectable without a staged notice; the earlier `components/auth/vehicle-type-step.tsx:55–63` calls it “Supported in Siliguri” and says the driver will be eligible for requests.

**Why it matters:** A driver can spend time completing KYC for a category that the product decision says is not activated. This also makes any permit rules and category-specific document guidance ambiguous.

**Code instructions:** Use the shared `VEHICLE_CATEGORY_REGISTRY` to render status in both selectors. Disable or clearly segregate coming-soon onboarding until activation, and change the promise about ride eligibility. If product has since activated E-Rickshaw, update D-025, registry, backend eligibility, and both screens together before enabling it. Keep category-specific permit guidance aligned with the backend's required-document policy.

**Acceptance:** A new driver cannot unknowingly submit an unsupported category; activation is reflected consistently in contract, onboarding and dispatch.

## Recommended implementation order and file touch list

1. **Truthful review and gating (F01, F15):** `step-review.tsx`, `kyc-wizard.tsx`, `auth-context.tsx` if a fresh-profile hook is required, a small pure status helper under `components/kyc/` only if reused, and focused mobile/API tests. Remove sample fallbacks first. Preserve the backend's final validation.
2. **Repair exact form bugs (F02, F04, F08, F12, F13):** `types.ts`, `step-vehicle-info.tsx`, `step-vehicle-documents.tsx`, `step-review.tsx`, and contract-aligned tests. Front-load date validation before network requests.
3. **Correct user choices and semantics (F05–F07, F09–F11, F14, F20):** personal/city/vehicle/licence/photo screens plus the earlier auth vehicle selector, shared category registry, and existing `services/profile.ts` date helper. Change defaults carefully so existing saved profiles stay populated while new accounts require a choice.
4. **Resume and error recovery (F03, F10, F18, F19):** wizard, storage, API usage, and backend only if draft vehicle registration or preflight needs an endpoint. Never store raw KYC file data in persistent storage.
5. **Native interaction pass (F16, F17):** all six screens and review. Calibrate against actual Android/iOS captures, including the user's reported device. Avoid visual redesign unrelated to the blockers.

Before each code slice, inspect callers and current tests. Keep the existing route shapes and backend document checks. Add tests where behavior changes, not tests that only mirror JSX. Run `pnpm --filter @cabzone/driver-mobile lint`, `pnpm --filter @cabzone/driver-mobile typecheck` (or the package's actual scripts), focused mobile tests, and the relevant onboarding API tests; then perform the physical-device matrix. The current mobile test inventory includes `apps/driver-mobile/test/profile.test.mjs`, so the six-step interaction coverage is presently thin.

## Full acceptance run (one new driver and one returning draft)

1. Enter a real name, DOB and explicit gender; correct an invalid date; test camera/library photo choice and refusal of permission.
2. Choose a listed city, reopen custom city without applying, then submit a valid custom or supported city according to the final serviceability policy.
3. Enter a valid 11-character registration, manually edit model/make/color, switch vehicle type and back, and enter or omit the true year according to the chosen contract.
4. Pick real PDF, JPG and JPEG licence files at 499 KB, 500 KB and 501 KB, plus a corrupt file; verify clear rejection and Android storage-provider access. Enter expired, impossible and future DL dates.
5. Pick Government ID, RC, insurance and permit; Government ID has no expiry field. Try blank/expired/impossible expiries for other files and verify **zero** network uploads. Fail upload 3 deliberately; resume/retry without re-uploading successes.
6. Save or replace profile photo; verify the label says saved, not verified. Deny camera permission and recover.
7. Enter review with a stale/missing/expired DL and verify no green check or Submit; use direct Edit. Complete all files, submit once, force a profile-refresh failure, restart and confirm the pending state.
8. Repeat with keyboard open, small screen, 200% font scaling, TalkBack/VoiceOver, slow/offline network, expired session, app process death, and both Android gesture/3-button navigation. Record screenshots and API response IDs for failures without exposing KYC contents.

**Explicit limits of this audit:** Code paths, contract and supplied screenshot were inspected; a live authenticated end-to-end device session was not run for every screen. The scroll/safe-area and TalkBack/VoiceOver items must be confirmed on devices before marking them fixed. External KYC/liveness provider selection remains deferred by product decision; this plan requires honest UI wording meanwhile.
