import type { RideExtensionProposalDto } from './extensions.js';
import type { TollSnapshot } from './tolls.js';
import type { StateDistanceBreakdown } from './pricing.js';
import type { VehicleCategory } from './vehicles.js';

/**
 * Ride state machine statuses.
 *
 * Per Decisions:
 * - D-030: Atomic assignment (OFFERING -> DRIVER_ASSIGNED).
 * - D-031: Timeout to EXPIRED.
 * - D-032: State-based cancellation.
 * - D-033: Cash payment confirmation and PAYMENT_DISPUTED workflow.
 * - D-046: Double-blind post-ride ratings on SETTLED rides within 7 days.
 */
export const RIDE_STATUSES = [
  'REQUESTED',
  'OFFERING',
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'TRIP_STARTED',
  'TRIP_COMPLETED',
  'PAYMENT_PENDING',
  'PAYMENT_CASH_CLAIMED',
  'PAYMENT_UNPAID',
  'PAYMENT_CONFIRMED',
  'PAYMENT_DISPUTED',
  'SETTLED',
  'CANCELLED',
  'EXPIRED',
] as const;

export type RideStatus = (typeof RIDE_STATUSES)[number];

/**
 * Ride statuses indexed by MongoDB's `one_active_ride_per_rider` partial unique index (Decision D-043).
 * Keep this exact 9-status list stable so existing MongoDB partial indexes never conflict on boot.
 */
export const ACTIVE_RIDE_STATUSES = [
  'REQUESTED',
  'OFFERING',
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'TRIP_STARTED',
  'TRIP_COMPLETED',
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
] as const satisfies readonly RideStatus[];

export type ActiveRideStatus = (typeof ACTIVE_RIDE_STATUSES)[number];

/**
 * Statuses that block a rider (`bookerRiderId`) from creating a new ride:
 * includes `PAYMENT_UNPAID` (driver reported trip unpaid; rider must settle via UPI),
 * and excludes `PAYMENT_CASH_CLAIMED` (rider claimed cash handover awaiting driver confirmation).
 */
export const RIDER_BOOKING_BLOCKED_STATUSES = [
  ...ACTIVE_RIDE_STATUSES,
  'PAYMENT_UNPAID',
] as const satisfies readonly RideStatus[];

/**
 * Statuses where an assigned driver is physically on an active trip and unavailable for new offers.
 * Post-drop payment states (`TRIP_COMPLETED`, `PAYMENT_PENDING`, `PAYMENT_CASH_CLAIMED`) never block new offers.
 */
export const DRIVER_ON_TRIP_STATUSES = [
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'TRIP_STARTED',
] as const satisfies readonly RideStatus[];

export const DRIVER_PENDING_PAYMENT_STATUSES = [
  'TRIP_COMPLETED',
  'PAYMENT_PENDING',
  'PAYMENT_CASH_CLAIMED',
] as const satisfies readonly RideStatus[];

const ACTIVE_RIDE_STATUS_SET: ReadonlySet<RideStatus> = new Set(ACTIVE_RIDE_STATUSES);
const RIDER_BOOKING_BLOCKED_SET: ReadonlySet<RideStatus> = new Set(RIDER_BOOKING_BLOCKED_STATUSES);

export function isActiveRideStatus(status: RideStatus): boolean {
  return ACTIVE_RIDE_STATUS_SET.has(status);
}

export function isRiderBookingBlockedStatus(status: RideStatus): boolean {
  return RIDER_BOOKING_BLOCKED_SET.has(status);
}

export interface ActiveRideConflictDetailsDto {
  code: 'ACTIVE_RIDE_EXISTS';
  rideId: string;
  status: RideStatus;
  ridePath: string;
}

export const CANCELLATION_REASONS = [
  'RIDER_CHANGED_MIND',
  'DRIVER_DELAYED',
  'RIDER_NO_SHOW',
  'DRIVER_NO_SHOW',
  'FARE_DISAGREEMENT',
  'ADMIN_OVERRIDE',
  'TIMEOUT_EXPIRED',
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export type ZoneClassificationType = 'IN_CITY' | 'OUTSTATION' | 'INTERSTATE';

export interface StateSegmentDto {
  stateCode: string;
  distanceM: number;
  ratePerKmPaise: number;
  segmentFarePaise: number;
}

/**
 * Immutable pricing snapshot locked at ride creation.
 * Per Decisions D-034 and D-044.
 */
export interface RidePricingSnapshot {
  extensionTariffs?: {
    originStateCode: string | null;
    outstationRatePerKmPaise: number;
    stateRates: Record<string, number>;
  };
  pricingConfigId: string;
  pricingConfigVersion: number;
  vehicleCategory: VehicleCategory;
  baseFarePaise: number;
  ratePerKmPaise: number;
  minimumFarePaise: number;
  bufferSurchargePaise: number;
  negotiationFloorPercent: number;
  negotiationCeilingPercent: number;
  commissionPercent: number;
  cancellationFeePaise?: number;
  driverCompensationPaise?: number;
  platformCancellationFeePaise?: number;
  riderCancellationGraceSeconds?: number;
  driverNoShowWaitSeconds?: number;
  zoneType: ZoneClassificationType;
  stateSegments?: StateSegmentDto[];
  stateBreakdown?: StateDistanceBreakdown[];
  statePricingVersions?: { stateCode: string; configId: string; version: number }[];
}

export interface RideAssignedDriverVehicleDto {
  vehicleId: string;
  make: string;
  model: string;
  color: string;
  registrationNumber: string;
  vehicleCategory: VehicleCategory;
}

export interface RideAssignedDriverDto {
  driverId: string;
  name: string;
  /** Legacy clients may supply this field; public ride responses omit it. */
  phoneE164?: string;
  profilePhotoUrl: string | null;
  ratingAverage?: number | null;
  ratingCount?: number;
  vehicle: RideAssignedDriverVehicleDto | null;
}

/**
 * Post-ride double-blind rating rules & contracts (Decision D-046, OQ-018, OQ-019).
 */
export const RIDE_RATING_WINDOW_HOURS = 168;
export const RIDE_RATING_WINDOW_MS = RIDE_RATING_WINDOW_HOURS * 60 * 60 * 1000;
export const MIN_PUBLIC_RATING_COUNT = 5;
export const MIN_PUBLIC_TRUST_SCORE_COMPLETED_RIDES = 5;

export const RIDE_REVIEW_ROLES = ['RIDER', 'DRIVER'] as const;
export type RideReviewRole = (typeof RIDE_REVIEW_ROLES)[number];

export const RIDE_REVIEW_STATUSES = ['HIDDEN', 'REVEALED'] as const;
export type RideReviewStatus = (typeof RIDE_REVIEW_STATUSES)[number];

export const RIDER_TO_DRIVER_RATING_TAGS = [
  'POLITE_DRIVER',
  'CLEAN_VEHICLE',
  'SAFE_DRIVING',
  'ON_TIME_PICKUP',
  'FAIR_NEGOTIATION',
  'LATE_PICKUP',
  'RASH_DRIVING',
  'VEHICLE_CONDITION',
] as const;
export type RiderToDriverRatingTag = (typeof RIDER_TO_DRIVER_RATING_TAGS)[number];

export const DRIVER_TO_RIDER_RATING_TAGS = [
  'POLITE_RIDER',
  'READY_AT_PICKUP',
  'CLEAR_LOCATION',
  'PROMPT_PAYMENT',
  'LATE_AT_PICKUP',
  'RUDE_BEHAVIOUR',
  'PAYMENT_FRICTION',
] as const;
export type DriverToRiderRatingTag = (typeof DRIVER_TO_RIDER_RATING_TAGS)[number];

export const RIDE_RATING_TAG_LABELS: Record<
  RiderToDriverRatingTag | DriverToRiderRatingTag,
  string
> = {
  POLITE_DRIVER: 'Polite & respectful',
  CLEAN_VEHICLE: 'Clean vehicle',
  SAFE_DRIVING: 'Safe driving',
  ON_TIME_PICKUP: 'On-time pickup',
  FAIR_NEGOTIATION: 'Fair fare agreement',
  LATE_PICKUP: 'Late pickup',
  RASH_DRIVING: 'Unsafe driving',
  VEHICLE_CONDITION: 'Vehicle issue',
  POLITE_RIDER: 'Polite passenger',
  READY_AT_PICKUP: 'Ready at pickup',
  CLEAR_LOCATION: 'Clear pickup pin',
  PROMPT_PAYMENT: 'Smooth payment',
  LATE_AT_PICKUP: 'Kept waiting',
  RUDE_BEHAVIOUR: 'Disrespectful behaviour',
  PAYMENT_FRICTION: 'Payment delay',
};

export interface SubmitRideRatingRequestDto {
  stars: number;
  tags?: string[];
  comment?: string | null;
}

export interface RideReviewDto {
  id: string;
  rideId: string;
  reviewerRole: RideReviewRole;
  revieweeRole: RideReviewRole;
  stars: number;
  tags: string[];
  comment: string | null;
  status: RideReviewStatus;
  windowExpiresAt: string;
  revealedAt: string | null;
  createdAt: string;
}

export interface RideRatingStatusDto {
  rideId: string;
  eligible: boolean;
  canSubmit: boolean;
  windowExpiresAt: string | null;
  isWindowExpired: boolean;
  visibilityRule: 'DOUBLE_BLIND_7D';
  myReview: RideReviewDto | null;
  counterpartyReview: RideReviewDto | null;
}

/**
 * Formats a public-facing star rating label under D-046:
 * Never exposes fabricated defaults (e.g. 5.0 when unrated) and displays "New"
 * until at least MIN_PUBLIC_RATING_COUNT (5) revealed ratings exist.
 */
export function formatPublicRatingLabel(
  ratingAverage: number | null | undefined,
  ratingCount: number | null | undefined,
  decimals = 1,
): string {
  const count = typeof ratingCount === 'number' && Number.isFinite(ratingCount) ? ratingCount : 0;
  if (
    count < MIN_PUBLIC_RATING_COUNT ||
    typeof ratingAverage !== 'number' ||
    !Number.isFinite(ratingAverage) ||
    ratingAverage <= 0
  ) {
    return 'New';
  }
  return ratingAverage.toFixed(decimals);
}

export interface DriverRideSettlementDto {
  grossPaise: number;
  commissionChargedPaise: number;
  commissionRefundedPaise: number;
  netCommissionPaise: number;
  netEarningsPaise: number;
  onlineEarningsReversedPaise?: number;
  settledVia: 'CASH' | 'ONLINE_UPI' | 'UNSETTLED';
}

/** Maximum intermediate stops a rider can add between pickup and drop. */
export const MAX_RIDE_STOPS = 3;

export interface RideDto {
  extensionProposal?: RideExtensionProposalDto | null;
  tollSnapshot?: TollSnapshot | null;
  paymentCollection?: 'DIRECT' | 'CASH' | 'RAZORPAY_TEST' | 'RAZORPAY_UPI';
  driverSettlement?: DriverRideSettlementDto;
  id: string;
  bookerRiderId: string;
  passenger: {
    riderId: string | null;
    name: string;
    /** Legacy clients may supply this field; public ride responses omit it. */
    phoneE164?: string;
    pickupOtpExpiresAt?: string | null;
  };
  driverId: string | null;
  vehicleId: string | null;
  assignedDriver?: RideAssignedDriverDto | null;
  status: RideStatus;
  vehicleCategory: VehicleCategory;
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
  /** Intermediate stops in visiting order; absent or empty for direct rides. */
  stops?: { lat: number; lng: number; address: string | null }[];
  routeSnapshot: {
    provider: string;
    distanceM: number;
    durationSeconds: number;
    polyline: string;
    calculatedAt: string;
  };
  zoneSnapshot: {
    classification: ZoneClassificationType;
    cityZoneId: string | null;
    routeScope?: 'INTRA_STATE' | 'INTERSTATE' | null;
    destinationStateCode?: string | null;
  };
  suggestedFarePaise: number;
  proposedFarePaise: number | null;
  agreedFarePaise: number | null;
  /** Unpaid rider cancellation/no-show fee arrears attached to this ride (D-044). */
  arrearsPaise?: number;
  /** Total amount payable for this ride: active fare + arrearsPaise (D-044). */
  totalPayablePaise?: number;
  pricingSnapshot: RidePricingSnapshot;
  cancellationReason: CancellationReason | null;
  offeringExpiresAt: string | null;
  acceptedAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  settledAt: string | null;
  cancelledAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export const DRIVER_EARNINGS_PERIODS = ['TODAY', 'WEEK', 'MONTH', 'ALL'] as const;
export type DriverEarningsPeriod = (typeof DRIVER_EARNINGS_PERIODS)[number];

export interface DriverEarningsSummaryDto {
  period: DriverEarningsPeriod;
  timezone: 'Asia/Kolkata';
  periodStart: string | null;
  periodEnd: string;
  totalAssignedRidesCount: number;
  completedTripsCount: number;
  cancelledTripsCount: number;
  pendingPaymentTripsCount: number;
  pendingPaymentGrossPaise: number;
  disputedTripsCount: number;
  disputedGrossPaise: number;
  grossFarePaise: number;
  cashGrossPaise: number;
  onlineGrossPaise: number;
  commissionChargedPaise: number;
  commissionRefundedPaise: number;
  netCommissionPaise: number;
  netEarningsPaise: number;
  onlineEarningsReversedPaise?: number;
  cancellationCompensationPaise: number;
  unreconciledRidesCount: number;
}

export interface PaginatedRidesDto {
  items: RideDto[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export type RideEarningsReconciliationIssueCode =
  | 'HISTORICAL_ONLINE_MISSING_EARNINGS'
  | 'CASH_MISSING_COMMISSION'
  | 'AMOUNT_MISMATCH'
  | 'MISSING_DRIVER_WALLET'
  | 'ORPHAN_LEDGER_RIDE_ENTRY'
  | 'PROVIDER_CAPTURED_RIDE_UNSETTLED'
  | 'PROVIDER_SETTLEMENT_MISMATCH'
  | 'ONLINE_REFUND_MISSING_REVERSAL';

export interface RideEarningsReconciliationIssueDto {
  code: RideEarningsReconciliationIssueCode;
  rideId: string | null;
  driverId: string | null;
  transactionId?: string | null;
  expectedPaise?: number | null;
  actualPaise?: number | null;
  detail: string;
}

export interface DriverEarningsReconciliationDto {
  mode: 'AUDIT' | 'BACKFILL_ONLINE_EARNINGS' | 'RECONCILE_PENDING_ONLINE';
  checkedSettledRides: number;
  cleanCashRides: number;
  cleanOnlineRides: number;
  backfilledRideIds: string[];
  skippedRideIds: string[];
  checkedPendingOnlineRides?: number;
  reconciledPendingRideIds?: string[];
  issues: RideEarningsReconciliationIssueDto[];
}

export const NEGOTIATION_ACTIONS = ['PROPOSED', 'REJECTED', 'ACCEPTED', 'EXPIRED'] as const;
export type NegotiationAction = (typeof NEGOTIATION_ACTIONS)[number];

export const NEGOTIATION_ACTORS = ['RIDER', 'DRIVER', 'SYSTEM'] as const;
export type NegotiationActor = (typeof NEGOTIATION_ACTORS)[number];

export interface FareNegotiationDto {
  id: string;
  rideId: string;
  actorType: NegotiationActor;
  actorId: string | null;
  previousFarePaise: number | null;
  proposedFarePaise: number;
  action: NegotiationAction;
  reasonCode: string | null;
  createdAt: string;
}

export const RIDE_EVENT_ACTORS = ['RIDER', 'DRIVER', 'ADMIN', 'SYSTEM'] as const;
export type RideEventActor = (typeof RIDE_EVENT_ACTORS)[number];

export interface RideEventDto {
  id: string;
  rideId: string;
  eventType: string;
  actorType: RideEventActor;
  actorId: string | null;
  previousStatus: RideStatus | null;
  newStatus: RideStatus | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const EXTENSION_STATUSES = ['REQUESTED', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const;
export type ExtensionStatus = (typeof EXTENSION_STATUSES)[number];

export interface RideExtensionDto {
  id: string;
  rideId: string;
  requestedBy: string;
  originalDrop: {
    lat: number;
    lng: number;
  };
  newDrop: {
    lat: number;
    lng: number;
  };
  additionalDistanceM: number;
  additionalFarePaise: number;
  status: ExtensionStatus;
  requestedAt: string;
  respondedAt: string | null;
}
