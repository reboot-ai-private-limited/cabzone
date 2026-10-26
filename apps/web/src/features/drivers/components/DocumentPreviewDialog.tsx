'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  FileText,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Badge, Button, Dialog } from '@cabzone/design-system';
import type { DocumentType } from '@cabzone/contracts';
import type { DriverDocumentAdminDto } from '@/lib/api/endpoints/drivers';
import { DocumentStatusBadge } from './StatusBadge';

export interface DocumentPreviewDialogProps {
  document: DriverDocumentAdminDto | null;
  driverPhone?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  DRIVING_LICENSE: 'Driving Licence (DL)',
  GOVERNMENT_ID: 'Government ID (Aadhaar / PAN)',
  REGISTRATION_CERTIFICATE: 'Registration Certificate (RC)',
  INSURANCE: 'Vehicle Insurance Policy',
  PERMIT: 'Commercial Vehicle Permit',
};

const formatDate = (iso: string | null): string =>
  iso === null ? '—' : new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });

export function resolveDocumentFileUrl(doc: DriverDocumentAdminDto): string | null {
  if (doc.fileUrl) return doc.fileUrl;
  if (
    doc.storageKey.startsWith('http://') ||
    doc.storageKey.startsWith('https://') ||
    doc.storageKey.startsWith('data:')
  ) {
    return doc.storageKey;
  }
  return null;
}

export function isPdfDocument(doc: DriverDocumentAdminDto, fileUrl: string | null): boolean {
  const keyLower = doc.storageKey.toLowerCase();
  const urlLower = (fileUrl ?? '').toLowerCase();
  return (
    keyLower.endsWith('.pdf') ||
    urlLower.endsWith('.pdf') ||
    urlLower.startsWith('data:application/pdf')
  );
}

export function DocumentPreviewDialog({
  document,
  driverPhone,
  open,
  onOpenChange,
}: DocumentPreviewDialogProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [copied, setCopied] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [document?.id, document?.fileUrl]);

  if (!document) return null;

  const docTitle = DOCUMENT_TYPE_LABELS[document.type] ?? document.type.replace(/_/g, ' ');
  const isExpired =
    document.expiresAt !== null && new Date(document.expiresAt).getTime() < Date.now();
  const isRedacted = document.storageKey === 'REDACTED';
  const fileUrl = resolveDocumentFileUrl(document);
  const isPdf = isPdfDocument(document, fileUrl);

  const handleCopyHash = () => {
    void navigator.clipboard.writeText(document.storageKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetView = () => {
    setZoom(1);
    setRotation(0);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetView();
        onOpenChange(next);
      }}
      title={`${docTitle} — Original Document`}
      description={`Uploaded KYC document for driver ${driverPhone ?? 'applicant'}`}
      className="max-w-4xl"
    >
      <div className="flex flex-col gap-4">
        {/* Inspection Header Status Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-surface-muted border border-border">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-semibold text-text-subtle uppercase tracking-wider">
              Status:
            </span>
            <DocumentStatusBadge status={document.verificationStatus} />
            {document.documentNumberMasked && (
              <span className="px-2 py-0.5 rounded bg-surface border border-border font-mono text-xs font-semibold text-text">
                {document.documentNumberMasked}
              </span>
            )}
            {isExpired && (
              <Badge tone="danger">
                <span className="flex items-center gap-1">
                  <AlertTriangle className="size-3" />
                  Expired
                </span>
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-text-subtle">
            <Calendar className="size-3.5" />
            <span>Expires: {formatDate(document.expiresAt)}</span>
          </div>
        </div>

        {/* Viewer Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {!isPdf && fileUrl && (
              <>
                <Button
                  size="sm"
                  icon={<ZoomIn className="size-3.5" />}
                  onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                  aria-label="Zoom in"
                >
                  Zoom In
                </Button>
                <Button
                  size="sm"
                  icon={<ZoomOut className="size-3.5" />}
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                  aria-label="Zoom out"
                >
                  Zoom Out
                </Button>
                <Button
                  size="sm"
                  icon={<RotateCw className="size-3.5" />}
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  aria-label="Rotate"
                >
                  Rotate
                </Button>
                {(zoom !== 1 || rotation !== 0) && (
                  <Button size="sm" onClick={resetView}>
                    Reset
                  </Button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {!isPdf && fileUrl && (
              <span className="text-text-subtle tnum">Scale: {Math.round(zoom * 100)}%</span>
            )}
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-interactive/10 text-interactive hover:bg-interactive/15 font-semibold text-xs transition-colors"
              >
                <ExternalLink className="size-3.5" />
                Open Original
              </a>
            )}
          </div>
        </div>

        {/* Original Uploaded Document Viewer Canvas */}
        <div className="relative min-h-[380px] max-h-[540px] flex items-center justify-center p-4 bg-zinc-950/95 rounded-xl border border-border overflow-auto">
          {fileUrl && isPdf ? (
            <iframe
              src={fileUrl}
              title={docTitle}
              className="w-full h-[480px] rounded-lg bg-white border border-zinc-800"
            />
          ) : fileUrl && !imageError ? (
            <div className="flex items-center justify-center w-full h-full overflow-auto py-2">
              <img
                src={fileUrl}
                alt={`${docTitle} uploaded by ${driverPhone ?? 'driver'}`}
                onError={() => setImageError(true)}
                className="max-h-[480px] max-w-full w-auto object-contain rounded-lg shadow-2xl transition-transform duration-200 ease-out origin-center"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center gap-2.5 p-8 max-w-md text-zinc-300">
              <div className="size-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400">
                <FileText className="size-6" />
              </div>
              <p className="text-sm font-semibold text-white">
                {isRedacted
                  ? 'Document preview restricted for your role'
                  : imageError
                    ? 'Could not load original document image'
                    : 'No original file attached (Test / Seeded Record)'}
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {isRedacted
                  ? 'Original KYC document images are restricted to Super Admin and Support Admin operators.'
                  : imageError
                    ? 'The uploaded document could not be rendered inline. Try opening the original file link above.'
                    : `This document entry (${document.storageKey}) was created via a development seed/shortcut without an uploaded file.`}
              </p>
            </div>
          )}
        </div>

        {/* Storage Key Footer */}
        <div className="flex items-center justify-between gap-2 rounded-lg bg-surface p-2.5 border border-border text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-text shrink-0">Storage Key:</span>
            <code className="px-2 py-0.5 rounded bg-surface-muted text-text-subtle font-mono text-[11px] truncate border border-border">
              {document.storageKey}
            </code>
          </div>
          {!isRedacted && (
            <Button
              size="sm"
              icon={
                copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />
              }
              onClick={handleCopyHash}
            >
              {copied ? 'Copied' : 'Copy Key'}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
