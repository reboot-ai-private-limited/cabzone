'use client';

import { useState } from 'react';
import {
  AlertCircle,
  Eye,
  FileText,
  IdCard,
} from 'lucide-react';
import { Button } from '@cabzone/design-system';
import type { DriverDocumentAdminDto } from '@/lib/api/endpoints/drivers';
import { DocumentStatusBadge } from './StatusBadge';
import { DocumentPreviewDialog } from './DocumentPreviewDialog';

export interface DocumentViewerCardProps {
  document: DriverDocumentAdminDto;
  driverPhone?: string | null;
}

const formatDate = (iso: string | null): string =>
  iso === null ? '—' : new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });

export function DocumentViewerCard({ document, driverPhone }: DocumentViewerCardProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const isDL = document.type === 'DRIVING_LICENSE';
  const isExpired =
    document.expiresAt !== null && new Date(document.expiresAt).getTime() < Date.now();

  const title = isDL ? 'Driving Licence (DL)' : 'Government ID Card';
  const Icon = isDL ? IdCard : FileText;

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg border border-border bg-surface hover:bg-surface-muted/40 transition-colors">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-md bg-surface-muted border border-border flex items-center justify-center shrink-0 text-text-subtle">
            <Icon className="size-5 text-interactive" />
          </div>

          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-text">{title}</span>
              <DocumentStatusBadge status={document.verificationStatus} />
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-subtle">
              {document.documentNumberMasked && (
                <span className="font-mono text-text font-medium">
                  {document.documentNumberMasked}
                </span>
              )}
              {document.expiresAt && (
                <span className={`inline-flex items-center gap-1 ${isExpired ? 'text-danger font-medium' : ''}`}>
                  {isExpired && <AlertCircle className="size-3" />}
                  Expires: {formatDate(document.expiresAt)}
                </span>
              )}
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
            Preview Document
          </Button>
        </div>
      </div>

      <DocumentPreviewDialog
        document={document}
        driverPhone={driverPhone}
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
      />
    </>
  );
}
