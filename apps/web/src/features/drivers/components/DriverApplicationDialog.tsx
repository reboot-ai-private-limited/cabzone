'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Car,
  Check,
  ExternalLink,
  ShieldAlert,
  User,
  Wallet,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  DefinitionList,
  Dialog,
  FieldRow,
  Input,
  Select,
  Skeleton,
} from '@cabzone/design-system';
import { REJECTION_TYPES, type RejectionType } from '@cabzone/contracts';
import { useDriverApplication, useReviewApplication } from '../hooks/useDriverApplications';
import { KycStatusBadge, REVIEWABLE, StatusBadge, VehicleStatusBadge } from './StatusBadge';
import { DocumentViewerCard } from './DocumentViewerCard';

export interface DriverApplicationDialogProps {
  applicationId: string | null;
  onOpenChange: (open: boolean) => void;
}

const formatDateTime = (iso: string | null): string =>
  iso === null
    ? '—'
    : new Date(iso).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

export function DriverApplicationDialog({
  applicationId,
  onOpenChange,
}: DriverApplicationDialogProps) {
  const detail = useDriverApplication(applicationId);
  const d = detail.data;

  return (
    <Dialog
      open={applicationId !== null}
      onOpenChange={onOpenChange}
      title={d?.phoneE164 ? `Driver: ${d.phoneE164}` : 'Driver Application'}
      description="Verify applicant identity, vehicle registration, and compliance documents."
      className="max-w-3xl"
    >
      {detail.isLoading || d === undefined ? (
        detail.isError ? (
          <div className="p-6 text-center">
            <p className="text-sm font-medium text-danger">Could not load this application.</p>
            <p className="text-xs text-text-subtle mt-1">Please try again or check network connectivity.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-4">
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-40 w-full rounded-md" />
            <Skeleton className="h-32 w-full rounded-md" />
          </div>
        )
      ) : (
        <div className="flex flex-col gap-6">
          {/* Quick Shortcuts & Navigation Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-surface-muted border border-border">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-text-subtle uppercase tracking-wider">
                Current Status:
              </span>
              <StatusBadge status={d.application.status} />
              {d.driver && <KycStatusBadge status={d.driver.kycStatus} />}
              {d.application.reapplyCount > 0 && (
                <Badge tone="warning">Reapplied ({d.application.reapplyCount})</Badge>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Link
                href={`/finance?driverId=${d.application.driverId}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-interactive hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                <Wallet aria-hidden className="size-3.5" />
                Driver Wallet
                <ExternalLink aria-hidden className="size-3 text-text-subtle" />
              </Link>
              <span className="text-border" aria-hidden>
                |
              </span>
              <Link
                href={`/rides?driverId=${d.application.driverId}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-interactive hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                <Car aria-hidden className="size-3.5" />
                Ride History
                <ExternalLink aria-hidden className="size-3 text-text-subtle" />
              </Link>
            </div>
          </div>

          {/* Section: Applicant & Vehicle Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Applicant Summary */}
            <div className="p-4 rounded-lg border border-border bg-surface flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-text uppercase tracking-wider border-b border-border pb-2">
                <User className="size-4 text-interactive" />
                Applicant Details
              </div>
              <DefinitionList>
                <FieldRow label="Phone Number">
                  <span className="font-mono font-medium text-text">{d.phoneE164 ?? '—'}</span>
                </FieldRow>
                <FieldRow label="Driver UUID">
                  <span className="font-mono text-xs text-text-subtle truncate max-w-[170px]" title={d.application.driverId}>
                    {d.application.driverId}
                  </span>
                </FieldRow>
                <FieldRow label="Submitted At">
                  <span className="text-xs text-text">{formatDateTime(d.application.submittedAt)}</span>
                </FieldRow>
                {d.application.reviewedAt && (
                  <FieldRow label="Reviewed At">
                    <span className="text-xs text-text">{formatDateTime(d.application.reviewedAt)}</span>
                  </FieldRow>
                )}
                {d.driver && (
                  <FieldRow label="Driver Rating">
                    <span className="text-xs font-medium text-text">
                      {d.driver.ratingAverage ? `★ ${d.driver.ratingAverage.toFixed(2)}` : 'Unrated'}
                      <span className="text-text-subtle ml-1">({d.driver.ratingCount} trips)</span>
                    </span>
                  </FieldRow>
                )}
              </DefinitionList>
            </div>

            {/* Vehicle Summary */}
            <div className="p-4 rounded-lg border border-border bg-surface flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-text uppercase tracking-wider border-b border-border pb-2">
                <Car className="size-4 text-interactive" />
                Vehicle Assignment
              </div>
              {d.vehicle === null ? (
                <div className="flex flex-col items-center justify-center py-6 text-center text-text-subtle">
                  <Car className="size-8 text-zinc-400 mb-1" />
                  <span className="text-sm font-medium">No vehicle registered</span>
                  <span className="text-xs">Driver has not added vehicle specs yet.</span>
                </div>
              ) : (
                <DefinitionList>
                  <FieldRow label="Category">
                    <Badge tone="info">{d.vehicle.vehicleType}</Badge>
                  </FieldRow>
                  <FieldRow label="Make & Model">
                    <span className="font-medium text-text">
                      {d.vehicle.make} {d.vehicle.model}
                    </span>
                  </FieldRow>
                  <FieldRow label="Registration Plate">
                    <span className="font-mono font-semibold text-xs text-text px-2 py-0.5 rounded bg-surface-muted border border-border">
                      {d.vehicle.registrationNumber}
                    </span>
                  </FieldRow>
                  <FieldRow label="Vehicle KYC">
                    <VehicleStatusBadge status={d.vehicle.verificationStatus} />
                  </FieldRow>
                </DefinitionList>
              )}
            </div>
          </div>

          {/* Section: Rejection History (if applicable) */}
          {d.application.rejectionReason !== null && (
            <div className="p-3.5 rounded-lg border border-danger/40 bg-danger/5 flex items-start gap-3">
              <ShieldAlert className="size-5 text-danger shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-danger">
                    Prior Rejection ({d.application.rejectionType})
                  </span>
                </div>
                <p className="text-text">{d.application.rejectionReason}</p>
              </div>
            </div>
          )}

          {/* Section: Uploaded Compliance Documents */}
          <section aria-label="Documents" className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-subtle">
                Verification Documents ({d.documents.length})
              </h3>
              <span className="text-xs text-text-subtle">
                Click preview on any document to inspect certificate details
              </span>
            </div>

            {d.documents.length === 0 ? (
              <div className="p-6 rounded-lg border border-dashed border-border text-center text-text-subtle text-sm">
                No documents uploaded for this application.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {d.documents.map((doc) => (
                  <DocumentViewerCard
                    key={doc.id}
                    applicationId={d.application.id}
                    document={doc}
                    driverPhone={d.phoneE164}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Decision Workflow Form */}
          {REVIEWABLE.has(d.application.status) ? (
            <ReviewDecisionForm
              key={d.application.id}
              applicationId={d.application.id}
              onDone={() => onOpenChange(false)}
            />
          ) : (
            <div className="p-3 rounded-md bg-surface-muted border border-border text-center text-xs text-text-subtle">
              Application has already been decided as{' '}
              <strong className="text-text font-semibold">{d.application.status}</strong>.
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function ReviewDecisionForm({
  applicationId,
  onDone,
}: {
  applicationId: string;
  onDone: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [type, setType] = useState<RejectionType>('FIXABLE');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const review = useReviewApplication(onDone);

  const fail = (e: unknown): void =>
    setError(e instanceof Error ? e.message : 'Could not save the review decision.');

  if (!rejecting) {
    return (
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {error !== undefined && (
          <p role="alert" className="text-sm text-danger font-medium">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-subtle">
            Approving grants full online dispatch permissions and verifies vehicle registration.
          </p>
          <div className="flex items-center gap-2">
            <Button
              icon={<X aria-hidden className="size-4 text-danger" />}
              onClick={() => setRejecting(true)}
            >
              Reject Application
            </Button>
            <Button
              variant="primary"
              icon={<Check aria-hidden className="size-4" />}
              loading={review.isPending}
              onClick={() => {
                setError(undefined);
                review.mutate({ id: applicationId, body: { status: 'APPROVED' } }, { onError: fail });
              }}
            >
              Approve Driver
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const canSubmit = reason.trim().length >= 5;
  return (
    <form
      className="flex flex-col gap-3 border-t border-border pt-4 bg-danger/5 p-4 rounded-lg border border-danger/30"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setError(undefined);
        review.mutate(
          {
            id: applicationId,
            body: { status: 'REJECTED', rejectionType: type, rejectionReason: reason.trim() },
          },
          { onError: fail },
        );
      }}
    >
      <div className="flex items-center gap-2 text-danger font-semibold text-xs uppercase tracking-wider">
        <ShieldAlert className="size-4" />
        Reject Driver KYC Application
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 text-xs font-semibold text-text">
          Rejection Severity
          <Select
            value={type}
            onValueChange={(v) => setType(v as RejectionType)}
            options={REJECTION_TYPES.map((t) => ({
              value: t,
              label: t === 'FIXABLE' ? 'Fixable — Driver can correct and reapply' : 'Hard Fraud — Permanent account block',
            }))}
          />
        </div>

        <div className="flex flex-col gap-1 text-xs font-semibold text-text">
          Reason Description (Visible to driver)
          <Input
            value={reason}
            maxLength={255}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Driving licence photo unreadable; please re-upload clear front photo"
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-text-subtle pt-1">
        <span>Min. 5 characters required ({reason.trim().length}/255)</span>
        {error !== undefined && (
          <p role="alert" className="text-xs text-danger font-medium">
            {error}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" onClick={() => setRejecting(false)}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={review.isPending}
          disabled={!canSubmit}
        >
          Confirm Rejection
        </Button>
      </div>
    </form>
  );
}
