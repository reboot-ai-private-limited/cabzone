'use client';

import Link from 'next/link';
import {
  Car,
  CreditCard,
  ExternalLink,
  ShieldCheck,
  Star,
  User,
} from 'lucide-react';
import {
  Badge,
  Button,
  DefinitionList,
  Dialog,
  FieldRow,
} from '@cabzone/design-system';
import type { DriverApplicationSummaryDto } from '@/lib/api/endpoints/drivers';
import { DriverStatusBadge, OperationalStatusBadge, VehicleStatusBadge } from './StatusBadge';
import { TrustScoreBadge } from '../../identity/components/TrustScoreBadge';

export interface DriverDetailModalProps {
  driverSummary: DriverApplicationSummaryDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatDate = (iso: string | null): string =>
  iso === null ? '—' : new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });

export function DriverDetailModal({
  driverSummary,
  open,
  onOpenChange,
}: DriverDetailModalProps) {
  if (!driverSummary) return null;

  const { driver, application, vehicle, phoneE164 } = driverSummary;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={phoneE164 ?? 'Driver Profile'}
      description="Operational fleet profile and driver dispatch record"
      className="max-w-xl"
    >
      <div className="flex flex-col gap-5">
        {/* Status and Rating Summary Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-surface-muted border border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text-subtle uppercase tracking-wider">
              Account:
            </span>
            <DriverStatusBadge status={driver?.status ?? 'ACTIVE'} />
            <OperationalStatusBadge status="ONLINE" />
          </div>

          <div className="flex items-center gap-3">
            <TrustScoreBadge score={driver?.trustScore} size="sm" />
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-500">
              <Star className="size-4 fill-amber-500 text-amber-500" />
              <span className="text-text font-semibold">
                {driver?.ratingAverage ? driver.ratingAverage.toFixed(2) : '5.0'}
              </span>
              <span className="text-text-subtle">
                ({driver?.ratingCount ?? 0} {driver?.ratingCount === 1 ? 'ride' : 'rides'})
              </span>
            </div>
          </div>
        </div>

        {/* Identity & Account Card */}
        <div className="p-4 rounded-lg border border-border bg-surface flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-text uppercase tracking-wider border-b border-border pb-2">
            <User className="size-4 text-interactive" />
            Driver Details
          </div>

          <DefinitionList>
            <FieldRow label="Registered Phone">
              <span className="font-mono font-medium text-text">{phoneE164 ?? '—'}</span>
            </FieldRow>
            <FieldRow label="Driver UUID">
              <span className="font-mono text-xs text-text-subtle truncate max-w-[200px]" title={application.driverId}>
                {application.driverId}
              </span>
            </FieldRow>
            <FieldRow label="KYC Status">
              <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
                <ShieldCheck className="size-3.5" />
                VERIFIED
              </span>
            </FieldRow>
            <FieldRow label="Approved On">
              <span className="text-xs text-text">{formatDate(application.reviewedAt ?? application.createdAt)}</span>
            </FieldRow>
          </DefinitionList>
        </div>

        {/* Assigned Vehicle */}
        <div className="p-4 rounded-lg border border-border bg-surface flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-text uppercase tracking-wider border-b border-border pb-2">
            <Car className="size-4 text-interactive" />
            Assigned Vehicle
          </div>

          {vehicle === null ? (
            <p className="text-xs text-text-subtle py-2">No vehicle assigned to this driver profile.</p>
          ) : (
            <DefinitionList>
              <FieldRow label="Category">
                <Badge tone="info">{vehicle.vehicleType}</Badge>
              </FieldRow>
              <FieldRow label="Make & Model">
                <span className="font-medium text-text">
                  {vehicle.make} {vehicle.model}
                </span>
              </FieldRow>
              <FieldRow label="Registration Plate">
                <span className="font-mono font-semibold text-xs text-text px-2 py-0.5 rounded bg-surface-muted border border-border">
                  {vehicle.registrationNumber}
                </span>
              </FieldRow>
              <FieldRow label="Vehicle KYC">
                <VehicleStatusBadge status={vehicle.verificationStatus} />
              </FieldRow>
            </DefinitionList>
          )}
        </div>

        {/* Operational Shortcuts */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <Link href={`/drivers/${application.id}?tab=financials`}>
              <Button size="sm" icon={<CreditCard className="size-3.5" />}>
                Balance & Financials
              </Button>
            </Link>
            <Link href={`/rides?driverId=${application.driverId}`}>
              <Button size="sm" icon={<Car className="size-3.5" />}>
                Ride History
              </Button>
            </Link>
          </div>

          <Link href={`/drivers/applications/${application.id}`}>
            <Button
              size="sm"
              variant="secondary"
              icon={<ExternalLink className="size-3.5 text-interactive" />}
            >
              View Application KYC
            </Button>
          </Link>
        </div>
      </div>
    </Dialog>
  );
}
