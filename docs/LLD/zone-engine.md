# cabzone — Zone Engine

**Document:** `docs/LLD/zone-engine.md`  
**Status:** Draft for Engineering Review  
**Version:** 0.1

## 1. Purpose

Define geographic classification of a Ride and the geographic inputs used by pricing.

## 2. Geographic Representations

Application/API:

```json
{
  "lat": 26.7271,
  "lng": 88.3953
}
```

GeoJSON:

```json
{
  "type": "Point",
  "coordinates": [88.3953, 26.7271]
}
```

The conversion must occur at the infrastructure boundary.

## 3. Classification Order

The PRD defines a single ordered classification model.

```text
1. Pickup inside a city polygon?
       │
      YES
       ↓
    IN_CITY

       │ NO
       ▼

2. Pickup outside every polygon.
   Is pickup→drop trip distance
   within configured buffer?
       │
      YES
       ↓
    IN_CITY

       │ NO
       ▼

    OUTSTATION
```

Interstate route segmentation is performed separately when the route crosses state boundaries.

## 4. Polygon Classification

Input:

```text
pickup point
city polygons
```

Operation:

```text
point-in-polygon
```

If exactly one active city polygon contains the point:

```text
IN_CITY
```

If multiple polygons overlap, the system must reject the configuration or apply an explicitly defined deterministic priority. Overlapping city zones should be prohibited during Admin validation.

## 5. Fallback Buffer

When pickup is outside all city polygons:

```text
trip_distance <= buffer_distance
```

means the ride can still be classified as `IN_CITY`.

The PRD explicitly says this is based on pickup-to-drop trip distance rather than pickup-to-city-boundary distance.

## 6. Buffer Configuration

Per Decision D-027 ([`decision-log.md`](../decision-log.md#d-027--buffer-zone-distance-city-override-with-global-default)), buffer distance resolution follows:

```text
effective_buffer_distance_m =
  nearest_city_zone.buffer_distance_m ?? global_settings.default_buffer_distance_m
```

Key rules:

- **City Override**: `CityZone.buffer_distance_m` allows tailoring buffer coverage to individual market topologies.
- **Global Default**: Serves as the system-wide baseline (e.g. 20,000 metres / 20 km) when a city has no explicit override configured.
- **Evaluation Basis**: The rule is strictly evaluated on **pickup-to-drop trip distance** (`trip_distance_m <= effective_buffer_distance_m`), not pickup-to-city-center.
- **Surcharge**: When buffer classification evaluates to true, the zone type is set to `IN_CITY` with `buffer_applied = true`, triggering the addition of `buffer_surcharge_paise` to the fare calculation.

## 7. Nearest City

If fallback classification is used, the system needs a deterministic method for selecting the applicable city's pricing configuration.

Recommended:

```text
nearest active city zone by pickup point
```

Tie cases must be rejected or resolved deterministically.

## 8. Boundary Tolerance

GPS uncertainty can cause a pickup point near a polygon boundary to move across the boundary.

The PRD recommends a small tolerance/hysteresis and a special rider-facing classification check for ambiguous locations.

Recommended conceptual flow:

```text
point near boundary
      ↓
ambiguity check
      ↓
classification confidence
      ↓
rider confirmation if required
```

Exact tolerance remains configurable.

## 9. Interstate Detection

The route polyline must be tested against state boundaries.

```text
Route Polyline
      ↓
Intersect state boundaries
      ↓
Create ordered segments
      ↓
Calculate distance per state
```

## 10. State Segment Model

```ts
interface StateSegment {
  state_code: string;
  start_position: number;
  end_position: number;
  distance_m: number;
}
```

The final pricing engine consumes this structure.

## 11. Configuration Freeze

At Ride creation:

```text
current city zones
+
current pricing
+
state pricing
```

are resolved into a Ride snapshot.

Later Admin changes do not modify an existing Ride.

## 12. Admin Zone Validation

When creating/updating a City Zone:

```text
validate GeoJSON
validate polygon closure
validate coordinate order
validate no invalid geometry
validate overlap policy
validate pricing configuration
```

Invalid geometry must not become active.

## 13. Zone Engine Output

```ts
interface ZoneClassification {
  type: 'IN_CITY' | 'OUTSTATION' | 'INTERSTATE';
  city_zone_id: string | null;
  city_name: string | null;
  state_segments: StateSegment[];
  buffer_applied: boolean;
  classification_version: number;
}
```

## 14. Invariants

- GeoJSON coordinates are `[lng, lat]`.
- Active zones must have valid geometry.
- Classification order is deterministic.
- Historical classification is immutable.
- Current Admin configuration cannot alter an existing Ride.
