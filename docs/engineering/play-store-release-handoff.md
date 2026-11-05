# Cabzone Android release handoff (4 November 2026)

## Verified in this workspace

- Separate Android package IDs: `com.cabzone.rider` and `com.cabzone.driver`.
- Both `eas.json` production profiles produce Android App Bundles.
- The public deletion-request page is deployed at <https://cabzone-admin.vercel.app/account-deletion> and links to `cabzonehelp@gmail.com`.
- Both mobile account tabs link to that page in local source; these changes still need new mobile builds.
- `https://cabzone-admin.vercel.app/api/health` returned 200 after deployment.
- Expo's production environment for each app has its Google Services JSON. Neither production environment has `EXPO_PUBLIC_API_URL`.
- Expo Build lists no Android production builds for either project.
- The repository-wide `pnpm check` gate passed on 4 November 2026 (20/20 tasks; API: 632 tests).
- Current mobile icon source is 1254 × 1254 pixels and about 1.24 MB for both apps; create separate Play listing icons at Google's required 512 × 512 size and under 1 MB. Feature graphics and final screenshots are still missing.
- Local mobile `.env` files point at `http://200.234.38.54`; local API `.env` is development configuration. Do not use these files as evidence of production payment readiness.
- The direct backend `http://200.234.38.54:4090/api/health` returned 200. HTTPS to port 4090 failed. The Vercel domain returned 404 for `/ws`, which both apps require for realtime events.

## Required before building or submitting either app

1. Put the backend behind a certificate-valid HTTPS origin that also supports `wss://<origin>/ws`. Test `/api/health` and an authenticated WebSocket upgrade. Keep the Vercel admin URL for the dashboard and public deletion page.
2. Set `EXPO_PUBLIC_API_URL` to that verified origin in **both Expo production environments**. Build production AABs only after this value is visible to each project. Increase each Android version code for every upload.
3. Complete the signed legal, tax, privacy, finance, and operations items in [step18-legal-finance-launch-register.md](./step18-legal-finance-launch-register.md). The account-deletion page is only the request channel; the organization must implement and operate the actual data deletion and retention process.
4. Publish approved Rider and Driver privacy policies and terms at stable public URLs; link them from the apps and Play listings. Correct the current in-app legal summaries, which describe only direct cash/personal-UPI settlement.
5. Verify production OTP, maps, Firebase push, KYC storage, live payments, live wallet recharge/cashout, webhooks, refunds, and reconciliation with real transactions before claiming a commercial launch.
6. Obtain access to the verified Google Play developer account. Create separate Rider and Driver listings, upload store assets, complete Data safety, account deletion, app access, financial features, and sensitive permission declarations. Supply stable reviewer accounts and OTP instructions.
7. Test the final Play-signed builds on physical Android devices, especially Driver background location, foreground services, calls, realtime ride offers, cash/UPI, wallet flows, and Rider PDF receipts. Resolve Play Console pre-launch findings before staged rollout.

Store listing copy is drafted in [play-store-listing-drafts.md](./play-store-listing-drafts.md). Factual legal-policy text and unresolved decisions are in [legal-review-draft.md](./legal-review-draft.md). Server-owner instructions for the API origin are in [https-wss-api-setup.md](./https-wss-api-setup.md).

## External evidence to collect

| Evidence | Owner/source |
| --- | --- |
| HTTPS/WSS API hostname and deployment access | Backend hosting owner |
| Approved policy text, legal entity details, retention schedule, regulatory/tax sign-offs | Legal, privacy and finance leads |
| Live merchant activation, payout funding, webhook configuration and reconciled transaction IDs | Razorpay and finance owner |
| Play Console identity, Play App Signing, listings and tester eligibility | Play Console owner |
| Working support inbox and deletion-request processing roster | Cabzone operations |

Do not mark public release ready on the strength of an AAB build or a reachable admin dashboard alone.
