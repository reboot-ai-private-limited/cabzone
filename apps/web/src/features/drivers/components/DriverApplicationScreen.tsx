'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Car,
  Check,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  Star,
  User,
  Wallet,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  DefinitionList,
  ErrorState,
  FieldRow,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from '@cabzone/design-system';
import { REJECTION_TYPES, formatPublicRatingLabel, type RejectionType } from '@cabzone/contracts';
import {
  useDriverApplication,
  useReviewApplication,
} from '../hooks/useDriverApplications';
import { DocumentViewerCard } from './DocumentViewerCard';
import {
  DriverStatusBadge,
  REVIEWABLE,
  StatusBadge,
  VehicleStatusBadge,
} from './StatusBadge';

export interface DriverApplicationScreenProps {
  applicationId: string;
}

const formatDate = (iso: string | null): string =>
  iso === null ? '—' : new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });

const formatDateTime = (iso: string | null): string =>
  iso === null
    ? '—'
    : new Date(iso).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

export function DriverApplicationScreen({ applicationId }: DriverApplicationScreenProps) {
  const detail = useDriverApplication(applicationId);
  const d = detail.data;

  const [rejecting, setRejecting] = useState(false);
  const [rejectionType, setRejectionType] = useState<RejectionType>('FIXABLE');
  const [rejectionReason, setRejectionReason] = useState('');
  const [decisionError, setDecisionError] = useState<string | undefined>(undefined);

  const review = useReviewApplication(() => {
    void detail.refetch();
    setRejecting(false);
  });

  const fail = (e: unknown): void =>
    setDecisionError(e instanceof Error ? e.message : 'Could not save the review decision.');

  if (detail.isLoading) {
    return (
      <div className="flex flex-col gap-6 p-8 max-w-[1600px] mx-auto w-full">
        <Skeleton className="h-10 w-64 rounded-md" />
        <Skeleton className="h-28 w-full rounded-md" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-96 rounded-md" />
          <Skeleton className="h-96 rounded-md" />
        </div>
      </div>
    );
  }

  if (detail.isError || d === undefined) {
    return (
      <div className="flex flex-col gap-6 p-8 max-w-[1600px] mx-auto w-full">
        <Link href="/drivers" className="inline-flex items-center gap-1.5 text-xs text-text-subtle hover:text-text">
          <ArrowLeft className="size-4" />
          Back to Drivers Queue
        </Link>
        <ErrorState
          message={
            detail.error instanceof Error
              ? detail.error.message
              : 'Could not load this driver application.'
          }
          onRetry={() => void detail.refetch()}
        />
      </div>
    );
  }

  const isReviewable = REVIEWABLE.has(d.application.status);
  const canSubmitRejection = rejectionReason.trim().length >= 5;

  return (
    <div className="flex flex-col gap-6 p-8 max-w-[1600px] mx-auto w-full">
      {/* Top Header & Breadcrumbs */}
      <PageHeader
        title={`KYC Application: ${d.phoneE164 ?? 'Applicant'}`}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Drivers & KYC', href: '/drivers' },
          { label: `Application ${d.application.id.slice(0, 8)}…` },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/drivers">
              <Button variant="secondary" icon={<ArrowLeft className="size-4" />}>
                Back to Queue
              </Button>
            </Link>
            <Button
              icon={<RefreshCw className={`size-4 ${detail.isFetching ? 'animate-spin' : ''}`} />}
              loading={detail.isFetching}
              onClick={() => void detail.refetch()}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* Overview Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-surface border border-border shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="size-11 rounded-lg bg-surface-muted border border-border flex items-center justify-center shrink-0">
            <User className="size-6 text-interactive" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-base font-bold text-text">
                {d.phoneE164 ?? 'No phone record'}
              </span>
              <StatusBadge status={d.application.status} />
              {d.application.reapplyCount > 0 && (
                <Badge tone="warning">Reapplied #{d.application.reapplyCount}</Badge>
              )}
            </div>
            <span className="font-mono text-xs text-text-subtle">
              Driver UUID: {d.application.driverId}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col text-right text-xs">
            <span className="text-text-subtle">Submitted</span>
            <span className="font-medium text-text">{formatDateTime(d.application.submittedAt)}</span>
          </div>
          <span className="text-border" aria-hidden>
            |
          </span>
          <div className="flex items-center gap-2">
            <Link
              href={`/finance?driverId=${d.application.driverId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-muted border border-border text-xs font-medium text-interactive hover:bg-surface-muted/80 transition-colors"
              target="_blank"
              rel="noreferrer"
            >
              <Wallet aria-hidden className="size-3.5" />
              Wallet
              <ExternalLink aria-hidden className="size-3 text-text-subtle" />
            </Link>
            <Link
              href={`/rides?driverId=${d.application.driverId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-muted border border-border text-xs font-medium text-interactive hover:bg-surface-muted/80 transition-colors"
              target="_blank"
              rel="noreferrer"
            >
              <Car aria-hidden className="size-3.5" />
              Rides
              <ExternalLink aria-hidden className="size-3 text-text-subtle" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Grid: Left = Documents & Audit, Right = Decision & Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Verification Documents & Rejection History */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Prior Rejection Warning (if applicable) */}
          {d.application.rejectionReason !== null && (
            <div className="p-4 rounded-xl border border-danger/40 bg-danger/5 flex items-start gap-3.5">
              <ShieldAlert className="size-6 text-danger shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-danger">
                  Application Rejection Record ({d.application.rejectionType})
                </span>
                <p className="text-text text-xs leading-relaxed">{d.application.rejectionReason}</p>
                {d.application.reviewedAt && (
                  <span className="text-[11px] text-text-subtle mt-1">
                    Recorded on {formatDateTime(d.application.reviewedAt)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Verification Documents Workspace */}
          <div className="flex flex-col gap-4 p-5 rounded-xl border border-border bg-surface shadow-xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-semibold text-text">
                  Compliance Documents ({d.documents.length})
                </h3>
                <p className="text-xs text-text-subtle mt-0.5">
                  Inspect official government IDs and driving licenses for expiry and authenticity.
                </p>
              </div>
              <span className="text-xs font-mono text-text-subtle">
                {d.documents.length === 0 ? '0 uploaded' : `${d.documents.length} verified/pending`}
              </span>
            </div>

            {d.documents.length === 0 ? (
              <div className="py-12 px-6 rounded-lg border border-dashed border-border text-center text-text-subtle">
                <p className="text-sm font-medium">No documents uploaded</p>
                <p className="text-xs mt-1">The driver has not yet submitted ID or license files.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {d.documents.map((doc) => (
                  <DocumentViewerCard
                    key={doc.id}
                    document={doc}
                    driverPhone={d.phoneE164}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Decision Actions, Vehicle & Driver Profiles */}
        <div className="flex flex-col gap-6 sticky top-6">
          {/* Decision Workflow Box */}
          <div className="p-5 rounded-xl border border-border bg-surface shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-subtle">
                Compliance Decision
              </span>
              <StatusBadge status={d.application.status} />
            </div>

            {decisionError !== undefined && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger font-medium">
                {decisionError}
              </div>
            )}

            {isReviewable ? (
              !rejecting ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-text-subtle leading-relaxed">
                    Approving verifies driver credentials, activates the vehicle registration, and qualifies the driver for dispatch.
                  </p>

                  <div className="flex flex-col gap-2 pt-1">
                    <Button
                      variant="primary"
                      size="md"
                      icon={<Check className="size-4" />}
                      loading={review.isPending}
                      className="w-full justify-center"
                      onClick={() => {
                        setDecisionError(undefined);
                        review.mutate(
                          { id: d.application.id, body: { status: 'APPROVED' } },
                          { onError: fail },
                        );
                      }}
                    >
                      Approve Driver
                    </Button>

                    <Button
                      variant="secondary"
                      size="md"
                      icon={<X className="size-4 text-danger" />}
                      className="w-full justify-center"
                      onClick={() => setRejecting(true)}
                    >
                      Reject Application
                    </Button>
                  </div>
                </div>
              ) : (
                <form
                  className="flex flex-col gap-3 bg-danger/5 p-4 rounded-lg border border-danger/30"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!canSubmitRejection) return;
                    setDecisionError(undefined);
                    review.mutate(
                      {
                        id: d.application.id,
                        body: {
                          status: 'REJECTED',
                          rejectionType,
                          rejectionReason: rejectionReason.trim(),
                        },
                      },
                      { onError: fail },
                    );
                  }}
                >
                  <div className="flex items-center gap-2 text-danger font-semibold text-xs uppercase tracking-wider">
                    <ShieldAlert className="size-4" />
                    Reject Application
                  </div>

                  <div className="flex flex-col gap-1 text-xs font-semibold text-text">
                    Rejection Severity
                    <Select
                      value={rejectionType}
                      onValueChange={(v) => setRejectionType(v as RejectionType)}
                      options={REJECTION_TYPES.map((t) => ({
                        value: t,
                        label:
                          t === 'FIXABLE'
                            ? 'Fixable — Driver can correct & reapply'
                            : 'Hard Fraud — Permanent account block',
                      }))}
                    />
                  </div>

                  <div className="flex flex-col gap-1 text-xs font-semibold text-text">
                    Reason Description (Shown to driver)
                    <Input
                      value={rejectionReason}
                      maxLength={255}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="e.g. Driving licence photo is blurry; please submit clear photo"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-text-subtle">
                    <span>Min. 5 characters ({rejectionReason.trim().length}/255)</span>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-danger/20">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setRejecting(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      loading={review.isPending}
                      disabled={!canSubmitRejection}
                    >
                      Confirm Rejection
                    </Button>
                  </div>
                </form>
              )
            ) : (
              <div className="p-3 rounded-lg bg-surface-muted border border-border text-center text-xs text-text-subtle">
                This application was finalized as{' '}
                <strong className="text-text font-semibold">{d.application.status}</strong> on{' '}
                {formatDate(d.application.reviewedAt ?? d.application.createdAt)}.
              </div>
            )}
          </div>

          {/* Vehicle Assignment Card */}
          <div className="p-5 rounded-xl border border-border bg-surface shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-subtle flex items-center gap-1.5">
                <Car className="size-4 text-interactive" />
                Vehicle Assignment
              </span>
              {d.vehicle && <VehicleStatusBadge status={d.vehicle.verificationStatus} />}
            </div>

            {d.vehicle === null ? (
              <div className="py-4 text-center text-xs text-text-subtle">
                No vehicle registered for this application.
              </div>
            ) : (
              <DefinitionList>
                <FieldRow label="Category">
                  <Badge tone="info">{d.vehicle.vehicleType}</Badge>
                </FieldRow>
                <FieldRow label="Make & Model">
                  <span className="font-semibold text-text text-sm">
                    {d.vehicle.make} {d.vehicle.model}
                  </span>
                </FieldRow>
                <FieldRow label="Registration Plate">
                  <span className="font-mono font-bold text-xs text-text px-2 py-0.5 rounded bg-surface-muted border border-border">
                    {d.vehicle.registrationNumber}
                  </span>
                </FieldRow>
              </DefinitionList>
            )}
          </div>

          {/* Applicant Metadata Card */}
          <div className="p-5 rounded-xl border border-border bg-surface shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-subtle flex items-center gap-1.5">
                <User className="size-4 text-interactive" />
                Applicant Profile
              </span>
              <DriverStatusBadge status={d.driver?.status ?? 'ACTIVE'} />
            </div>

            <DefinitionList>
              <FieldRow label="Phone Number">
                <span className="font-mono font-semibold text-text text-sm">{d.phoneE164 ?? '—'}</span>
              </FieldRow>
              <FieldRow label="Driver UUID">
                <span className="font-mono text-xs text-text-subtle truncate max-w-[150px]" title={d.application.driverId}>
                  {d.application.driverId}
                </span>
              </FieldRow>
              <FieldRow label="KYC State">
                <span className="text-xs font-medium text-text">{d.driver?.kycStatus ?? 'PENDING'}</span>
              </FieldRow>
              <FieldRow label="Performance">
                <div className="flex items-center gap-1 text-xs">
                  <Star className="size-3.5 fill-amber-500 text-amber-500" />
                  <span className="font-semibold text-text">
                    {formatPublicRatingLabel(d.driver?.ratingAverage, d.driver?.ratingCount)}
                  </span>
                  <span className="text-text-subtle">
                    ({d.driver?.ratingCount ?? 0} rides)
                  </span>
                </div>
              </FieldRow>
            </DefinitionList>
          </div>
        </div>
      </div>
    </div>
  );
}
