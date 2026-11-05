# Google Play listing: Cabzone Rider and Cabzone Driver

Everything for checklist items 2 to 8, for both apps.

| # | Item | Rider | Driver |
|---|---|---|---|
| 2 | App icon 512×512 | `rider/icon-512.png` | `driver/icon-512.png` (same logo with a DRIVER tag) |
| 3 | Banner 1024×500 | `rider/feature-banner-1024x500.png` | `driver/feature-banner-1024x500.png` |
| 4 | Screenshots 9:16 (1080×1920) | `rider/screenshots/` (5) | `driver/screenshots/` (4) |
| 5 | Short description (80 chars) | `rider/short-description.txt` (78) | `driver/short-description.txt` (74) |
| 6 | Long description (4000 chars) | `rider/long-description.txt` (2185) | `driver/long-description.txt` (2446) |
| 7 | Privacy policy | `privacy-policy.md` and `privacy-policy.html` (one page covers both apps) | same |
| 8 | Demo login details | `rider/demo-login.md` | `driver/demo-login.md` |
| 9 | Play Console account | Yours to do: one-time US$25 fee plus identity verification. | |

## Blockers: fix before you submit

1. **No account deletion exists.** Play requires an in-app way to request deletion and a web link for it, for any app with sign-up. Neither app nor the API has it. The privacy policy already promises one (`[bracketed]` in section 9). This needs building.
2. **Demo login cannot work in production as the code stands.** The API refuses a fixed OTP in production, and Google cannot read an SMS. See the three options in `rider/demo-login.md`. There is also no reviewable demo driver yet.
3. **Privacy policy is a draft.** Fill every `[bracketed]` item (company name, address, grievance officer, retention periods, providers, delete-account URL), have it reviewed, and host it at a public HTTPS URL. Play needs that URL in the listing and in the app.
4. **Driver background location.** Play requires a declaration form, a short video, and a prominent in-app disclosure before the permission prompt. I did not check whether the driver app shows such a disclosure screen. Verify that first.
5. **Production API address.** The apps read `EXPO_PUBLIC_API_URL`, which is `http://…` on your dev machine, and there are "cleartext" build logs in the repo root. Confirm the release builds use HTTPS only.

## Notes on the assets

- **Screenshots** come from the Realme phone running the dev build in Expo Go, in light mode, then placed in a 9:16 frame with a caption. The phone's own capture was 9:20 and slightly dimmed, so I corrected the brightness and cropped the status and navigation bars.
- Driver screenshots show the developer's name ("Prodip Sen") on Home. I left out Profile (it shows a phone number) and Wallet (it shows a "Test mode" banner). Retake them once you have a demo driver.
- The rider Profile screenshot shows the test account "Demo Rider +919999900001".
- Both apps share one logo, so I added a small DRIVER tag to the driver icon to tell them apart in search.
- Banner text uses "Siliguri", "8% fee only" and "Direct payment". Change them if the facts change.
- Nothing here is a Google-approved final. Check Play Console's own preview for text clipping.

## Side effects on your machine

- Created a test rider **`+919999900001`** in the local dev database (via the fixed OTP `000000`).
- In Expo Go, turned **off** the floating "Tools button" for the dev menu. Re-enable it in the dev menu if you want it back.
- Switched the phone to light mode for the captures and **restored dark mode** afterwards.

## Quick answers for the Data safety form (verify before submitting)

| Question | Rider | Driver |
|---|---|---|
| Collects precise location | Yes, while in use | Yes, including background |
| Collects name / phone / email | Name, phone, email (optional) | Name, phone, address, date of birth |
| Photos and files | No | Yes: profile photo, licence and vehicle documents |
| Audio | In-app calls, not recorded [confirm] | Same |
| Financial info | No card data. UPI paid to driver directly | Wallet top-ups through Razorpay |
| Shared with third parties | Maps, SMS, push, calls | Plus document storage and payments |
| Encrypted in transit | Yes, once production uses HTTPS | Same |
| Users can request deletion | **Not yet built** | **Not yet built** |

Suggested category: **Maps & Navigation** or **Travel & Local**. Content rating: answer the questionnaire honestly; the apps have no user-generated public content, only trip chat between two matched users.
