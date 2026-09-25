# Cabzon — Fare Engine

**Document:** `docs/LLD/fare-engine.md`  
**Status:** Draft for Engineering Review  
**Version:** 0.1

## 1. Purpose

Define deterministic fare calculation, fare snapshots, negotiation bounds, interstate pricing, and mid-trip fare extensions.

## 2. Fare Concepts

```text
Suggested Fare
    ↓
Rider Proposed Fare
    ↓
Driver Acceptance
    ↓
Agreed Fare
```

The PRD explicitly separates these three concepts.

## 3. Base Formula

The PRD defines:

```text
Raw Fare =
Base Fare + (Route Distance × Rate/km)

Fare =
MAX(Raw Fare, Minimum Fare)

Suggested Fare =
ROUND(Fare)
```

Engineering implementation must use integer paise and metres.

Conceptually:

```ts
const distanceKm = distanceM / 1000;

const rawFarePaise = baseFarePaise + Math.round(distanceKm * ratePerKmPaise);

const farePaise = Math.max(rawFarePaise, minimumFarePaise);

const suggestedFarePaise = roundFare(farePaise);
```

The exact rounding rule must be deterministic and centralized.

## 4. Inputs

```text
route_distance_m
base_fare_paise
rate_per_km_paise
minimum_fare_paise
included_km_m
buffer_surcharge_paise
vehicle_type ('CAB' | 'E_RICKSHAW')
zone_classification
pricing_config_version
```

Vehicle category pricing is **DECIDED** ([`decision-log.md`](../decision-log.md#d-025--vehicle-category-pricing--initial-fleet-types), D-025). The Fare Engine resolves pricing inputs independently for each vehicle category within the active city zone:

- `CAB`: Standard 4-wheeler cab/car (active at launch).
- `E_RICKSHAW`: Electric rickshaw (supported in schema and calculations, marked `[coming soon]`).

Each category defines its own base fare, rate per km, minimum fare, included distance, buffer surcharge, and negotiation floor/ceiling bounds.

## 5. Included Kilometres

If `included_km_m` is configured:

```text
billable_distance_m =
MAX(0, route_distance_m - included_km_m)
```

Then:

```text
distance_fare =
billable_distance_m × rate_per_km
```

If the final product decision removes included kilometres, the field remains configuration-compatible but the calculation must be disabled.

## 6. Buffer Surcharge

If applicable:

```text
fare =
base
+
distance component
+
buffer surcharge
```

The surcharge must be explicit in the pricing snapshot.

## 7. Minimum Fare

```text
fare =
MAX(raw_fare, minimum_fare)
```

Minimum fare is configuration-driven.

## 8. Negotiation Floor

Per Decision D-028 ([`decision-log.md`](../decision-log.md#d-028--fare-negotiation-bounds-floor--ceiling)):

```text
negotiation_floor_paise = MAX(
  minimum_fare_paise,
  ROUND(suggested_fare_paise × (negotiation_floor_percent / 100))
)
```

- Default `negotiation_floor_percent`: **80%**.
- A rider proposal cannot be below the calculated floor.

## 9. Negotiation Ceiling

Per Decision D-028 ([`decision-log.md`](../decision-log.md#d-028--fare-negotiation-bounds-floor--ceiling)):

```text
negotiation_ceiling_paise =
  ROUND(suggested_fare_paise × (negotiation_ceiling_percent / 100))
```

- Default `negotiation_ceiling_percent`: **150%**.
- Prevents uncontrolled rider price escalation and enforces fair upper limits.

## 10. Negotiation Window

Per Decision D-028:

```text
negotiation_window_seconds = 90
```

Offers broadcast to drivers time out after 90 seconds. After expiration:

```text
OFFERING → EXPIRED
```

or the rider creates a new offer according to the final product flow.

## 11. Fare Snapshot

At ride creation, store:

```text
config_id
config_version
vehicle_type
base_fare
rate_per_km
minimum_fare
included_distance
buffer_surcharge
negotiation_floor
negotiation_ceiling
commission
```

Never re-read mutable pricing for an existing Ride.

## 12. Interstate Fare

The route may be divided into state segments.

```text
Route
 ├── State A: 83 km
 ├── State B: 42 km
 └── State C: 17 km
```

Each segment uses the applicable state rate.

```text
segment_fare =
segment_distance × state_rate
```

Then:

```text
total_state_distance_fare =
SUM(segment_fares)
```

The PRD requires this state-segment pricing model.

## 13. Tolls and Permits

Tolls/permits should be represented separately from distance fare.

```text
Total Fare
├── Distance/Base Fare
├── Toll Charges
└── Permit Charges
```

The PRD recommends this transparent breakdown.

## 14. Mid-Trip Extension

Given:

```text
original_agreed_fare
original_destination
new_destination
```

calculate:

```text
additional_route_distance
additional_zone_classification
additional_fare
```

Then require Driver confirmation.

The original Agreed Fare is not silently overwritten.

Instead, store:

```text
original_agreed_fare
extension_amount
new_total_agreed_fare
```

## 15. Fare Calculation Result

```ts
interface FareResult {
  raw_fare_paise: number;
  minimum_fare_paise: number;
  distance_fare_paise: number;
  buffer_surcharge_paise: number;
  toll_paise: number;
  permit_paise: number;
  suggested_fare_paise: number;
  negotiation_floor_paise: number;
  negotiation_ceiling_paise: number;
  config_id: string;
  config_version: number;
}
```

## 16. Invariants

- Money is integer paise.
- Route distance comes from the locked routing snapshot.
- Suggested Fare is deterministic for the same inputs.
- Proposed Fare cannot violate negotiation limits.
- Agreed Fare cannot change arbitrarily.
- Historical fare calculations remain reconstructable.
