import type { DriverApplicationStatus } from '@cabzone/contracts';
import { Badge, type BadgeTone } from '@cabzone/design-system';

const TONES: Record<DriverApplicationStatus, BadgeTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  UNDER_REVIEW_AUTO: 'info',
  UNDER_REVIEW_ADMIN: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  REAPPLIED: 'warning',
};

/** Applications an admin can still decide on. */
export const REVIEWABLE: ReadonlySet<DriverApplicationStatus> = new Set([
  'SUBMITTED',
  'UNDER_REVIEW_AUTO',
  'UNDER_REVIEW_ADMIN',
  'REAPPLIED',
]);

export function StatusBadge({ status }: { status: DriverApplicationStatus }) {
  return <Badge tone={TONES[status]}>{status.replaceAll('_', ' ')}</Badge>;
}
