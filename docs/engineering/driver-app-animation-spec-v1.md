# Cabzon Driver App — UI Animation & Micro-Interaction Specification v1

**Theme:** Sky Blue + Light Grey  
**Platform:** Android Driver App  
**Scope:** UI motion, onboarding transitions, micro-interactions and operational feedback  
**GenAI:** Excluded

## 1. Design Direction

Cabzon should feel **fast, calm, professional, reliable and modern**. Use the visual structure of the supplied reference: large visual area, bold headline, short subheadline, progress indicator, rounded CTA, soft decorative shapes and generous whitespace. Do not copy the reference branding or brown palette.

### Colors

```text
Cabzon Blue  #1597E5
Light Blue   #DDF2FF
Soft Blue    #EEF8FF
Background   #F5F7F8
White        #FFFFFF
Dark Navy    #102A43
Text         #111827
Secondary    #667085
Success      #16A34A
Warning      #F59E0B
Error        #DC2626
```

## 2. Motion Principles

Every animation must communicate one of:

- what happened
- what is loading
- where attention should go
- what action is available
- whether an action succeeded or failed

Animation must never delay a real operation or misrepresent backend state.

Use mostly **200–500 ms** micro-interactions. Respect reduced-motion preferences. Prefer `transform` and `opacity` for smooth performance.

## 3. Global Motion Tokens

```ts
export const motion = {
  duration: {
    fast: 180,
    normal: 300,
    emphasis: 450,
  },
  easing: {
    standard: 'ease-out',
    enter: 'cubic-bezier(0.22, 1, 0.36, 1)',
    exit: 'ease-in',
    smooth: 'ease-in-out',
  },
};
```

Do not hardcode unrelated durations across screens.

## 4. App Launch

```text
CABZON
Driver
```

Sequence:

```text
0ms      logo hidden
100ms    logo fades in
250ms    logo moves upward 8–12px
400ms    subtle blue decorative shape appears
500ms    transition to onboarding
```

Keep the launch animation short; never make the user wait for branding.

## 5. Onboarding Screens

### Screen 1

**Drive. Earn. Grow.**  
Flexible hours, fair earnings and more control with Cabzon.

### Screen 2

**Choose your vehicle**  
Drive a Cab or E-Rickshaw with Cabzon.

### Screen 3

**You're almost ready**  
Complete your profile and documents to start driving.

### Composition

```text
┌─────────────────────────┐
│ 9:41                    │
│ ━━━━━━━ ━━━━━━━ ━━━━━━━ │
│                         │
│        VISUAL           │
│     🚕       🛺         │
│                         │
│ Drive, Earn & Grow      │
│                         │
│ Flexible hours, fair    │
│ earnings and control.   │
│                         │
│ ┌─────────────────────┐ │
│ │      Continue →     │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

### Entrance animation

```text
Background shapes: opacity 0→1, 400ms
Vehicle: opacity 0→1, scale .94→1, translateY 16→0, 450ms
Decorations: opacity 0→1, translateY 8→0, 300ms
Headline: opacity 0→1, translateY 12→0, 300ms
Subheadline: opacity 0→1, translateY 8→0, 300ms
CTA: opacity 0→1, translateY 8→0, 300ms
```

Stagger elements lightly; do not make the user wait for each element sequentially.

## 6. Onboarding Page Transition

Forward:

```text
old: translateX 0 → -25%, opacity 1 → 0
new: translateX 25% → 0, opacity 0 → 1
300–350ms
```

Back:

```text
old: translateX 0 → 25%
previous: translateX -25% → 0
300–350ms
```

Avoid 3D rotations.

## 7. Progress Indicator

Use three thin rounded segments.

```text
━━━━━━━━ ━━━━━━━━ ━━━━━━━━
```

Active segment uses Cabzon Blue. Animate active width from 0→100% over ~250ms when the user actually advances.

## 8. Buttons

Primary CTA:

```text
┌───────────────────────────┐
│       Continue →          │
└───────────────────────────┘
```

Press:

```text
scale 1 → .97, 100ms
scale .97 → 1, 150ms
```

Processing:

```text
Continue →  ◌
```

Disable the button during the request to prevent duplicate commands.

## 9. Vehicle Selection

On selection:

```text
scale 1 → .98 → 1
180ms
```

Selected card:

```text
border → Cabzon Blue
background → #EEF8FF
icon scale → 1.04
```

Then transition to the next screen.

## 10. Login

```text
Welcome back
Log in to your Cabzon Driver account.

+91 [ 98765 43210 ]

[ Continue → ]
```

Input focus:

```text
border grey → blue
background → subtle blue tint
200ms
```

No password flow if authentication is OTP-based.

## 11. OTP

Digit entry:

```text
scale .85 → 1
opacity 0 → 1
150ms
```

Success:

```text
OTP → blue confirmation → checkmark → next screen
300–400ms
```

Do not hold the user on a success animation unnecessarily.

## 12. Forms / KYC

Focus:

```text
outline + label + subtle background transition
200ms
```

Validate after the user finishes the field or moves forward rather than immediately punishing an empty field.

Error:

```text
border → red
translateX: 0 → -4 → 4 → -2 → 2 → 0
200–300ms
```

Photo upload:

```text
image opacity 0→1
scale .9→1
300ms
```

KYC completion should use a subtle checkmark, not confetti.

## 13. KYC Submission

```text
Checking your details...
◌
```

Never fake a percentage. When complete:

```text
✓
Application submitted
```

Then move to the KYC-pending state.

## 14. KYC Approved

```text
✓
You're approved!
You're ready to start receiving ride requests.
```

Use a restrained success animation:

```text
checkmark scale .5→1
circle scale .8→1
small blue particles fade in/out
400–500ms
```

## 15. Driver Home — OFFLINE

Central status card:

```text
OFFLINE
Not receiving ride requests

[ GO ONLINE ]
```

Use neutral grey. Do not continuously pulse the offline state.

## 16. Going ONLINE

```text
OFFLINE
  ↓
Checking
  ↓
ONLINE
```

Checks can appear quickly:

```text
✓ Account
✓ Vehicle
✓ Location
✓ Wallet
```

Use 100–150ms staggered feedback only when those checks correspond to actual backend results. Do not invent fake loading steps.

## 17. Driver Home — ONLINE

```text
● ONLINE
Receiving ride requests

[ GO OFFLINE ]
```

Use a subtle status pulse:

```text
opacity .6 → 1 → .6
2–3s cycle
```

No flashing.

## 18. Ride Offer

Ride offers are high priority.

Use a bottom sheet/card:

```text
translateY 100% → 0
opacity 0 → 1
300ms
```

Show:

- rider offer/agreed fare
- pickup
- pickup distance
- destination
- route distance
- estimated duration
- service type

The offer animation must not change or fake the backend's actual expiry. If a countdown exists, it must use real server-backed expiry.

## 19. Accept Ride

```text
Accept
 ↓
processing
 ↓
success / conflict
```

Success:

```text
✓ Ride accepted
```

Conflict:

```text
Ride already taken
```

Keep conflict feedback short and calm.

## 20. Active Ride

Transition:

```text
offer card → map + pickup panel
300–400ms
```

Use a map-centric layout because the driver is now working rather than browsing.

## 21. ARRIVED

After `ARRIVED` command succeeds:

```text
✓ You're at the pickup

Enter rider OTP
```

Reveal the OTP section with:

```text
height 0 → content height
opacity 0 → 1
300ms
```

Do not display the OTP flow before backend arrival is confirmed if arrival validation is required.

## 22. OTP → IN TRANSIT

Successful OTP:

```text
✓ Ride started
```

Then quickly transition to destination/navigation view. The success state should not block the driver.

## 23. Ride Completion

After backend-confirmed completion:

```text
Ride completed ✓

₹320

Commission
− ₹25.60

Your earnings
₹294.40
```

Numbers may animate from the previous value to the confirmed value over 300–500ms.

Never animate financial values before the backend confirms the transaction.

## 24. Wallet / Earnings

Balance changes can use a short number transition. A new transaction row may use:

```text
opacity 0→1
translateY -8→0
250–300ms
```

The displayed balance remains backend-authoritative.

## 25. Pull to Refresh

For earnings, wallet and ride history:

```text
Idle
 ↓
Pulling
 ↓
Threshold
 ↓
Refreshing
 ↓
Complete
```

Use a small Cabzon-branded rotating icon. After successful refresh:

```text
spinner → checkmark
```

Do not use refresh animation to mask slow backend responses.

## 26. Toasts

Success/info toast:

```text
translateY -12→0
opacity 0→1
300ms
```

Exit:

```text
opacity 1→0
200ms
```

Normal transient messages may auto-hide after ~2.5s. Critical errors should remain visible until understood/dismissed.

## 27. WebSocket / Connection Loss

```text
● Connection lost
Reconnecting...
```

Use a subtle animated dot.

On recovery:

```text
✓ Connected
```

Then reconcile authoritative backend state. If there is an active ride, explicitly reassure the driver that the ride remains active.

## 28. Location Disabled

```text
Location is required

Cabzon needs your location to receive nearby rides.

[ Enable location ]
```

Use a subtle location icon pulse, not continuous aggressive motion.

## 29. Empty States

Example:

```text
        🚕

No rides yet

Your completed rides will appear here.
```

Illustration:

```text
opacity 0→1
translateY 8→0
```

Empty states should explain what will appear and provide the relevant next action where applicable.

## 30. Navigation

Bottom navigation:

```text
Home   Rides   Earnings   Me
```

Selected icon:

```text
scale .9 → 1
200ms
```

Selected label can fade in over ~200ms.

## 31. Hamburger Menu

If a hamburger is used:

```text
middle line → opacity 0
top/bottom → rotate ±45°
300–400ms
```

Menu:

```text
translateX -100% → 0
300ms
```

Items can use ~50–60ms staggered entrance. Keep the menu secondary; core driver operations should remain accessible from the main navigation.

## 32. Reduced Motion

Support Android accessibility/reduced-motion preferences.

When enabled, replace:

```text
slide
scale
parallax
pulse
```

with:

```text
short fade
or
instant state change
```

## 33. Performance

Prefer:

```text
transform
opacity
SVG
small Lottie animations where justified
```

Avoid:

- large animated image sequences
- continuous expensive blur
- unnecessary particles
- excessive scroll-triggered effects
- animation that increases real loading time

## 34. Reusable Animation Components

```text
<CabzonPageTransition />
<CabzonButton />
<CabzonLoading />
<CabzonSuccess />
<CabzonError />
<CabzonProgress />
<CabzonToast />
<CabzonStatusIndicator />
<CabzonRideOffer />
<CabzonBottomSheet />
<CabzonAnimatedNumber />
<CabzonRefreshIndicator />
```

Create the motion system once and reuse it across screens.

## 35. Recommended Project Structure

```text
src/
  design-system/
    colors
    typography
    spacing
    motion

  components/
    buttons/
    inputs/
    cards/
    feedback/
    navigation/

  animations/
    pageTransitions
    onboarding
    success
    errors
    loading
    rideOffer
```

## 36. Driver-First Rule

The driver may be walking, stopped, driving or interacting with a rider. Therefore the app must be glanceable.

Animation should communicate:

```text
Something arrived.
Something changed.
Something succeeded.
Something failed.
Something is loading.
```

It should never require the driver to watch an animation to understand a critical state.

## 37. Final Motion Identity

Cabzon motion should feel:

```text
FAST
 +
CALM
 +
PRECISE
 +
TRUSTWORTHY
```

The recurring motion language should be:

```text
Fade
 ↓
Slide
 ↓
Subtle Scale
 ↓
Checkmark / status feedback
 ↓
Stable final state
```
