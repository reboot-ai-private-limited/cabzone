'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Car,
  Check,
  CheckCircle2,
  Copy,
  Edit2,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  PhoneCall,
  Shield,
  ShieldCheck,
  Star,
  User,
  UserCheck,
  UserX,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  Skeleton,
  StatTile,
} from '@cabzone/design-system';
import { RideStatusBadge } from '@/features/rides/components/RideStatusBadge';
import {
  MIN_PUBLIC_RATING_COUNT,
  type AdminRiderSummaryDto,
} from '@cabzone/contracts';
import { useRiderDetail, useRiderRides } from '../hooks/useRiders';
import { RiderStatusBadge } from './RiderStatusBadge';
import { RiderEditDialog } from './RiderEditDialog';
import { RiderStatusDialog } from './RiderStatusDialog';
import { TrustScoreBadge } from '../../identity/components/TrustScoreBadge';

interface RiderDetailModalProps {
  riderId: string | null;
  initialRider?: AdminRiderSummaryDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh?: () => void;
}

export function RiderDetailModal({
  riderId,
  initialRider,
  open,
  onOpenChange,
  onRefresh,
}: RiderDetailModalProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);

  const detailQuery = useRiderDetail(open ? riderId : null);
  const ridesQuery = useRiderRides(open ? riderId : null);

  const fallbackDetail = initialRider
    ? {
        ...initialRider,
        cancelledRides: Math.max(0, initialRider.totalRides - initialRider.completedRides),
        totalSpentPaise: null as number | null,
      }
    : null;

  const rider = detailQuery.data ?? fallbackDetail;
  const rides = ridesQuery.data ?? [];

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const formatPaise = (paise: number) => {
    return `₹${(paise / 100).toLocaleString('en-IN')}`;
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Customer Profile & Trip Dossier"
        className="max-w-4xl"
        footer={
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              {rider && (
                <Button
                  size="sm"
                  variant={rider.status === 'SUSPENDED' ? 'primary' : 'danger'}
                  onClick={() => setIsStatusOpen(true)}
                >
                  {rider.status === 'SUSPENDED' ? (
                    <>
                      <UserCheck className="size-4 mr-1.5" />
                      Reactivate Customer
                    </>
                  ) : (
                    <>
                      <UserX className="size-4 mr-1.5" />
                      Suspend Customer
                    </>
                  )}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsEditOpen(true)}
                disabled={!rider}
              >
                <Edit2 className="size-3.5 mr-1.5" />
                Edit Profile
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        }
      >
        {detailQuery.isLoading && !fallbackDetail ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-20 w-full rounded-lg" />
            <div className="grid grid-cols-4 gap-3">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        ) : !rider ? (
          <div className="py-12 text-center text-text-subtle">Customer profile not found.</div>
        ) : (
          <div className="flex flex-col gap-5 py-1">
            {/* Header Profile Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-surface-muted border border-border">
              <div className="flex items-center gap-3.5">
                <div className="size-12 rounded-full bg-surface border border-border flex items-center justify-center shrink-0 font-semibold text-text text-base shadow-sm">
                  {rider.name ? rider.name.slice(0, 2).toUpperCase() : <User className="size-6 text-interactive" />}
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-text">
                      {rider.name || 'Unnamed Customer'}
                    </span>
                    <RiderStatusBadge status={rider.status} />
                    <TrustScoreBadge
                      score={rider.trustScore}
                      tier={rider.trustScoreBreakdown?.tier}
                      breakdown={rider.trustScoreBreakdown}
                      size="sm"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-subtle mt-0.5">
                    <span className="font-mono font-medium text-text flex items-center gap-1">
                      <Phone className="size-3 text-text-subtle" />
                      {rider.phoneE164}
                    </span>
                    {rider.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="size-3 text-text-subtle" />
                        {rider.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:items-end gap-1.5 self-start sm:self-center">
                <button
                  type="button"
                  onClick={() => handleCopyId(rider.id)}
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] text-text-subtle hover:text-text px-2 py-1 rounded bg-surface border border-border transition-colors"
                  title="Click to copy Rider ID"
                >
                  {copiedId ? (
                    <>
                      <Check className="size-3 text-emerald-500" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3 text-text-subtle" />
                      <span>ID: {rider.id.slice(0, 8)}…</span>
                    </>
                  )}
                </button>
                <span className="text-[11px] text-text-subtle flex items-center gap-1">
                  <Calendar className="size-3" />
                  Joined {formatDate(rider.createdAt)}
                </span>
              </div>
            </div>

            {/* Platform Metrics KPI Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <StatTile
                label="Total Bookings"
                value={String(rider.totalRides)}
                icon={<Car className="size-4 text-interactive" />}
                hint={`${rider.completedRides} completed`}
                tone="default"
              />
              <StatTile
                label="Completed Trips"
                value={String(rider.completedRides)}
                icon={<CheckCircle2 className="size-4 text-success" />}
                hint={
                  rider.totalRides > 0
                    ? `${Math.round((rider.completedRides / rider.totalRides) * 100)}% completion`
                    : 'No bookings'
                }
                tone="success"
              />
              <StatTile
                label="Cancelled Trips"
                value={String(rider.cancelledRides)}
                icon={<XCircle className="size-4 text-danger" />}
                hint={rider.cancelledRides > 0 ? 'By rider or driver' : 'Zero cancellations'}
                tone={rider.cancelledRides > 0 ? 'danger' : 'default'}
              />
              <StatTile
                label="Star Rating"
                value={
                  rider.ratingCount >= MIN_PUBLIC_RATING_COUNT && rider.ratingAverage !== null
                    ? `${rider.ratingAverage.toFixed(1)} ★`
                    : 'New'
                }
                icon={<Star className="size-4 text-amber-500 fill-amber-400" />}
                hint={
                  rider.ratingCount > 0 ? `From ${rider.ratingCount} reviews` : 'No ratings yet'
                }
                tone="warning"
              />
              <StatTile
                label="Trust Score"
                value={
                  rider.trustScore !== null && rider.trustScore !== undefined
                    ? `${rider.trustScore}/100`
                    : 'Unrated'
                }
                icon={<ShieldCheck className="size-4 text-emerald-600" />}
                hint={
                  rider.trustScoreBreakdown?.summary ??
                  (rider.trustScore !== null ? 'Verified behavioural reliability' : 'Needs 5+ rides')
                }
                tone={
                  (rider.trustScore ?? 0) >= 80
                    ? 'success'
                    : (rider.trustScore ?? 0) >= 60
                      ? 'warning'
                      : 'default'
                }
              />
            </div>

            {/* Safety & Preferences Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Emergency Contact */}
              <div className="p-3.5 rounded-lg border border-border bg-surface flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text flex items-center gap-1.5">
                    <Shield className="size-3.5 text-interactive" />
                    Emergency Contact (Safety)
                  </span>
                  {rider.emergencyContact ? (
                    <Badge tone="success" className="text-[10px]">Configured</Badge>
                  ) : (
                    <Badge tone="warning" className="text-[10px]">Missing</Badge>
                  )}
                </div>
                {rider.emergencyContact ? (
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-text">
                        {rider.emergencyContact.name}
                      </span>
                      <span className="font-mono text-xs text-text-subtle">
                        {rider.emergencyContact.phoneE164}
                      </span>
                    </div>
                    <a
                      href={`tel:${rider.emergencyContact.phoneE164}`}
                      className="size-8 rounded-full bg-surface-muted hover:bg-border flex items-center justify-center text-text transition-colors"
                      title="Call Emergency Contact"
                    >
                      <PhoneCall className="size-4 text-emerald-600" />
                    </a>
                  </div>
                ) : (
                  <span className="text-xs text-text-subtle italic mt-1">
                    No emergency contact specified by customer yet.
                  </span>
                )}
              </div>

              {/* Account Volume & Platform Spend */}
              <div className="p-3.5 rounded-lg border border-border bg-surface flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text flex items-center gap-1.5">
                    <Wallet className="size-3.5 text-interactive" />
                    Account Spend & Volume
                  </span>
                  <Badge tone="neutral" className="text-[10px]">
                    {rider.completedRides} Completed
                  </Badge>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div className="flex flex-col">
                    <span className="text-xs text-text-subtle">Lifetime Platform Spend</span>
                    <span className="text-sm font-bold font-mono text-text">
                      {detailQuery.isPending && rider.totalSpentPaise === null ? <Skeleton className="h-5 w-20" /> : rider.totalSpentPaise === null ? '—' : formatPaise(rider.totalSpentPaise)}
                    </span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-xs text-text-subtle">Total Bookings</span>
                    <span className="text-xs font-medium text-text">
                      {rider.totalRides} {rider.totalRides === 1 ? 'ride' : 'rides'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Ride History Section */}
            <div className="flex flex-col gap-3 mt-1">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <Car className="size-4 text-interactive" />
                  <span className="text-sm font-semibold text-text">Trip History</span>
                  <Badge tone="neutral" className="text-[11px] ml-1">
                    {rides.length}
                  </Badge>
                </div>
                <Link
                  href={`/rides`}
                  className="text-xs text-interactive hover:underline inline-flex items-center gap-1"
                >
                  <span>Operations Monitor</span>
                  <ExternalLink className="size-3" />
                </Link>
              </div>

              {ridesQuery.isLoading ? (
                <div className="space-y-2 py-2">
                  <Skeleton className="h-16 w-full rounded" />
                  <Skeleton className="h-16 w-full rounded" />
                </div>
              ) : rides.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-subtle border border-dashed border-border rounded-lg">
                  No trips recorded for this customer yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                  {rides.map((ride) => (
                    <div
                      key={ride.id}
                      className="p-3 rounded-lg border border-border bg-surface hover:bg-surface-muted/50 transition-colors flex flex-col gap-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <RideStatusBadge status={ride.status} />
                          <Badge tone="neutral" className="text-[10px]">
                            {ride.vehicleCategory}
                          </Badge>
                          <span className="font-mono text-[11px] text-text-subtle font-semibold">
                            {formatPaise(ride.agreedFarePaise ?? ride.suggestedFarePaise)}
                          </span>
                        </div>
                        <span className="text-[11px] text-text-subtle">
                          {formatDate(ride.createdAt)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-text-subtle pt-1 border-t border-border/50">
                        <div className="flex items-start gap-1.5 truncate">
                          <MapPin className="size-3 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="truncate text-text font-medium" title={ride.pickup.address ?? ''}>
                            {ride.pickup.address || `${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}`}
                          </span>
                        </div>
                        <div className="flex items-start gap-1.5 truncate">
                          <MapPin className="size-3 text-rose-500 shrink-0 mt-0.5" />
                          <span className="truncate text-text font-medium" title={ride.drop.address ?? ''}>
                            {ride.drop.address || `${ride.drop.lat.toFixed(4)}, ${ride.drop.lng.toFixed(4)}`}
                          </span>
                        </div>
                      </div>

                      {ride.routeSnapshot && (
                        <div className="flex items-center gap-3 text-[11px] text-text-subtle pt-1">
                          <span>
                            Distance: {(ride.routeSnapshot.distanceM / 1000).toFixed(1)} km
                          </span>
                          <span>•</span>
                          <span>
                            Duration: {Math.round(ride.routeSnapshot.durationSeconds / 60)} mins
                          </span>
                          {ride.driverId && (
                            <>
                              <span>•</span>
                              <span>Driver assigned</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>

      {/* Profile Edit Dialog */}
      <RiderEditDialog
        rider={rider ?? null}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSuccess={() => {
          detailQuery.refetch();
          onRefresh?.();
        }}
      />

      {/* Account Status Confirmation Dialog */}
      <RiderStatusDialog
        rider={rider ?? null}
        open={isStatusOpen}
        onOpenChange={setIsStatusOpen}
        onSuccess={() => {
          detailQuery.refetch();
          onRefresh?.();
        }}
      />
    </>
  );
}
