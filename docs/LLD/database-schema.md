# Cabzonee — Database Schema

**Document:** `docs/LLD/database-schema.md`  
**Status:** Draft for Engineering Review  
**Version:** 0.1

## 1. Purpose

Define the persistent data model required to implement the Cabzonee domain model. This document translates the domain entities and invariants into MongoDB-oriented collections, field types, indexes, uniqueness rules, TTL policies, and concurrency requirements.

## 2. Storage Conventions

- Database: MongoDB.
- Primary identifiers: UUIDv7 where temporal ordering is useful; UUIDv4/CUID2 otherwise.
- Money: integer paise. Never floating point.
- Distance: integer metres.
- Coordinates in application/API objects: `{ lat, lng }`.
- GeoJSON/MongoDB coordinates: `[lng, lat]`.
- Timestamps: UTC.
- Historical transaction data must be snapshot-based.
- Mutable configuration must be versioned.
- State-changing operations must support idempotency where retries are possible.

## 3. Collection Inventory

```text
users
riders
drivers
driver_applications
driver_documents
vehicles
city_zones
pricing_configs
rides
ride_events
fare_negotiations
ride_extensions
driver_locations
payments
payment_events
wallets
wallet_transactions
reviews
trust_scores
disputes
notifications
admin_users
audit_logs
idempotency_keys
sessions
```

## 4. Core Collections

### 4.1 users

Authentication identity.

```ts
interface User {
  _id: UUID;
  phone_e164: string;
  phone_verified_at: Date | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  created_at: Date;
  updated_at: Date;
  version: number;
}
```

Indexes:

```text
UNIQUE phone_e164
status
```

### 4.2 riders

```ts
interface Rider {
  _id: UUID;
  user_id: UUID;
  name: string | null;
  email: string | null;
  emergency_contact: {
    name: string;
    phone_e164: string;
  } | null;
  preferred_language: string | null;
  rating_average: number | null;
  rating_count: number;
  created_at: Date;
  updated_at: Date;
  version: number;
}
```

Indexes:

```text
UNIQUE user_id
```

### 4.3 drivers

```ts
interface Driver {
  _id: UUID;
  user_id: UUID;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
  kyc_status: 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'FAILED';
  operational_status: 'OFFLINE' | 'ONLINE' | 'BUSY';
  rating_average: number | null;
  rating_count: number;
  trust_score: number | null;
  current_vehicle_id: UUID | null;
  wallet_id: UUID;
  last_location_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: number;
}
```

Indexes:

```text
UNIQUE user_id
operational_status + last_location_at
status + kyc_status
```

### 4.4 driver_applications

```ts
interface DriverApplication {
  _id: UUID;
  driver_id: UUID;
  status:
    | 'DRAFT'
    | 'SUBMITTED'
    | 'UNDER_REVIEW_AUTO'
    | 'UNDER_REVIEW_ADMIN'
    | 'APPROVED'
    | 'REJECTED'
    | 'REAPPLIED';

  rejection_type: 'FIXABLE' | 'HARD_FRAUD' | null;
  rejection_reason: string | null;

  verification_provider: 'CASHFREE' | 'SUREPASS' | null;
  verification_reference: string | null;
  verification_result: object | null;

  reapply_count: number;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  reviewer_admin_id: UUID | null;

  created_at: Date;
  updated_at: Date;
  version: number;
}
```

Indexes:

```text
driver_id + created_at
status + created_at
```

### 4.5 driver_documents

```ts
interface DriverDocument {
  _id: UUID;
  driver_id: UUID;
  application_id: UUID;
  type: 'GOVERNMENT_ID' | 'DRIVING_LICENSE';
  storage_key: string;
  document_hash: string;
  document_number_masked: string | null;
  issued_at: Date | null;
  expires_at: Date | null;
  verification_status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED';
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
```

Indexes:

```text
driver_id + type
verification_status + expires_at
expires_at
```

A scheduled job must identify documents approaching expiry.

### 4.6 vehicles

```ts
type VehicleCategory = 'CAB' | 'E_RICKSHAW';

interface Vehicle {
  _id: UUID;
  driver_id: UUID;
  vehicle_type: VehicleCategory; // 'CAB' (active launch type) | 'E_RICKSHAW' (coming soon)
  make: string;
  model: string;
  registration_number: string;
  color: string | null;
  manufacture_year: number | null;
  verification_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  created_at: Date;
  updated_at: Date;
  version: number;
}
```

Indexes:

```text
UNIQUE registration_number
driver_id + verification_status
driver_id + vehicle_type
```

Vehicle category-specific pricing is **DECIDED** ([`decision-log.md`](../decision-log.md#d-025--vehicle-category-pricing--initial-fleet-types), D-025): `CAB` is active at launch, `E_RICKSHAW` is staged as coming soon. Each category is priced independently per city zone.

## 5. Geographic Collections

### 5.1 city_zones

```ts
interface CityZone {
  _id: UUID;
  city_name: string;
  state_code: string;
  boundary: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  buffer_distance_m: number | null; // D-027: Optional city override; falls back to global default (e.g. 20,000m)
  status: 'ACTIVE' | 'INACTIVE';
  current_pricing_config_id: UUID | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}
```

Indexes:

```text
2dsphere boundary
state_code + status
city_name + status
```

### 5.2 pricing_configs

```ts
interface PricingConfig {
  _id: UUID;
  city_zone_id: UUID;
  version: number;
  vehicle_type: 'CAB' | 'E_RICKSHAW'; // D-025: Independent pricing per vehicle category
  base_fare_paise: number;
  rate_per_km_paise: number;
  minimum_fare_paise: number;
  included_km_m: number;
  buffer_surcharge_paise: number; // D-027: Applied when fallback buffer classification is used
  negotiation_floor_percent: number; // D-028: Floor percentage (default 80%)
  negotiation_ceiling_percent: number; // D-028: Ceiling percentage (default 150%)
  negotiation_window_seconds: number; // D-028: Offer expiry window (default 90s)
  commission_percent: number; // D-026: Percentage of Agreed Fare debited from driver wallet
  effective_from: Date;
  effective_to: Date | null;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  created_by_admin_id: UUID;
  created_at: Date;
}
```

Indexes:

```text
city_zone_id + vehicle_type + version
city_zone_id + vehicle_type + status
effective_from
```

Vehicle category-specific pricing is **DECIDED** ([`decision-log.md`](../decision-log.md#d-025--vehicle-category-pricing--initial-fleet-types), D-025). Each city zone maintains independent active pricing configs per vehicle type (`CAB` active, `E_RICKSHAW` staged as coming soon). A configuration version must never be edited after being used by a Ride.

There is no `state_pricing` collection ([`decision-log.md`](../decision-log.md#d-037--supersede-d-035-remove-state-boundarystatepricing-system-adopt-global-outstation-pricing), D-037, supersedes D-035): every trip, regardless of `route_scope`, is priced from the same `pricing_configs` entry for its `(city_zone_id, vehicle_type)`.

## 6. Ride Collections

### 6.1 rides

The Ride is the central transactional record.

```ts
interface Ride {
  _id: UUID;

  booker_rider_id: UUID;
  passenger: {
    rider_id: UUID | null;
    name: string;
    phone_e164: string;
    pickup_otp_hash: string | null;
  };

  driver_id: UUID | null;
  vehicle_id: UUID | null;

  pickup: {
    lat: number;
    lng: number;
    address: string | null;
  };

  drop: {
    lat: number;
    lng: number;
    address: string | null;
  };

  route_snapshot: {
    provider: string;
    distance_m: number;
    duration_seconds: number;
    polyline: string;
    calculated_at: Date;
  };

  zone_snapshot: {
    classification: 'IN_CITY' | 'OUTSTATION' | 'INTERSTATE';
    city_zone_id: UUID | null;
    // Display-only — does not affect pricing_snapshot below (D-037).
    route_scope: 'INTRA_STATE' | 'INTERSTATE' | null;
    destination_state_code: string | null;
  };

  pricing_snapshot: {
    config_id: UUID;
    config_version: number;
    vehicle_type: string;
    base_fare_paise: number;
    rate_per_km_paise: number;
    minimum_fare_paise: number;
    included_km_m: number;
    buffer_surcharge_paise: number;
    negotiation_floor_percent: number;
    negotiation_ceiling_percent: number;
    commission_percent: number;
  };

  suggested_fare_paise: number;
  proposed_fare_paise: number | null;
  agreed_fare_paise: number | null;

  status:
    | 'REQUESTED'
    | 'OFFERING'
    | 'DRIVER_ASSIGNED'
    | 'DRIVER_EN_ROUTE'
    | 'DRIVER_ARRIVED'
    | 'TRIP_STARTED'
    | 'TRIP_COMPLETED'
    | 'PAYMENT_PENDING'
    | 'SETTLED'
    | 'CANCELLED'
    | 'EXPIRED';

  cancellation_reason: string | null;

  created_at: Date;
  offering_expires_at: Date | null;
  accepted_at: Date | null;
  arrived_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  settled_at: Date | null;
  cancelled_at: Date | null;

  version: number;
}
```

Indexes:

```text
booker_rider_id + created_at
driver_id + created_at
status + created_at
status + offering_expires_at
vehicle_id + created_at
```

Assignment concurrency must use an atomic conditional update or transaction.

### 6.2 ride_events

Append-only lifecycle history.

```ts
interface RideEvent {
  _id: UUID;
  ride_id: UUID;
  event_type: string;
  actor_type: 'RIDER' | 'DRIVER' | 'ADMIN' | 'SYSTEM';
  actor_id: UUID | null;
  previous_status: string | null;
  new_status: string | null;
  metadata: object;
  created_at: Date;
}
```

Indexes:

```text
ride_id + created_at
event_type + created_at
```

### 6.3 fare_negotiations

```ts
interface FareNegotiation {
  _id: UUID;
  ride_id: UUID;
  actor_type: 'RIDER' | 'DRIVER' | 'SYSTEM';
  actor_id: UUID | null;
  previous_fare_paise: number | null;
  proposed_fare_paise: number;
  action: 'PROPOSED' | 'REJECTED' | 'ACCEPTED' | 'EXPIRED';
  reason_code: string | null;
  created_at: Date;
}
```

Indexes:

```text
ride_id + created_at
ride_id + action
```

### 6.4 ride_extensions

```ts
interface RideExtension {
  _id: UUID;
  ride_id: UUID;
  requested_by: UUID;
  original_drop: {
    lat: number;
    lng: number;
  };
  new_drop: {
    lat: number;
    lng: number;
  };
  additional_distance_m: number;
  additional_fare_paise: number;
  zone_reclassification: object | null;
  status: 'REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  requested_at: Date;
  responded_at: Date | null;
}
```

## 7. Realtime Location

### 7.1 driver_locations

Highly volatile location data should not be treated as permanent ride history.

Preferred hot-path storage:

```text
Redis:
driver:{driver_id}:location
```

Persistent storage, if required for auditing or trip reconstruction:

```ts
interface DriverLocation {
  _id: UUID;
  driver_id: UUID;
  ride_id: UUID | null;
  lat: number;
  lng: number;
  heading: number | null;
  speed_mps: number | null;
  recorded_at: Date;
}
```

Indexes:

```text
driver_id + recorded_at
ride_id + recorded_at
```

Retention should be explicitly configured.

## 8. Payment Collections

### 8.1 payments

```ts
interface Payment {
  _id: UUID;
  ride_id: UUID;
  payer_rider_id: UUID;
  method: 'UPI' | 'CASH';
  amount_paise: number;
  status: 'CREATED' | 'PENDING' | 'CONFIRMED' | 'FAILED' | 'DISPUTED' | 'REFUNDED';
  provider: string | null;
  provider_payment_id: string | null;
  confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
```

Indexes:

```text
ride_id
provider + provider_payment_id
payer_rider_id + created_at
```

### 8.2 payment_events

External provider events must be immutable and idempotent.

```ts
interface PaymentEvent {
  _id: UUID;
  payment_id: UUID;
  provider: string;
  provider_event_id: string;
  event_type: string;
  payload_hash: string;
  payload: object;
  processed_at: Date | null;
  created_at: Date;
}
```

Indexes:

```text
UNIQUE provider + provider_event_id
payment_id + created_at
```

## 9. Wallet Collections

### 9.1 wallets

```ts
interface Wallet {
  _id: UUID;
  driver_id: UUID;
  balance_paise: number;
  status: 'ACTIVE' | 'BLOCKED';
  version: number;
  created_at: Date;
  updated_at: Date;
}
```

### 9.2 wallet_transactions

```ts
interface WalletTransaction {
  _id: UUID;
  wallet_id: UUID;
  driver_id: UUID;
  type: 'CREDIT' | 'DEBIT' | 'REVERSAL' | 'ADJUSTMENT';
  amount_paise: number;
  reference_type: string;
  reference_id: UUID | null;
  idempotency_key: string | null;
  balance_before_paise: number;
  balance_after_paise: number;
  created_by: UUID | null;
  created_at: Date;
}
```

Indexes:

```text
wallet_id + created_at
driver_id + created_at
reference_type + reference_id
UNIQUE idempotency_key when present
```

Posted transactions are immutable.

## 10. Reviews

```ts
interface Review {
  _id: UUID;
  ride_id: UUID;
  reviewer_id: UUID;
  subject_id: UUID;
  reviewer_role: 'RIDER' | 'DRIVER';
  rating: number;
  review_text: string | null;
  status: 'PENDING' | 'PUBLISHED' | 'MODERATED';
  created_at: Date;
  published_at: Date | null;
}
```

Unique constraint:

```text
UNIQUE ride_id + reviewer_id + subject_id
```

## 11. Trust Scores

```ts
interface TrustScore {
  _id: UUID;
  subject_id: UUID;
  subject_type: 'RIDER' | 'DRIVER';
  score: number;
  calculation_version: number;
  calculated_at: Date;
  input_snapshot: object;
}
```

The formula must remain versioned.

## 12. Disputes

```ts
interface Dispute {
  _id: UUID;
  ride_id: UUID | null;
  opened_by: UUID;
  category: 'FARE' | 'CASH_PAYMENT' | 'SAFETY' | 'OTHER';
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'REJECTED';
  description: string;
  evidence: Array<{
    type: string;
    storage_key: string;
  }>;
  assigned_admin_id: UUID | null;
  resolution: string | null;
  created_at: Date;
  resolved_at: Date | null;
}
```

Indexes:

```text
status + created_at
ride_id + created_at
assigned_admin_id + status
```

## 13. Admin and Audit

### 13.1 admin_users

```ts
interface AdminUser {
  _id: UUID;
  user_id: UUID;
  role: 'SUPER_ADMIN' | 'CITY_ADMIN' | 'SUPPORT_ADMIN' | 'FINANCE_ADMIN';
  city_zone_ids: UUID[];
  status: 'ACTIVE' | 'SUSPENDED';
  created_at: Date;
  updated_at: Date;
}
```

### 13.2 audit_logs

```ts
interface AuditLog {
  _id: UUID;
  actor_id: UUID | null;
  actor_type: 'ADMIN' | 'SYSTEM';
  action: string;
  resource_type: string;
  resource_id: UUID | null;
  before: object | null;
  after: object | null;
  request_id: string;
  created_at: Date;
}
```

Indexes:

```text
resource_type + resource_id + created_at
actor_id + created_at
action + created_at
```

## 14. Sessions

```ts
interface Session {
  _id: UUID;
  user_id: UUID;
  device_id: string;
  refresh_token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
  last_used_at: Date;
}
```

TTL:

```text
expires_at
```

Revoked sessions remain queryable until expiration where audit/security requirements require it.

## 15. Idempotency

```ts
interface IdempotencyKey {
  _id: UUID;
  key: string;
  actor_id: UUID;
  endpoint: string;
  request_hash: string;
  response_status: number | null;
  response_body: object | null;
  expires_at: Date;
  created_at: Date;
}
```

Unique index:

```text
UNIQUE actor_id + key + endpoint
```

TTL:

```text
expires_at
```

## 16. Transaction Boundaries

### Ride assignment

Must atomically:

```text
check ride status
+
assign driver
+
change ride status
```

### Wallet debit

Must atomically:

```text
check balance
+
create ledger transaction
+
update wallet balance
```

### Payment settlement

Must prevent duplicate provider events from producing duplicate settlement.

### Driver approval

Application approval and Driver activation must be consistent.

## 17. Concurrency Rules

### Ride acceptance

Do not trust client-side acceptance.

The server is authoritative.

```text
OFFERING
   │
   ├── Driver A accepts
   │
   └── Driver B accepts
```

Exactly one request may transition the Ride to `DRIVER_ASSIGNED`.

### Wallet

Concurrent debits must not produce a negative balance unless an explicitly approved transaction model permits it.

### Configuration

Published pricing configurations are immutable.

Create a new version for changes.

## 18. Data Retention

Retention periods are not yet finalized for:

```text
driver locations
government documents
ride events
audit logs
notifications
payment events
```

Do not delete operationally important records before the retention policy is approved.

## 19. Schema Completion Gate

Before implementation:

```text
[ ] Blocking open questions resolved
[ ] Vehicle pricing model finalized
[ ] Commission model finalized
[ ] Cancellation model finalized
[ ] Interstate pricing finalized
[ ] Payment states finalized
[ ] Wallet accounting finalized
[ ] Ride states finalized
[ ] Indexes reviewed
[ ] Concurrency boundaries reviewed
[ ] Retention policies approved
```
