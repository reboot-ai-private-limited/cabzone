import {
  VEHICLE_CATEGORY_REGISTRY,
  type RideDto,
  type RideEventDto,
  type RideStatus,
} from '@cabzone/contracts';

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
  phoneE164: string | null;
  profilePhotoUrl: string | null;
  vehicleLabel: string;
  registrationNumber: string | null;
} {
  const assigned = ride.assignedDriver;
  const driverName =
    assigned?.name?.trim() ||
    (ride.driverId ? `Driver #${ride.driverId.slice(0, 6).toUpperCase()}` : 'Your driver');
  const phoneE164 = assigned?.phoneE164?.trim() || null;
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

  return {
    driverName,
    phoneE164,
    profilePhotoUrl,
    vehicleLabel,
    registrationNumber,
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

const ACTIVE_RIDE_STATUSES: ReadonlySet<RideStatus> = new Set([
  'REQUESTED',
  'OFFERING',
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'TRIP_STARTED',
  'TRIP_COMPLETED',
  'PAYMENT_PENDING',
]);

export function isRideActive(status: RideStatus): boolean {
  return ACTIVE_RIDE_STATUSES.has(status);
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
        subtitle: 'Pay the Agreed Fare directly via Cash or Driver Personal UPI.',
        tone: 'amber',
      };
    case 'PAYMENT_CONFIRMED':
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
