import type { AdminStatus } from '@cabzone/contracts';
import { Badge, type BadgeTone } from '@cabzone/design-system';

const STATUS_TONES: Record<AdminStatus, BadgeTone> = {
  ACTIVE: 'success',
  SUSPENDED: 'danger',
};

const STATUS_LABELS: Record<AdminStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
};

export function AdminStatusBadge({ status, className }: { status: AdminStatus | string; className?: string }) {
  const tone = (STATUS_TONES as Record<string, BadgeTone>)[status] ?? 'neutral';
  const label = (STATUS_LABELS as Record<string, string>)[status] ?? status;

  return (
    <Badge tone={tone} className={className}>
      <span
        className={`w-1.5 h-1.5 rounded-full mr-1.5 inline-block ${
          status === 'ACTIVE'
            ? 'bg-emerald-500 animate-pulse'
            : 'bg-rose-500'
        }`}
      />
      {label}
    </Badge>
  );
}
