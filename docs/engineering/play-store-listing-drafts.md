# Cabzone Play Store listing drafts

These are copy drafts for separate Rider and Driver listings. Verify every feature against the final Play-signed build before entering the text in Play Console. Do not claim that live payments or cashout are available until the production drill in the launch register passes.

## Cabzone Rider (`in.cabzone.rider.app`)

**Store title:** Cabzone

**Short description:** Book local and outstation rides with a fare agreed before pickup.

**Full description:**

Cabzone helps you request local and outstation rides. Choose your pickup and destination, review the quoted route and fare, and agree on the final fare before the trip begins.

During a ride, see the trip status and driver details. At the end of the trip, use the payment option shown in the app, review your trip history and receipt, and report a payment issue if needed. You can save routes for future bookings and add an emergency contact.

Service availability and payment options depend on your location and the current app configuration. Tolls and permits may be payable separately at actuals where applicable.

**Suggested screenshot subjects:** pickup/destination, fare agreement, active ride and safety, payment options, trip history and receipt. Capture these from the production release build with test data and no real personal details.

## Cabzone Driver (`in.cabzone.driver`)

**Store title:** Cabzone: Driver

**Short description:** Manage ride offers, trips, earnings, and your driver wallet.

**Full description:**

Cabzone Driver is for approved driver partners. Complete profile and vehicle details, upload required documents, go online, and respond to ride offers in your service area.

The app supports trip progress, pickup verification, communication with the rider, payment confirmation, earnings history, and wallet activity. Location access is used to show nearby ride offers and support active trips, including background access while you are online or on a ride when you grant permission.

Availability, payment options, wallet funding, and cashout depend on your approved account and the current service configuration.

**Suggested screenshot subjects:** onboarding/KYC, online status and offer, active trip, payment confirmation, earnings and wallet, support. Capture these from the production release build with test data and no real personal details.

## Play Console fields still requiring owner input

- Developer account identity and public contact details.
- Store category, distribution countries, target audience, content rating, and ad declaration.
- Approved public Rider and Driver privacy and terms URLs.
- Reviewer accounts, OTP access instructions, and any KYC review path.
- Data safety responses based on actual production SDK and backend behavior.
- Financial-feature and sensitive-permission declarations.
