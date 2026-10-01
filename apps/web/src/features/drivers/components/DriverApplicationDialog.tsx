'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Wallet, X } from 'lucide-react';
import {
  Badge,
  Button,
  DefinitionList,
  Dialog,
  FieldRow,
  Input,
  Select,
  Skeleton,
  type BadgeTone,
} from '@cabzone/design-system';
import { REJECTION_TYPES, type RejectionType } from '@cabzone/contracts';
import { useDriverApplication, useReviewApplication } from '../hooks/useDriverApplications';
import { REVIEWABLE, StatusBadge } from './StatusBadge';

const date = (iso: string | null): string =>
  iso === null ? '—' : new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });

const DOC_TONE: Record<string, BadgeTone> = {
  VERIFIED: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
  EXPIRED: 'danger',
};

export function DriverApplicationDialog({
  applicationId,
  onOpenChange,
}: {
  applicationId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useDriverApplication(applicationId);
  const d = detail.data;

  return (
    <Dialog
      open={applicationId !== null}
      onOpenChange={onOpenChange}
      title={d?.phoneE164 ?? 'Driver application'}
      description="Review the documents and vehicle, then approve or reject."
      className="max-w-2xl"
    >
      {detail.isLoading || d === undefined ? (
        detail.isError ? (
          <p className="text-sm text-danger">Could not load this application.</p>
        ) : (
          <Skeleton className="h-48 rounded-md" />
        )
      ) : (
        <div className="flex flex-col gap-5">
          <DefinitionList>
            <FieldRow label="Status">
              <StatusBadge status={d.application.status} />
            </FieldRow>
            <FieldRow label="Submitted">{date(d.application.submittedAt)}</FieldRow>
            <FieldRow label="Reapplications">{d.application.reapplyCount}</FieldRow>
            {d.application.rejectionReason !== null && (
              <FieldRow label="Rejection">
                {d.application.rejectionType} — {d.application.rejectionReason}
              </FieldRow>
            )}
            <FieldRow label="Vehicle">
              {d.vehicle === null ? (
                <span className="text-text-subtle">None registered</span>
              ) : (
                `${d.vehicle.make} ${d.vehicle.model} · ${d.vehicle.vehicleType}`
              )}
            </FieldRow>
            {d.vehicle !== null && (
              <FieldRow label="Registration">
                <span className="font-mono">{d.vehicle.registrationNumber}</span>
              </FieldRow>
            )}
          </DefinitionList>

          <section aria-label="Documents" className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-subtle">
              Documents
            </h3>
            {d.documents.length === 0 ? (
              <p className="text-sm text-text-subtle">No documents uploaded.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {d.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="flex flex-col">
                      <span className="font-medium text-text">{doc.type.replaceAll('_', ' ')}</span>
                      <span className="font-mono text-xs text-text-subtle">{doc.storageKey}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.expiresAt !== null && (
                        <span className="text-xs text-text-subtle">exp. {date(doc.expiresAt)}</span>
                      )}
                      <Badge tone={DOC_TONE[doc.verificationStatus] ?? 'neutral'}>
                        {doc.verificationStatus}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex items-center justify-between gap-3">
            <Link
              href={`/finance?driverId=${d.application.driverId}`}
              className="inline-flex items-center gap-1.5 text-sm text-interactive hover:underline"
            >
              <Wallet aria-hidden className="size-4" />
              View wallet
            </Link>
          </div>

          {REVIEWABLE.has(d.application.status) && (
            <ReviewForm
              key={d.application.id}
              applicationId={d.application.id}
              onDone={() => onOpenChange(false)}
            />
          )}
        </div>
      )}
    </Dialog>
  );
}

function ReviewForm({ applicationId, onDone }: { applicationId: string; onDone: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [type, setType] = useState<RejectionType>('FIXABLE');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const review = useReviewApplication(onDone);

  const fail = (e: unknown): void =>
    setError(e instanceof Error ? e.message : 'Could not save the review.');

  if (!rejecting) {
    return (
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        {error !== undefined && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button icon={<X aria-hidden className="size-4" />} onClick={() => setRejecting(true)}>
            Reject
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
            Approve
          </Button>
        </div>
      </div>
    );
  }

  const canSubmit = reason.trim().length >= 5;
  return (
    <form
      className="flex flex-col gap-3 border-t border-border pt-4"
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
      <div className="flex flex-col gap-1 text-xs font-semibold text-text">
        Rejection type
        <Select
          value={type}
          onValueChange={(v) => setType(v as RejectionType)}
          options={REJECTION_TYPES.map((t) => ({
            value: t,
            label: t === 'FIXABLE' ? 'Fixable — driver can reapply' : 'Hard fraud — permanent',
          }))}
        />
      </div>
      <div className="flex flex-col gap-1 text-xs font-semibold text-text">
        Reason (shown to the driver)
        <Input
          value={reason}
          maxLength={255}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Driving licence photo is blurry"
        />
      </div>
      {error !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={() => setRejecting(false)}>
          Back
        </Button>
        <Button type="submit" variant="primary" loading={review.isPending} disabled={!canSubmit}>
          Confirm rejection
        </Button>
      </div>
    </form>
  );
}
