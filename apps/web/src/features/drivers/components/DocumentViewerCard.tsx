'use client';

import { useState } from 'react';
import {
  AlertCircle,
  Eye,
  FileText,
  IdCard,
  Lock,
} from 'lucide-react';
import { Badge, Button } from '@cabzone/design-system';
import {
  hasDocumentPreviewFile,
  type DriverDocumentAdminDto,
} from '@/lib/api/endpoints/drivers';
import { DocumentStatusBadge, computeDocumentExpiryBadge } from './StatusBadge';
import {
  DOCUMENT_TYPE_LABELS,
  DocumentPreviewDialog,
} from './DocumentPreviewDialog';

export interface DocumentViewerCardProps {
  applicationId: string;
  document: DriverDocumentAdminDto;
  driverPhone?: string | null;
}

const formatDate = (iso: string | null): string =>
  iso === null ? '—' : new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });

export function DocumentViewerCard({
  applicationId,
  document,
  driverPhone,
}: DocumentViewerCardProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const isDL = document.type === 'DRIVING_LICENSE';
  const expiryBadge = computeDocumentExpiryBadge(
    document.expiresAt,
    document.verificationStatus,
  );
  const hasFile = hasDocumentPreviewFile(document);

  const title = DOCUMENT_TYPE_LABELS[document.type] ?? document.type.replace(/_/g, ' ');
  const Icon = isDL ? IdCard : FileText;

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg border border-border bg-surface hover:bg-surface-muted/40 transition-colors">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-md bg-surface-muted border border-border flex items-center justify-center shrink-0 text-text-subtle">
            <Icon className="size-5 text-interactive" />
          </div>

          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm text-text">{title}</span>
              <DocumentStatusBadge status={document.verificationStatus} />
              {expiryBadge && (
                <Badge tone={expiryBadge.tone}>{expiryBadge.label}</Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-subtle">
              {document.documentNumberMasked && (
                <span className="font-mono text-text font-medium">
                  {document.documentNumberMasked}
                </span>
              )}
              {document.expiresAt && (
                <span
                  className={`inline-flex items-center gap-1 ${
                    expiryBadge?.tone === 'danger'
                      ? 'text-danger font-medium'
                      : expiryBadge?.tone === 'warning'
                        ? 'text-warning font-medium'
                        : ''
                  }`}
                >
                  {expiryBadge !== null && <AlertCircle className="size-3" />}
                  Expires: {formatDate(document.expiresAt)}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] text-text-subtle">
                <Lock className="size-3" />
                {hasFile ? 'Private KYC vault file' : 'Metadata only'}
              </span>
            </div>

            <span className="font-mono text-[11px] text-text-subtle/80 truncate max-w-xs sm:max-w-md">
              {document.storageKey}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <Button
            size="sm"
            variant="secondary"
            icon={<Eye className="size-3.5 text-interactive" />}
            onClick={() => setIsPreviewOpen(true)}
          >
            Inspect Document
          </Button>
        </div>
      </div>

      <DocumentPreviewDialog
        applicationId={applicationId}
        document={document}
        driverPhone={driverPhone}
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
      />
    </>
  );
}
