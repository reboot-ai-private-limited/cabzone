import {
  DEFAULT_CANCELLATION_FEE_PAISE,
  DEFAULT_RIDER_CANCELLATION_GRACE_SECONDS,
  RIDE_RATING_WINDOW_MS,
  VEHICLE_CATEGORY_REGISTRY,
  formatPublicRatingLabel,
  isRiderBookingBlockedStatus,
  type RideDto,
  type RideEventDto,
  type RideStatus,
} from '@cabzone/contracts';
import { trustTierLabel } from './trust-tier';

export interface PendingDriverCounter {
  driverId: string;
  proposedFarePaise: number;
  driverName?: string | null;
  vehicleLabel?: string | null;
  createdAt: string;
}

export function formatAssignedDriverSummary(
  ride: Pick<RideDto, 'driverId' | 'vehicleCategory' | 'assignedDriver'>,
): {
  driverName: string;
  profilePhotoUrl: string | null;
  vehicleLabel: string;
  registrationNumber: string | null;
  ratingLabel: string;
  /** Public trust tier wording, or null while the driver's score is not public. */
  trustLabel: string | null;
} {
  const assigned = ride.assignedDriver;
  const driverName =
    assigned?.name?.trim() ||
    (ride.driverId ? `Driver #${ride.driverId.slice(0, 6).toUpperCase()}` : 'Your driver');
  const profilePhotoUrl = assigned?.profilePhotoUrl?.trim() || null;
  const vehicle = assigned?.vehicle;
  const makeModel = vehicle
    ? [vehicle.color, vehicle.make, vehicle.model]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(' ')
    : '';
  const vehicleLabel = makeModel || VEHICLE_CATEGORY_REGISTRY[ride.vehicleCategory].displayName;
  const registrationNumber = vehicle?.registrationNumber?.trim() || null;
  const ratingLabel = formatPublicRatingLabel(assigned?.ratingAverage, assigned?.ratingCount);

  return {
    driverName,
    profilePhotoUrl,
    vehicleLabel,
    registrationNumber,
    ratingLabel,
    trustLabel: trustTierLabel(assigned?.trustTier),
  };
}

export interface PlacePreset {
  id: string;
  name: string;
  subtitle: string;
  city: string;
  stateCode: string;
  lat: number;
  lng: number;
  category: 'CITY' | 'AIRPORT' | 'OUTSTATION';
  placeType?: 'RECENT' | 'SAVED' | 'POPULAR';
  iconType?: 'clock' | 'star' | 'train' | 'airplane' | 'mountain';
  isOutstation?: boolean;
}

export interface SavedRouteTemplate {
  id: string;
  label: string;
  mode: 'IN_CITY' | 'OUTSTATION';
  pickup: {
    lat: number;
    lng: number;
    address: string;
  };
  drop: {
    lat: number;
    lng: number;
    address: string;
  };
  createdAt: string;
}

export const PLACE_PRESETS: PlacePreset[] = [
  {
    id: 'siliguri-city-center',
    name: 'City Centre Mall, Siliguri',
    subtitle: 'Matigara, Siliguri, West Bengal',
    city: 'Siliguri',
    stateCode: 'WB',
    lat: 26.7271,
    lng: 88.4334,
    category: 'CITY',
  },
  {
    id: 'hill-cart-road',
    name: 'Hill Cart Road (Airview More)',
    subtitle: 'Central Siliguri, West Bengal',
    city: 'Siliguri',
    stateCode: 'WB',
    lat: 26.7141,
    lng: 88.425,
    category: 'CITY',
  },
  {
    id: 'sevoke-road',
    name: 'Sevoke Road (Cosmos Mall)',
    subtitle: '2nd Mile, Sevoke Rd, Siliguri',
    city: 'Siliguri',
    stateCode: 'WB',
    lat: 26.742,
    lng: 88.438,
    category: 'CITY',
  },
  {
    id: 'njp-station',
    name: 'New Jalpaiguri (NJP) Railway Station',
    subtitle: 'Bhaktinagar, Siliguri, West Bengal',
    city: 'Siliguri',
    stateCode: 'WB',
    lat: 26.6836,
    lng: 88.4461,
    category: 'CITY',
  },
  {
    id: 'bagdogra-airport',
    name: 'Bagdogra International Airport (IXB)',
    subtitle: 'Airport Rd, Bagdogra, West Bengal',
    city: 'Siliguri',
    stateCode: 'WB',
    lat: 26.6812,
    lng: 88.3286,
    category: 'AIRPORT',
  },
  {
    id: 'kurseong-town',
    name: 'Kurseong Hill Station',
    subtitle: 'Darjeeling District, West Bengal',
    city: 'Kurseong',
    stateCode: 'WB',
    lat: 26.8821,
    lng: 88.2789,
    category: 'OUTSTATION',
  },
  {
    id: 'darjeeling-mall',
    name: 'Chowrasta (Darjeeling Mall Road)',
    subtitle: 'Darjeeling Hills, West Bengal',
    city: 'Darjeeling',
    stateCode: 'WB',
    lat: 27.041,
    lng: 88.2663,
    category: 'OUTSTATION',
  },
  {
    id: 'gangtok-mg-marg',
    name: 'MG Marg, Gangtok (Interstate)',
    subtitle: 'East Sikkim, Sikkim',
    city: 'Gangtok',
    stateCode: 'SK',
    lat: 27.3314,
    lng: 88.6138,
    category: 'OUTSTATION',
  },
  {
    id: 'siliguri-junction',
    name: 'Siliguri Junction (SGUJ)',
    subtitle: 'Pradhan Nagar, Siliguri',
    city: 'Siliguri',
    stateCode: 'WB',
    lat: 26.7305,
    lng: 88.423,
    category: 'CITY',
    placeType: 'SAVED',
    iconType: 'star',
  },
  {
    id: 'vega-circle',
    name: 'Vega Circle',
    subtitle: 'Sevoke Rd, Siliguri',
    city: 'Siliguri',
    stateCode: 'WB',
    lat: 26.7538,
    lng: 88.4419,
    category: 'CITY',
    placeType: 'SAVED',
    iconType: 'star',
  },
  {
    id: 'kalimpong-bazaar',
    name: 'Kalimpong Main Town',
    subtitle: 'Kalimpong District, West Bengal',
    city: 'Kalimpong',
    stateCode: 'WB',
    lat: 27.066,
    lng: 88.4695,
    category: 'OUTSTATION',
  },
];

export function isRideActive(status: RideStatus): boolean {
  return isRiderBookingBlockedStatus(status);
}

export function extractActiveRideConflictId(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const status = (error as { status?: unknown }).status;
  const details = (error as { details?: unknown }).details;
  if (status !== 409 || !details || typeof details !== 'object') return null;
  const record = details as Record<string, unknown>;
  if (
    record.code === 'ACTIVE_RIDE_EXISTS' &&
    typeof record.rideId === 'string' &&
    record.rideId.trim().length > 0
  ) {
    return record.rideId.trim();
  }
  return null;
}

export function createBookingIdempotencyKey(): string {
  return `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function formatRupeesFromPaise(paise: number | null | undefined): string {
  if (typeof paise !== 'number' || !Number.isFinite(paise)) return '₹0';
  const rupees = Math.round(paise / 100);
  return `₹${rupees.toLocaleString('en-IN')}`;
}

export function clampProposedFarePaise(
  proposedPaise: number,
  floorPaise: number,
  ceilingPaise: number,
): number {
  const stepPaise = 500; // ₹5 increments
  const rounded = Math.round(proposedPaise / stepPaise) * stepPaise;
  return Math.min(Math.max(rounded, floorPaise), ceilingPaise);
}

export function normalizeIndianPhoneE164(rawInput: string): string | null {
  const digits = rawInput.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91') && /^91[6-9]\d{9}$/.test(digits)) {
    return `+${digits}`;
  }
  return null;
}

export interface RiderCancellationPreview {
  feePaise: number;
  policyFeePaise: number;
  graceSeconds: number;
  graceRemainingSeconds: number;
  isFree: boolean;
  summaryText: string;
}

export function resolveRiderCancellationPreview(
  ride: Pick<RideDto, 'status' | 'driverId' | 'acceptedAt' | 'updatedAt' | 'pricingSnapshot'>,
  nowMs: number = Date.now(),
): RiderCancellationPreview {
  const policyFeePaise =
    typeof ride.pricingSnapshot?.cancellationFeePaise === 'number' &&
    Number.isFinite(ride.pricingSnapshot.cancellationFeePaise)
      ? Math.max(0, ride.pricingSnapshot.cancellationFeePaise)
      : DEFAULT_CANCELLATION_FEE_PAISE;
  const graceSeconds =
    typeof ride.pricingSnapshot?.riderCancellationGraceSeconds === 'number' &&
    Number.isFinite(ride.pricingSnapshot.riderCancellationGraceSeconds)
      ? Math.max(0, ride.pricingSnapshot.riderCancellationGraceSeconds)
      : DEFAULT_RIDER_CANCELLATION_GRACE_SECONDS;

  if (ride.status === 'REQUESTED' || ride.status === 'OFFERING' || !ride.driverId) {
    return {
      feePaise: 0,
      policyFeePaise,
      graceSeconds,
      graceRemainingSeconds: graceSeconds,
      isFree: true,
      summaryText: 'Free to cancel while searching for a driver.',
    };
  }

  if (ride.status === 'DRIVER_ARRIVED') {
    const isFree = policyFeePaise === 0;
    return {
      feePaise: policyFeePaise,
      policyFeePaise,
      graceSeconds,
      graceRemainingSeconds: 0,
      isFree,
      summaryText: isFree
        ? 'No cancellation fee applies to this ride.'
        : `A ${formatRupeesFromPaise(policyFeePaise)} cancellation fee applies because your driver has arrived at pickup. Any unpaid fee is added to your next ride.`,
    };
  }

  if (ride.status === 'DRIVER_ASSIGNED' || ride.status === 'DRIVER_EN_ROUTE') {
    const anchorIso = ride.acceptedAt ?? ride.updatedAt;
    const anchorMs = Date.parse(anchorIso);
    const elapsedMs = Number.isFinite(anchorMs) ? Math.max(0, nowMs - anchorMs) : 0;
    const graceMs = graceSeconds * 1000;
    const graceRemainingSeconds = Math.max(0, Math.ceil((graceMs - elapsedMs) / 1000));
    const withinGrace = elapsedMs <= graceMs;

    if (withinGrace || policyFeePaise === 0) {
      return {
        feePaise: 0,
        policyFeePaise,
        graceSeconds,
        graceRemainingSeconds,
        isFree: true,
        summaryText:
          policyFeePaise > 0 && graceRemainingSeconds > 0
            ? `Free cancellation for the next ${graceRemainingSeconds}s (${formatRupeesFromPaise(policyFeePaise)} fee applies after the ${graceSeconds}s grace window).`
            : 'Free cancellation applies right now.',
      };
    }

    return {
      feePaise: policyFeePaise,
      policyFeePaise,
      graceSeconds,
      graceRemainingSeconds: 0,
      isFree: false,
      summaryText: `A ${formatRupeesFromPaise(policyFeePaise)} cancellation fee applies after the ${graceSeconds}s grace window. Any unpaid fee is added to your next ride.`,
    };
  }

  return {
    feePaise: 0,
    policyFeePaise,
    graceSeconds,
    graceRemainingSeconds: 0,
    isFree: true,
    summaryText: 'Cancellation availability depends on live trip state.',
  };
}

export interface RideCashAvailability {
  cashAllowed: boolean;
  arrearsPaise: number;
  cashBlockThresholdPaise: number;
  reason: string | null;
}

export function resolveRideCashAvailability(
  ride: Pick<RideDto, 'arrearsPaise' | 'pricingSnapshot'>,
): RideCashAvailability {
  const arrearsPaise = Math.max(0, ride.arrearsPaise ?? 0);
  const rawThreshold = ride.pricingSnapshot?.cancellationFeePaise ?? DEFAULT_CANCELLATION_FEE_PAISE;
  const cashBlockThresholdPaise = rawThreshold > 0 ? rawThreshold : DEFAULT_CANCELLATION_FEE_PAISE;

  return {
    cashAllowed: true,
    arrearsPaise,
    cashBlockThresholdPaise,
    reason: null,
  };
}

export function isRideWithinRatingWindow(
  settledAtIso: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!settledAtIso) return false;
  const settledMs = Date.parse(settledAtIso);
  if (!Number.isFinite(settledMs)) return false;
  const elapsed = nowMs - settledMs;
  return elapsed >= 0 && elapsed <= RIDE_RATING_WINDOW_MS;
}

/**
 * Extracts unanswered driver counter-offers from ride events.
 * Mirrors backend NegotiateFareUseCase.pendingCounters with resilient metadata checks.
 */
export function extractPendingDriverCounters(events: RideEventDto[]): PendingDriverCounter[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const pending = new Map<string, PendingDriverCounter>();
  let raisedVersion = 0;
  for (const event of sorted) {
    if (event.eventType === 'FARE_PROPOSAL_RAISED') {
      raisedVersion = Number(event.metadata?.rideVersion ?? 0);
      pending.clear();
      continue;
    }
    if (
      event.eventType !== 'FARE_COUNTER_PROPOSED' &&
      event.eventType !== 'FARE_COUNTER_ACCEPTED' &&
      event.eventType !== 'FARE_COUNTER_REJECTED'
    ) {
      continue;
    }
    const meta = event.metadata ?? {};
    const driverId = typeof meta.driverId === 'string' ? meta.driverId.trim() : '';
    if (!driverId) continue;

    if (event.eventType === 'FARE_COUNTER_PROPOSED') {
      if (raisedVersion && Number(meta.rideVersion ?? 0) < raisedVersion) continue;
      const fare = Number(meta.proposedFarePaise);
      if (!Number.isFinite(fare) || fare <= 0) continue;
      const driverName =
        typeof meta.driverName === 'string' && meta.driverName.trim().length > 0
          ? meta.driverName.trim()
          : null;
      const vehicleLabel =
        typeof meta.vehicleLabel === 'string' && meta.vehicleLabel.trim().length > 0
          ? meta.vehicleLabel.trim()
          : null;
      pending.set(driverId, {
        driverId,
        proposedFarePaise: fare,
        driverName,
        vehicleLabel,
        createdAt: event.createdAt,
      });
    } else {
      pending.delete(driverId);
    }
  }
  return [...pending.values()];
}

export function getRideStatusMeta(status: RideStatus): {
  label: string;
  subtitle: string;
  tone: 'amber' | 'green' | 'red' | 'neutral';
} {
  switch (status) {
    case 'REQUESTED':
    case 'OFFERING':
      return {
        label: 'Finding your driver…',
        subtitle: 'Your offer is visible to nearby drivers',
        tone: 'amber',
      };
    case 'DRIVER_ASSIGNED':
      return {
        label: 'Driver Assigned',
        subtitle: 'Driver accepted your fare and is preparing to head to pickup.',
        tone: 'green',
      };
    case 'DRIVER_EN_ROUTE':
      return {
        label: 'Driver En Route',
        subtitle: 'Driver is on the way to your pickup point.',
        tone: 'green',
      };
    case 'DRIVER_ARRIVED':
      return {
        label: 'Driver Arrived at Pickup',
        subtitle: 'Share your 4-digit Pickup OTP with the driver to start the trip.',
        tone: 'amber',
      };
    case 'TRIP_STARTED':
      return {
        label: 'In Transit',
        subtitle: 'Enjoy your ride! Heading toward destination.',
        tone: 'green',
      };
    case 'TRIP_COMPLETED':
    case 'PAYMENT_PENDING':
      return {
        label: 'Payment Pending',
        subtitle: 'Pay via UPI or confirm if you already paid cash to your driver.',
        tone: 'amber',
      };
    case 'PAYMENT_CASH_CLAIMED':
      return {
        label: 'Cash Paid · Awaiting Driver',
        subtitle:
          'You marked this fare paid in cash. Your next ride is unlocked while your driver confirms receipt.',
        tone: 'amber',
      };
    case 'PAYMENT_UNPAID':
      return {
        label: 'Unpaid Fare Due',
        subtitle:
          'Your driver reported this trip unpaid. Pay via UPI below or report a payment issue if you paid cash.',
        tone: 'red',
      };
    case 'PAYMENT_CONFIRMED':
      return {
        label: 'Payment Confirmed · Finalizing',
        subtitle: 'Driver confirmed payment receipt. Completing settlement...',
        tone: 'green',
      };
    case 'SETTLED':
      return {
        label: 'Ride Completed & Settled',
        subtitle: 'Driver confirmed payment receipt. Thank you for riding with Cabzone!',
        tone: 'green',
      };
    case 'PAYMENT_DISPUTED':
      return {
        label: 'Payment Under Review',
        subtitle: 'Your payment dispute has been logged for Cabzone Support review.',
        tone: 'red',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        subtitle: 'This ride was cancelled.',
        tone: 'red',
      };
    case 'EXPIRED':
      return {
        label: 'No driver found',
        subtitle: 'No driver accepted this offer. Try booking again with a higher fare.',
        tone: 'neutral',
      };
    default:
      return {
        label: status,
        subtitle: '',
        tone: 'neutral',
      };
  }
}
