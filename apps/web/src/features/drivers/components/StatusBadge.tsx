import type {
  DocumentVerificationStatus,
  DriverApplicationStatus,
  DriverKycStatus,
  DriverOperationalStatus,
  DriverStatus,
  VehicleVerificationStatus,
} from '@cabzone/contracts';
import { Badge, type BadgeTone } from '@cabzone/design-system';

const DAY_MS = 24 * 60 * 60 * 1000;
export const KYC_WARNING_DAYS = 30;
export const KYC_URGENT_DAYS = 7;

const APPLICATION_TONES: Record<DriverApplicationStatus, BadgeTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  UNDER_REVIEW_AUTO: 'info',
  UNDER_REVIEW_ADMIN: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  REAPPLIED: 'warning',
};

const APPLICATION_LABELS: Record<DriverApplicationStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW_AUTO: 'Auto Review',
  UNDER_REVIEW_ADMIN: 'Needs Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REAPPLIED: 'Reapplied',
};

/** Applications an admin can still decide on. */
export const REVIEWABLE: ReadonlySet<DriverApplicationStatus> = new Set([
  'SUBMITTED',
  'UNDER_REVIEW_AUTO',
  'UNDER_REVIEW_ADMIN',
  'REAPPLIED',
]);

export function isReviewable(status: DriverApplicationStatus): boolean {
  return REVIEWABLE.has(status);
}

export function StatusBadge({ status }: { status: DriverApplicationStatus }) {
  return (
    <Badge tone={APPLICATION_TONES[status] ?? 'neutral'}>
      {APPLICATION_LABELS[status] ?? status.replaceAll('_', ' ')}
    </Badge>
  );
}

const DRIVER_STATUS_TONES: Record<DriverStatus, BadgeTone> = {
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  PENDING: 'warning',
  REJECTED: 'danger',
};

export function DriverStatusBadge({ status }: { status: DriverStatus | string }) {
  const tone = (DRIVER_STATUS_TONES as Record<string, BadgeTone>)[status] ?? 'neutral';
  return <Badge tone={tone}>{status}</Badge>;
}

const DRIVER_KYC_TONES: Record<DriverKycStatus, BadgeTone> = {
  VERIFIED: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
  EXPIRED: 'danger',
};

const DRIVER_KYC_LABELS: Record<DriverKycStatus, string> = {
  VERIFIED: 'KYC Verified',
  PENDING: 'KYC Pending',
  FAILED: 'KYC Failed',
  EXPIRED: 'KYC Expired',
};

export function KycStatusBadge({ status }: { status: DriverKycStatus | string | null | undefined }) {
  if (!status) return <Badge tone="neutral">Unknown</Badge>;
  const tone = (DRIVER_KYC_TONES as Record<string, BadgeTone>)[status] ?? 'neutral';
  const label = (DRIVER_KYC_LABELS as Record<string, string>)[status] ?? status;
  return <Badge tone={tone}>{label}</Badge>;
}

export interface DocumentExpiryBadgeState {
  label: string;
  tone: 'danger' | 'warning';
  daysRemaining: number;
}

export function computeDocumentExpiryBadge(
  expiresAt: string | null | undefined,
  verificationStatus?: DocumentVerificationStatus | string | null,
  nowMs: number = Date.now(),
): DocumentExpiryBadgeState | null {
  if (verificationStatus === 'EXPIRED') {
    const parsed = expiresAt ? Date.parse(expiresAt) : Number.NaN;
    const daysRemaining = Number.isNaN(parsed)
      ? 0
      : Math.min(0, Math.ceil((parsed - nowMs) / DAY_MS));
    return { label: 'Expired', tone: 'danger', daysRemaining };
  }
  if (!expiresAt) return null;
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) return null;

  const daysRemaining = Math.ceil((parsed - nowMs) / DAY_MS);
  if (daysRemaining <= 0) {
    return { label: 'Expired', tone: 'danger', daysRemaining };
  }
  if (daysRemaining <= KYC_URGENT_DAYS) {
    return { label: `Expires in ${daysRemaining}d`, tone: 'danger', daysRemaining };
  }
  if (daysRemaining <= KYC_WARNING_DAYS) {
    return { label: `Expiring (${daysRemaining}d)`, tone: 'warning', daysRemaining };
  }
  return null;
}

export function OperationalStatusBadge({
  status,
}: {
  status: DriverOperationalStatus | string | null | undefined;
}) {
  if (!status) return <span className="text-text-subtle text-xs">—</span>;

  let tone: BadgeTone = 'neutral';
  let dotClass = 'bg-text-subtle';
  let label = status;

  if (status === 'ONLINE') {
    tone = 'success';
    dotClass = 'bg-emerald-500 animate-pulse';
    label = 'Online';
  } else if (status === 'BUSY') {
    tone = 'warning';
    dotClass = 'bg-amber-500';
    label = 'On Ride';
  } else if (status === 'OFFLINE') {
    tone = 'neutral';
    dotClass = 'bg-zinc-400';
    label = 'Offline';
  }

  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-xs">
      <span className={`inline-block size-2 rounded-full ${dotClass}`} aria-hidden />
      <Badge tone={tone}>{label}</Badge>
    </span>
  );
}

const DOCUMENT_TONES: Record<DocumentVerificationStatus, BadgeTone> = {
  VERIFIED: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
  EXPIRED: 'danger',
};

export function DocumentStatusBadge({
  status,
}: {
  status: DocumentVerificationStatus | string;
}) {
  const tone = (DOCUMENT_TONES as Record<string, BadgeTone>)[status] ?? 'neutral';
  return <Badge tone={tone}>{status}</Badge>;
}

const VEHICLE_TONES: Record<VehicleVerificationStatus, BadgeTone> = {
  APPROVED: 'success',
  PENDING: 'warning',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
};

export function VehicleStatusBadge({
  status,
}: {
  status: VehicleVerificationStatus | string;
}) {
  const tone = (VEHICLE_TONES as Record<string, BadgeTone>)[status] ?? 'neutral';
  return <Badge tone={tone}>{status}</Badge>;
}
