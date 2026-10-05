import type { UserStatus } from '@cabzone/contracts';
import { Badge, type BadgeTone } from '@cabzone/design-system';

const STATUS_TONES: Record<UserStatus, BadgeTone> = {
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  DELETED: 'neutral',
};

const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  DELETED: 'Deleted',
};

export function RiderStatusBadge({ status }: { status: UserStatus | string }) {
  const tone = (STATUS_TONES as Record<string, BadgeTone>)[status] ?? 'neutral';
  const label = (STATUS_LABELS as Record<string, string>)[status] ?? status;
  return <Badge tone={tone}>{label}</Badge>;
}
