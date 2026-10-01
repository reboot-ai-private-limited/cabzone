import type { RideStatus } from '@cabzone/contracts';
import { Badge, type BadgeTone } from '@cabzone/design-system';

const TONES: Record<RideStatus, BadgeTone> = {
  REQUESTED: 'info',
  OFFERING: 'warning',
  DRIVER_ASSIGNED: 'info',
  DRIVER_EN_ROUTE: 'info',
  DRIVER_ARRIVED: 'accent',
  TRIP_STARTED: 'accent',
  TRIP_COMPLETED: 'success',
  PAYMENT_PENDING: 'warning',
  PAYMENT_CONFIRMED: 'success',
  PAYMENT_DISPUTED: 'danger',
  SETTLED: 'success',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
};

/** The label is always shown, so tone is never the only signal. */
export function RideStatusBadge({ status }: { status: RideStatus }) {
  return <Badge tone={TONES[status]}>{status.replaceAll('_', ' ')}</Badge>;
}
