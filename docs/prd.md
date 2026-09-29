# Cabzonee — Product Requirements Document

**Version:** 0.1  
**Status:** Draft / For Review  
**Owner:** Product Team  
**Source:** Cabzonee PRD v0.1

---

## 1. Product Overview

Cabzonee is a ride-hailing platform with three applications:

| Persona | Platform      | Core Job                                        |
| ------- | ------------- | ----------------------------------------------- |
| Rider   | Mobile App    | Request and pay for rides, for self or others   |
| Driver  | Mobile App    | Apply, get verified, accept rides, get paid     |
| Admin   | Web Dashboard | Verify drivers, manage zones, pricing, disputes |

Cabzonee's differentiators are:

1. Negotiable fares: the rider can counter-offer the suggested fare.
2. Zone-based pricing: in-city rides are separated from outstation/interstate rides because driver economics differ.

## 2. Goals

- Onboard drivers using verified government ID + Driving License through a third-party KYC provider such as Cashfree or Surepass.
- Allow riders to book for themselves or someone else with a negotiable fare.
- Automatically classify rides as In-City, Outstation, or Interstate and price them accordingly.
- Use a driver wallet/commission model and expose ratings and trust scores.
- Give admins control over city zones, pricing, application review, and audit trails.

## 3. MVP Non-Goals

The following are explicitly outside MVP scope:

- Ride pooling
- Scheduled/advance bookings
- Corporate accounts
- Multi-stop rides

## 4. Personas & Roles

### Rider

- Phone-number based account.
- Can book for self or a third party.
- Can view ride history.
- Can rate/review drivers after completed rides.

### Driver

- Applies with identity and driving documents.
- Goes through verification and admin approval.
- Accepts rides.
- Maintains a prepaid wallet used for Cabzonee commission.
- Can view ride history.
- Can rate/review riders after completed rides.

### Admin

The PRD identifies administration responsibilities and explicitly notes that the flat Admin role should be split into roles.

Responsibilities include:

- Driver application review.
- City-zone management.
- Pricing management.
- Dispute handling.
- Auditability of administrative changes.

## 5. Feature Requirements

### 5.1 Driver Onboarding & Verification

1. Driver signs up.
2. Driver submits Government ID and Driving License.
3. Documents are verified through Cashfree or Surepass.
4. Admin performs final Accept/Reject.
5. Rejection requires a reason.
6. Rejected drivers can edit and reapply.

Application states:

`Draft → Submitted → Under Review (auto) → Under Review (admin) → Approved / Rejected → Reapplied`

The PRD also identifies document expiry tracking, reapplication caps/cooldowns, and fixable-vs-hard rejection as required fixes.

### 5.2 Rider Account

- Phone + OTP verification.
- Optional name, email, emergency contact, preferred language.
- Ride booking for self or someone else.

### 5.3 Ride Request & Fare Negotiation

1. Rider enters pickup and drop.
2. Cabzonee calculates Suggested Fare.
3. Rider may accept it or submit a Rider Proposed Fare.
4. The request is broadcast to nearby drivers with the proposed fare.
5. A driver accepts or declines.
6. Acceptance creates the Agreed Fare and confirms the ride.

### 5.4 Ride Execution

After acceptance, the rider sees:

- Car type
- Model
- Number plate
- Driver name/photo
- Driver rating
- Driver trust score
- Live driver location

The driver sees:

- Rider name
- Rider rating
- Pickup
- Destination

Ride progression:

`Accepted → Driver En Route → Arrived → Trip Started → Trip Completed / Cancelled`

Payment methods:

- UPI
- Cash

Both parties can review each other after the ride.

### 5.5 Zones & Pricing

Admins define city boundaries using polygons.

Admin-configurable city pricing includes:

- Base fare
- Rate/km
- Minimum fare
- Included KM
- Buffer surcharge

Zone classification:

1. Pickup inside a city polygon → In-City.
2. Pickup outside all polygons, but pickup-to-drop route distance is within the global buffer → In-City using the nearest city's rates.
3. Otherwise → Outstation.
4. If the route crosses states, split the route by state and apply the corresponding state rate.

Zone/pricing classification is frozen at ride-request time.

### 5.6 Payments & Driver Wallet

- Rider pays through UPI or Cash.
- Driver has a prepaid wallet for Cabzonee commission.
- Driver cannot accept a new ride when wallet balance is `<= 0`.
- Driver has multiple wallet top-up methods.
- A zero wallet must not interrupt an active ride.

### 5.7 Ratings, Trust & History

- Both parties can review after a completed ride.
- Trust score is shown pre-ride alongside rating.
- Rider and driver see their own ride history.
- Admin can view all ride history.

The PRD recommends blind/double-blind reviews and defines a future trust-score model as a weighted function of verified rides, ratings, cancellations, complaints/disputes, with minimum history and decay.

## 6. Fare Engine

The PRD defines:

```text
Raw Fare = Base Fare + (Route Distance × Rate/km)
Fare = MAX(Raw Fare, Minimum Fare)
Suggested Fare = ROUND(Fare)
```

Route distance must come from a routing engine such as Google/Mapbox rather than straight-line distance, and must be locked at ride-request time.

### Fare Concepts

| Term                | Meaning                                 |
| ------------------- | --------------------------------------- |
| Suggested Fare      | Fare calculated by Cabzonee               |
| Rider Proposed Fare | Fare submitted by the rider             |
| Agreed Fare         | Fare accepted by the driver and charged |

### Negotiation Limits

The PRD requires explicit limits but leaves exact values open.

Examples in the PRD:

- Floor: Minimum Fare and potentially 80% of Suggested Fare.
- Ceiling: potentially 150% of Suggested Fare.
- Negotiation window: potentially 90 seconds.

These examples are not final decisions in the PRD.

### Mid-Trip Extension

- Rider requests extension in-app.
- Added fare is shown to both parties.
- Driver confirms before continuing.
- If the extension crosses a zone/state boundary, classification is rerun for the extended segment.
- Extra distance uses the applicable city/state Rate/km and is added to Agreed Fare.

## 7. Core Data Entities

The PRD identifies:

- DriverApplication
- Driver
- Rider
- Ride
- CityZone
- StatePricing
- WalletTransaction
- Review
- Dispute

The PRD does not prescribe a complete physical database schema.

## 8. Loopholes & Required Fixes

The PRD identifies and proposes fixes for:

1. Document expiry/re-verification.
2. Unlimited reapplication.
3. Recycled phone numbers.
4. Accountability for rides booked for others.
5. Fare negotiation floor/ceiling.
6. Driver decline behavior.
7. Conflicting in-city definitions.
8. GPS/boundary edge cases.
9. Mid-ride pricing changes.
10. Interstate pricing transparency and toll/permit handling.
11. Cash-payment confirmation/disputes.
12. Wallet reaching zero during an active ride.
13. Retaliatory/review-bombing risk.
14. Undefined/gameable trust score.
15. GPS spoofing.
16. Overly broad admin role.
17. Cancellation/no-show policy.
18. Sensitive document handling and retention.

## 9. Additional Suggestions

The PRD lists these as suggestions rather than core MVP requirements:

- SOS/safety button.
- Masked calling/in-app chat.
- Ride-state push notifications.
- Admin dispute-resolution center.
- Promo/referral system.
- Scheduled rides as a future feature.
- Multi-language support.
- Admin analytics.
- Driver incentives/bonuses.
- Insurance.

## 10. Open Questions

The PRD leaves these unresolved:

1. How should re-uploaded documents be verified?
2. What is the actual buffer-zone distance, and is it global or city-configurable?
3. Does vehicle type affect fare?
4. What is the admin application-review SLA?
5. Is wallet commission flat per ride or percentage of Agreed Fare?

The PRD specifically recommends an Engineering review of mid-trip extension before development because it touches fare confirmation, zone reclassification, and dispute handling.

---

## Source-Fidelity Note

This document intentionally preserves the PRD's requirements, examples, unresolved questions, and proposed fixes. It does **not** invent a technology stack, database engine, API framework, cloud provider, or exact numerical policy where the PRD leaves those open.
