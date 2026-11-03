import type { CancellationReason, RideEventActor } from '@cabzone/contracts';
import { AppError } from '../../../shared/errors/AppError.js';

/**
 * Which cancellation reasons each actor may submit (D-048).
 * Riders may cite the driver's behaviour, but that claim is unverified, so it never counts against
 * the driver (see cancellationFault). ADMIN and SYSTEM may use any reason.
 */
export const ALLOWED_CANCELLATION_REASONS: Record<
  RideEventActor,
  readonly CancellationReason[] | 'ANY'
> = {
  RIDER: ['RIDER_CHANGED_MIND', 'DRIVER_DELAYED', 'DRIVER_NO_SHOW', 'FARE_DISAGREEMENT'],
  DRIVER: ['RIDER_NO_SHOW', 'DRIVER_DELAYED', 'FARE_DISAGREEMENT'],
  ADMIN: 'ANY',
  SYSTEM: 'ANY',
};

export function assertCancellationReasonAllowed(
  actor: RideEventActor,
  reason: CancellationReason,
): void {
  const allowed = ALLOWED_CANCELLATION_REASONS[actor];
  if (allowed === 'ANY' || allowed.includes(reason)) return;
  throw AppError.badRequest(
    `INVALID_CANCELLATION_REASON: ${actor.toLowerCase()} cannot cancel with reason ${reason}.`,
  );
}

/** Best-effort actor for rides cancelled before `cancelledBy` was stored. Ambiguous reasons stay null. */
export function inferCancelledBy(reason: CancellationReason | null): RideEventActor | null {
  switch (reason) {
    case 'RIDER_CHANGED_MIND':
      return 'RIDER';
    case 'RIDER_NO_SHOW':
      return 'DRIVER'; // only a driver can report a rider no-show
    case 'ADMIN_OVERRIDE':
      return 'ADMIN';
    case 'TIMEOUT_EXPIRED':
      return 'SYSTEM';
    default:
      // DRIVER_DELAYED / DRIVER_NO_SHOW / FARE_DISAGREEMENT can come from either side
      return null;
  }
}

export interface CancellationFault {
  /** The party this cancellation counts against, or null when it is neutral. */
  party: 'RIDER' | 'DRIVER' | null;
  noShow: boolean;
}

const NEUTRAL: CancellationFault = { party: null, noShow: false };

/**
 * Attribution matrix from the trust score plan (section 4.2).
 * `wasAssigned` is false for rides cancelled before any driver was assigned: those are free to
 * cancel, so they are neutral.
 */
export function cancellationFault(input: {
  cancelledBy: RideEventActor | null;
  reason: CancellationReason | null;
  wasAssigned: boolean;
}): CancellationFault {
  const { cancelledBy, reason, wasAssigned } = input;
  if (!cancelledBy || !reason || !wasAssigned) return NEUTRAL;
  switch (reason) {
    case 'RIDER_CHANGED_MIND':
      return cancelledBy === 'RIDER' ? { party: 'RIDER', noShow: false } : NEUTRAL;
    case 'RIDER_NO_SHOW':
      return cancelledBy === 'DRIVER' ? { party: 'RIDER', noShow: true } : NEUTRAL;
    case 'DRIVER_DELAYED':
      return cancelledBy === 'DRIVER' ? { party: 'DRIVER', noShow: false } : NEUTRAL;
    case 'DRIVER_NO_SHOW':
      return cancelledBy === 'DRIVER' ? { party: 'DRIVER', noShow: true } : NEUTRAL;
    default:
      return NEUTRAL; // FARE_DISAGREEMENT, ADMIN_OVERRIDE, TIMEOUT_EXPIRED
  }
}
