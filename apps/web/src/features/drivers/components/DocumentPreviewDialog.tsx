'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Lock,
  RefreshCw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Badge, Button, Dialog, Skeleton } from '@cabzone/design-system';
import type { DocumentType } from '@cabzone/contracts';
import {
  driversApi,
  hasDocumentPreviewFile,
  isPdfPreview,
  resolvePreviewContentUrl,
  type DriverDocumentAdminDto,
} from '@/lib/api/endpoints/drivers';
import { DocumentStatusBadge, computeDocumentExpiryBadge } from './StatusBadge';

export interface DocumentPreviewDialogProps {
  applicationId: string | null;
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

const formatExpiryTime = (iso: string | null | undefined): string =>
  !iso
    ? '5 min'
    : new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export { isPdfPreview };

export function DocumentPreviewDialog({
  applicationId,
  document,
  driverPhone,
  open,
  onOpenChange,
}: DocumentPreviewDialogProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [copied, setCopied] = useState(false);
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);

  const hasFile = document ? hasDocumentPreviewFile(document) : false;

  const previewQuery = useQuery({
    queryKey: ['admin-kyc-document-preview', applicationId, document?.id] as const,
    queryFn: ({ signal }) =>
      driversApi.previewDocument(applicationId!, document!.id, undefined, signal),
    enabled: open && Boolean(applicationId) && Boolean(document?.id) && hasFile,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (!document) return null;

  const docTitle = DOCUMENT_TYPE_LABELS[document.type] ?? document.type.replace(/_/g, ' ');
  const expiryBadge = computeDocumentExpiryBadge(
    document.expiresAt,
    document.verificationStatus,
  );
  const signedUrl = resolvePreviewContentUrl(previewQuery.data?.url);
  const isPdf = isPdfPreview(previewQuery.data?.mimeType, document.storageKey);
  const imageError = signedUrl !== null && failedPreviewUrl === signedUrl;

  const handleCopyKey = () => {
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
      title={`${docTitle} — Audited Preview`}
      description={`Private KYC document for driver ${driverPhone ?? 'applicant'} (access logged)`}
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
            {expiryBadge && (
              <Badge tone={expiryBadge.tone}>
                <span className="flex items-center gap-1">
                  <AlertTriangle className="size-3" />
                  {expiryBadge.label}
                </span>
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-text-subtle">
            <span className="inline-flex items-center gap-1">
              <Lock className="size-3.5 text-interactive" />
              {previewQuery.data?.expiresAt
                ? `Signed link valid until ${formatExpiryTime(previewQuery.data.expiresAt)}`
                : 'Short-lived signed preview'}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5" />
              Expires: {formatDate(document.expiresAt)}
            </span>
          </div>
        </div>

        {/* Viewer Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {!isPdf && signedUrl && (
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

          <div className="flex items-center gap-2.5">
            {!isPdf && signedUrl && (
              <span className="text-text-subtle tnum">Scale: {Math.round(zoom * 100)}%</span>
            )}
            {hasFile && applicationId && (
              <Button
                size="sm"
                icon={<RefreshCw className={`size-3.5 ${previewQuery.isFetching ? 'animate-spin' : ''}`} />}
                loading={previewQuery.isFetching}
                onClick={() => {
                  setFailedPreviewUrl(null);
                  void previewQuery.refetch();
                }}
              >
                Refresh Link
              </Button>
            )}
            {signedUrl && (
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-interactive/10 text-interactive hover:bg-interactive/15 font-semibold text-xs transition-colors"
              >
                <ExternalLink className="size-3.5" />
                Open Signed Copy
              </a>
            )}
          </div>
        </div>

        {/* Original Uploaded Document Viewer Canvas */}
        <div className="relative min-h-[380px] max-h-[540px] flex items-center justify-center p-4 bg-zinc-950/95 rounded-xl border border-border overflow-auto">
          {previewQuery.isFetching ? (
            <div className="w-full flex flex-col items-center justify-center gap-3 py-12">
              <Skeleton className="w-full max-w-lg h-64 rounded-lg opacity-30" />
              <span className="text-xs text-zinc-400">
                Generating audited short-lived preview token…
              </span>
            </div>
          ) : previewQuery.isError ? (
            <div className="flex flex-col items-center justify-center text-center gap-3 p-8 max-w-md text-zinc-300">
              <div className="size-12 rounded-full bg-danger/20 border border-danger/40 flex items-center justify-center text-danger">
                <AlertTriangle className="size-6" />
              </div>
              <p className="text-sm font-semibold text-white">
                Could not authorize document preview
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {previewQuery.error instanceof Error
                  ? previewQuery.error.message
                  : 'Your admin role may not have access to this driver city or the file is unavailable.'}
              </p>
              <Button size="sm" onClick={() => void previewQuery.refetch()}>
                Retry Preview
              </Button>
            </div>
          ) : signedUrl && isPdf ? (
            <iframe
              src={signedUrl}
              title={docTitle}
              className="w-full h-[480px] rounded-lg bg-white border border-zinc-800"
            />
          ) : signedUrl && !imageError ? (
            <div className="flex items-center justify-center w-full h-full overflow-auto py-2">
              <img
                src={signedUrl}
                alt={`${docTitle} uploaded by ${driverPhone ?? 'driver'}`}
                onError={() => setFailedPreviewUrl(signedUrl)}
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
                {imageError
                  ? 'Signed preview expired or could not render'
                  : 'No private KYC file attached (Seeded Record)'}
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {imageError
                  ? 'Click Refresh Link above to issue a fresh 5-minute signed preview URL.'
                  : `This document entry (${document.storageKey}) has no private binary stored in KYC vault.`}
              </p>
            </div>
          )}
        </div>

        {/* Storage Key Footer */}
        <div className="flex items-center justify-between gap-2 rounded-lg bg-surface p-2.5 border border-border text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-text shrink-0">Vault Key:</span>
            <code className="px-2 py-0.5 rounded bg-surface-muted text-text-subtle font-mono text-[11px] truncate border border-border">
              {document.storageKey}
            </code>
          </div>
          <Button
            size="sm"
            icon={copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
            onClick={handleCopyKey}
          >
            {copied ? 'Copied' : 'Copy Key'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
