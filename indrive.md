# inDrive Product & UX Architecture Reference

> **Context & Architecture Reference Document**  
> Synthesized from production iOS app flows curated on [Mobbin](https://mobbin.com).  
> Designed as an architectural and UX reference for peer-to-peer fare negotiation, ride dispatch, and multi-service transportation systems.

---

## 1. Executive Overview & Core Value Proposition

inDrive's defining market differentiator is its **peer-to-peer (P2P) fare negotiation model** ("Set your fair price" / *"Poder elegir es lo justo"*). Unlike algorithmic dynamic surge pricing models (e.g., Uber, Lyft), inDrive replaces automated matching with a two-sided negotiation market:
1. **Rider proposes a fare** (guided by an algorithmic recommended baseline).
2. **Nearby drivers review the broadcast request** along with route, distance, and rider rating.
3. **Drivers either accept or submit counter-offers** (higher bids).
4. **Rider selects the preferred driver** based on a trade-off matrix of price, ETA, vehicle model, and driver rating.

In addition to standard city rides, inDrive operates **City to City (Intercity)**, **Courier Delivery**, and **Freight** within a unified multi-modal interface featuring instant **Passenger ↔ Driver mode switching**.

---

## 2. Complete User Journey & Screen Flows (Curated from Mobbin)

### 2.1 Authentication & Onboarding
*Curated Mobbin Flows:*
- [inDrive Onboarding Flow](https://mobbin.com/flows/0b6df9b9-f903-440a-a5a4-cba152789a53)
- [inDrive Logging in Flow](https://mobbin.com/flows/28987315-220a-4635-b90d-139929f7aa3b)
- [inDrive Logging out Flow](https://mobbin.com/flows/84847029-ead9-42a2-927f-7434ce555597)

```
[Splash & Value Prop]
         │
         ▼
[Auth Choice: Phone vs Passkey]
         │
         ▼
[Enter Phone Number (+ Country Code)]
         │
         ▼
[Channel Selection: WhatsApp vs SMS]
         │
         ▼
[4-Digit OTP Code Verification]
         │
         ▼
[Location Confirmation: "Are you in <City>?"]
         │
         ▼
[Home Map / Main Dashboard]
```

**Key UI/UX Components:**
- **Value Proposition Carousel:** Minimalist dual-tone line illustration with brand neon green highlight accentuating fair deals and bilateral choice.
- **Passkey Support:** Modern WebAuthn/Passkey authentication alongside traditional phone number verification.
- **Verification Delivery Fallback:** Explicit sheet modal allowing users to receive their 4-digit OTP via **WhatsApp** or **SMS**.
- **City Geolocation Sanity Check:** *"Are you in [City]?"* confirmation modal with green pin graphic to prevent cross-border or out-of-service location initialization bugs.

---

### 2.2 Home Screen & Discovery
*Curated Mobbin Screens:*
- [Home Screen - Default View](https://mobbin.com/flows/49f7b1d8-7aa2-499a-8055-9a0b92d38ed8)

**Screen Structure:**
- **Map Viewport:** Real-time animated vehicle icons representing active nearby drivers, with the user's current GPS location anchored by a prominent blue concentric pin.
- **Top Bar:** 
  - Hamburger menu button (access to Driver mode, Request history, Safety, Settings).
  - Floating pill showing current pickup address (e.g., `"Cuautla 61"` with entrance indicator).
  - Compass re-center button.
- **Persistent Bottom Sheet:**
  - Search trigger input: `"Where to & for how much?"`
  - Quick destination chip (e.g., recent location `"Aluxes"`).
  - Service navigation grid:
    1. **City rides:** *"Set your fair price"* (hero card with vehicle illustration).
    2. **Couriers:** Parcel delivery via moto/car.
    3. **Freight:** Heavy cargo, truck & movers.
    4. **City to City:** Scheduled intercity rides.

---

### 2.3 Ride Request & The Fare Bidding Engine
*Curated Mobbin Flows:*
- [inDrive Booking a ride Flow](https://mobbin.com/flows/49f7b1d8-7aa2-499a-8055-9a0b92d38ed8)
- [inDrive Driver's offer Flow](https://mobbin.com/flows/04f21488-d6a0-4f9a-9970-90ed102f9bc6)

```
[Destination & Pickup Entry]
         │
         ├── Entrance / Building Number Keypad
         └── Multi-stop Add Stop (+)
         │
         ▼
[Service Class Selection (Ride / Comfort / Moto)]
         │
         ▼
[Fare Offer Configuration]
         │
         ├── Recommended Fare (Algorithmic anchor)
         ├── Stepper (- / +) & Direct Input
         ├── Auto-Accept Toggle
         └── Options Modal (Child seat, Luggage, Pets, Comments)
         │
         ▼
[Broadcast: "Find a driver"]
         │
         ▼
[Real-Time Negotiation Lobby]
         │
         ├── Driver Viewer Counter ("X drivers viewing")
         ├── Dynamic Priority Indicator / Timer
         └── Dynamic Fare Increment ("Raise to MX$85")
         │
         ▼
[Incoming Driver Bids / Counter-Offers]
         │
         ├── Decline Offer
         └── Accept Offer (with countdown timer bar)
```

#### Step Details & Screen Breakdown:

1. **Pickup & Destination Config:**
   - **Entrance Specificity:** Custom numeric keypad modal (`"Set entrance"`) attached to the pickup address tag (e.g. `"Cuautla 61 Entrance 1"`), eliminating curb confusion.
   - **Multi-Destination:** Inline `+` icon on destination row supporting intermediate stops.

2. **Vehicle Category Tiering:**
   - **Ride:** Baseline affordable cars (4 passengers, ~5 min ETA).
   - **Comfort:** Newer/premium vehicle guarantee (4 passengers, higher baseline fare).
   - **Moto:** Single passenger, traffic-dense expedited trips.

3. **Fare Propose Mechanics:**
   - Shows **Recommended fare** (e.g., `MX$65`) based on historical distance, duration, and local traffic conditions.
   - Circular stepper buttons (`-` and `+`) allowing users to adjust bids in standardized increments (e.g. $5 increments).
   - Direct numerical tap to edit the exact amount.
   - **Auto-Accept Nearest Driver Toggle:** 
     `"Automatically accept the nearest driver for MX$65"` / `"Auto-accept an offer of MX$65 up to 5 min away"`. When toggled, the app bypasses the manual driver review card if a driver accepts the passenger's exact price within a 5-minute radius.

4. **Ride Customization Options (Bottom Sheet):**
   - Toggle: `More than 4 passengers`
   - Toggle: `Child safety seat`
   - Toggle: `Pet with me`
   - Free-form Comments: Rider notes for drivers (e.g. `"No AC"`, luggage notes, gate codes).

5. **Broadcast & Real-Time Negotiation State:**
   - **Priority Status Bar:** Shows feedback on fare competitiveness (e.g., `"Good fare. Your request gets priority"` alongside an animated countdown timer `00:58`).
   - **Social Proof / Market Liquidity Cue:** Displays driver avatars and count: `"11 drivers viewed your request"`.
   - **Fare Adjustment While Broadcasting:** In-flight stepper buttons (`- 5`, `+ 5`) and `"Raise fare"` CTA allow the rider to sweeten the offer without cancelling and restarting the request.
   - **Dynamic Price Bump Nudge:** If no driver accepts within threshold seconds, the sheet presents an automated prompt:  
     `"Try raising your fare to get offers"`  
     - Primary Button: `Raise to MX$85`  
     - Secondary Button: `Keep MX$67`

6. **Driver Offer Presentation (The Card Stack):**
   - Multiple driver offers appear as stacked floating cards over the radar/map:
     - Driver photo, verified badge, and status level (e.g. *"Platinum status"*).
     - Driver rating (e.g. `4.91 ⭐`) and volume (`698 rides` / `56 orders`).
     - Vehicle description: Model, color, year (e.g., `"Nissan Versa"`, `"Chevrolet Aveo, 2025"`).
     - Proximity metrics: Both ETA and distance (e.g., `"3 min · 0.8km"`).
     - **Driver Offer Price:** Driver counter-offers can match or exceed the rider's bid (e.g. rider requested $65, Driver A bids $78, Driver B bids $85).
     - **Acceptance Timer:** Green `"Accept"` button with an animating depletion progress bar (giving riders ~15–20s before the bid expires).
     - White `"Decline"` button to dismiss that specific offer immediately.

---

### 2.4 Active Ride & Tracking
*Curated Mobbin Flows:*
- [inDrive Ride information Flow](https://mobbin.com/flows/e9502d57-f806-49f1-938e-706e31d658ec)

**States:**
1. **Driver En Route:**
   - Header: `"Driver is arriving in ~X min"`.
   - Vehicle illustration + License plate card (e.g., `"White Nissan VDrive · Plate B***"`).
   - Driver profile snippet (photo, rating `4.91`, status).
   - Action triggers:
     - **Contact driver:** Dual VoIP call and in-app chat button.
     - **Safety:** Emergency SOS button, live trip sharing link, support hotline.
     - **Pickup notes:** Quick note input field for driver instructions.
2. **Driver Waiting at Curb:**
   - Header switches to: `"Driver is waiting for you"`.
   - Free waiting time counter starts.
3. **In-Ride Messaging & In-App Call:**
   - **VoIP In-App Calls:** Masked numbers — *"Call other users in the app. No one will see your phone number"*.
   - **In-App Chat:** Real-time messaging with auto-translation banner (*"Messages are automatically translated into the recipient's language"*).
   - **Quick Reply Chips:** Pre-built quick action pills:
     - `Hello`
     - `OK`
     - `I'm here`
     - `Where are you?`
     - `Waiting for you`

---

### 2.5 Trip Completion & History
*Curated Mobbin Screens:*
- [inDrive Rating & Receipt Screens](https://mobbin.com/flows/e9502d57-f806-49f1-938e-706e31d658ec)

**Flow:**
1. **Rating Modal:** Five-star rating sheet (`"Rate your driver"`).
2. **Trip History Detail (`"My rides"`):**
   - Mini map displaying actual traversed route.
   - Pickup & Dropoff addresses with timestamps (e.g., `3:55 p.m.` to `3:59 p.m.`).
   - Duration (`4 min`) and distance (`0.9 km`).
   - Vehicle & Driver summary.
   - Quick Actions Grid:
     - **Receipt:** View/Download formatted official tax/ride receipt.
     - **Support:** Report issues, lost items, fare disputes.
     - **Repeat ride:** Instantly re-populate same route.
     - **Return route:** Swap pickup and dropoff points.
   - Financial Ledger: `Fare: MX$78.00`, `Total paid: MX$78.00`, Payment method tag (`Cash` / `SPEI`).
   - History management: `"Remove from history"` with security disclaimer (*"The order will disappear from your history, but we'll still have it for security reasons and Support requests"*).

---

### 2.6 Intercity ("City to City") Booking Flow
*Curated Mobbin Flows:*
- [inDrive Booking a ride (City to City)](https://mobbin.com/flows/d32f8f7f-fdd7-4bba-9bb3-74492d160fa7)

**Key Differences from Urban Rides:**
- **Origin & Destination:** Inter-state or inter-city addressing (e.g., *Mexico City CDMX → Puebla, Mexico*).
- **Date & Departure Scheduling:** Calendar date picker and departure time selector (e.g., `Thu, 25 Sep 09:00`).
- **Fare Scope & Tolls:** Notes on highway tolls (`"Más casetas"`), private vehicle hire (`"$1,110 for private ride"`) vs per-seat pooling.
- **Driver Profile Depth:** Driver vehicle details include vehicle year (`Chevrolet Aveo, 2025`), age of driver, completed long-distance order count, and dedicated customer reviews tab with user comments (`"Buen conductor y muy amable"`).

---

### 2.7 Courier & Freight Service Flows
*Curated Mobbin Flows:*
- [inDrive Best offer information Flow](https://mobbin.com/flows/6b3d6ff9-f38c-408a-ade2-be37a3caf283)

**Key Features:**
- **Courier Delivery:**
  - Vehicle types: Motorcycle (`~MX$79`) vs Car (`~MX$114`).
  - Item details & contact recipient field.
- **Freight Service:**
  - Vehicle size selector: *Pickup*, *Small Truck*, *Medium Truck*.
  - Pickup timeframe: `10-20 min`, `Up to 1 hour`, `Schedule delivery`.
  - Service add-ons (Pills): `Pay with SPEI`, `Movers` (loaders/helpers), `Packaging Supplies`, `Furniture/Fragiles`, `Full Loading`, `Ride as a passenger`.
- **Best Offer Algorithmic Highlight:**
  - Banner: *"Best offer right now — Based on distance, price, body and rating"*.
  - Explanatory modal: *"How we choose the best offer: Quick arrival (closest driver), Price (at your price or competitive), Vehicle type (matching capacity)"*.

---

### 2.8 Driver Mode & Driver Onboarding Flow
*Curated Mobbin Flows:*
- [inDrive Driver mode Flow](https://mobbin.com/flows/28727437-a190-47a7-ae5b-e63b2b038420)
- [inDrive Set up a driver account Flow](https://mobbin.com/flows/ec0ba384-047b-4592-9b60-8c2958e6dd81)

**Key Architecture: Single App Binary Dual-Mode Switch**
- In the side drawer, a single prominent green CTA: **`Driver mode`** toggles the app from rider view to driver view without requiring a separate app installation.
- **Driver Setup Pipeline:**
  1. Service selection: *City driver*, *Courier*, *City to City driver*, *Freight driver*.
  2. Operating city selection.
  3. Vehicle acquisition: Own vehicle vs *"Rent a car"* (in-app fleet partner integration).
  4. Personal identification: Profile photo, legal names (First, Father's last, Mother's last name).
  5. Document verification: Driver's license, vehicle registration, background check.

---

## 3. Core Domain Models & State Machines

### 3.1 Ride Negotiation State Machine

```
               [Rider submits request with offered_fare]
                                  │
                                  ▼
                   ┌──────────────────────────────┐
                   │    BROADCASTING_REQUEST      │◄──────────┐
                   │   (drivers viewing request)  │           │
                   └──────────────┬───────────────┘           │ Rider raises fare
                                  │                           │ (in-flight bump)
                     Driver bids  │                           │
                   ┌──────────────┴───────────────┐           │
                   ▼                              ▼           │
     ┌────────────────────────┐      ┌────────────────────────┴───┐
     │   DRIVER_ACCEPTED      │      │    DRIVER_COUNTER_OFFER    │
     │  (at rider's exact     │      │   (higher bid submitted)   │
     │   offered_fare)        │      └────────────┬───────────────┘
     └─────────────┬──────────┘                   │
                   │                              │ Rider selects offer
                   │                              ▼
                   │                  ┌───────────────────────┐
                   │                  │   RIDER_ACCEPTED      │
                   │                  └───────────┬───────────┘
                   │                              │
                   └──────────────┬───────────────┘
                                  ▼
                     ┌────────────────────────┐
                     │    DRIVER_DISPATCHED   │
                     │    (en route to curb)  │
                     └────────────┬───────────┘
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │     DRIVER_ARRIVED     │
                     │  (waiting for rider)   │
                     └────────────┬───────────┘
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │       IN_TRANSIT       │
                     └────────────┬───────────┘
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │       COMPLETED        │
                     │ (rating & receipt)     │
                     └────────────────────────┘
```

### 3.2 Key Data Entities

```typescript
// Proposed Domain Contract for inDrive-style negotiation
interface RideRequest {
  id: string;
  riderId: string;
  serviceCategory: 'city' | 'intercity' | 'courier' | 'freight';
  serviceClass: 'standard' | 'comfort' | 'moto';
  pickup: {
    lat: number;
    lng: number;
    address: string;
    entranceNumber?: string;
  };
  destination: {
    lat: number;
    lng: number;
    address: string;
  };
  intermediateStops?: Array<{ lat: number; lng: number; address: string }>;
  recommendedFare: number;
  offeredFare: number;
  autoAccept: {
    enabled: boolean;
    maxFare: number;
    maxEtaMinutes: number;
  };
  options: {
    moreThan4Passengers: boolean;
    childSeat: boolean;
    petFriendly: boolean;
    comments?: string;
  };
  paymentMethod: 'cash' | 'card' | 'digital_transfer';
  status: 'broadcasting' | 'accepted' | 'en_route' | 'arrived' | 'in_transit' | 'completed' | 'cancelled';
  expiresAt: string;
}

interface DriverBid {
  id: string;
  rideRequestId: string;
  driverId: string;
  driverName: string;
  driverRating: number;
  totalRides: number;
  driverTier?: 'standard' | 'platinum';
  vehicle: {
    make: string;
    model: string;
    color: string;
    plateNumber: string;
    year?: number;
  };
  distanceToPickupKm: number;
  etaMinutes: number;
  proposedFare: number; // May match offeredFare or be higher
  expiresAt: string;    // Bids expire within 15-20s if unaccepted
}
```

---

## 4. Key Architectural Patterns & Takeaways for cabzone

1. **Two-Way Negotiation as Friction Reducer, Not Barrier:**
   - The algorithmic "Recommended fare" provides a psychological anchor for both riders and drivers, preventing extreme market stalls.
   - Stepper increments (`+5 / -5`) reduce cognitive load when bargaining in real time.
2. **Auto-Accept Bridge:**
   - The *"Auto-accept nearest driver"* toggle seamlessly bridges the gap between on-demand algorithmic dispatch and pure P2P bidding for hurried passengers.
3. **Pickup Precision:**
   - Adding dedicated building/entrance numbers directly to pickup tags significantly cuts curb-side driver search time.
4. **Driver Mode in Same Application:**
   - Maintaining passenger and driver roles in the same app lowers acquisition friction for prospective drivers and maximizes ecosystem liquidity.
5. **Masked VoIP Communication & Translated Chat:**
   - In-app VoIP calling protects privacy, while pre-built contextual quick-response pills simplify communication for common curbside scenarios.
