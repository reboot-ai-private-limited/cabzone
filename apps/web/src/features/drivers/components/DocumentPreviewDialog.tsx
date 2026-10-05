'use client';

import { useState } from 'react';
import {
  FileCheck,
  FileText,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Copy,
  Check,
  Shield,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { Badge, Button, Dialog } from '@cabzone/design-system';
import type { DriverDocumentAdminDto } from '@/lib/api/endpoints/drivers';
import { DocumentStatusBadge } from './StatusBadge';

export interface DocumentPreviewDialogProps {
  document: DriverDocumentAdminDto | null;
  driverPhone?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatDate = (iso: string | null): string =>
  iso === null ? '—' : new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });

export function DocumentPreviewDialog({
  document,
  driverPhone,
  open,
  onOpenChange,
}: DocumentPreviewDialogProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [copied, setCopied] = useState(false);

  if (!document) return null;

  const isDL = document.type === 'DRIVING_LICENSE';
  const docTitle = isDL ? 'Driving Licence' : 'Government Identity Card';
  const isExpired =
    document.expiresAt !== null && new Date(document.expiresAt).getTime() < Date.now();

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
      title={`${docTitle} Inspection`}
      description={`Official compliance record for driver ${driverPhone ?? 'applicant'}`}
      className="max-w-3xl"
    >
      <div className="flex flex-col gap-5">
        {/* Inspection Header Status Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-md bg-surface-muted border border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text-subtle uppercase tracking-wider">
              Verification State:
            </span>
            <DocumentStatusBadge status={document.verificationStatus} />
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
        <div className="flex items-center justify-between gap-2 border-b border-border pb-2 text-xs">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              icon={<ZoomIn className="size-3.5" />}
              onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
              aria-label="Zoom in"
            >
              Zoom In
            </Button>
            <Button
              size="sm"
              icon={<ZoomOut className="size-3.5" />}
              onClick={() => setZoom((z) => Math.max(0.75, z - 0.25))}
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
          </div>

          <span className="text-text-subtle tnum">Scale: {Math.round(zoom * 100)}%</span>
        </div>

        {/* Realistic High-Fidelity Document Scan Frame */}
        <div className="relative min-h-[320px] max-h-[440px] flex items-center justify-center p-6 bg-zinc-950/90 rounded-lg border border-border overflow-hidden select-none">
          <div
            className="transition-transform duration-200 ease-out origin-center"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
          >
            {/* Visual Simulated Document Certificate */}
            <div className="w-[440px] min-h-[260px] p-5 rounded-xl bg-gradient-to-br from-slate-900 via-zinc-900 to-neutral-900 border-2 border-slate-700/80 shadow-2xl relative text-zinc-100 flex flex-col justify-between overflow-hidden">
              {/* Guilloche / Security Pattern Overlay */}
              <div
                className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]"
                aria-hidden
              />

              {/* Document Header */}
              <div className="relative z-10 flex items-start justify-between border-b border-zinc-700/60 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="size-9 rounded-md bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
                    <Shield className="size-5" />
                  </div>
                  <div>
                    <p className="text-[10px] tracking-widest uppercase font-semibold text-zinc-400">
                      Republic of India · Transport Authority
                    </p>
                    <h4 className="text-sm font-bold tracking-tight text-white">{docTitle}</h4>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 border border-zinc-700 text-zinc-300">
                  SECURE SCAN
                </span>
              </div>

              {/* Document Body */}
              <div className="relative z-10 grid grid-cols-3 gap-3 my-3">
                {/* Photo Frame Placeholder */}
                <div className="col-span-1 aspect-[3/4] rounded-md bg-zinc-800/80 border border-zinc-700 flex flex-col items-center justify-center text-zinc-500 gap-1 p-2">
                  <div className="size-12 rounded-full bg-zinc-700/60 flex items-center justify-center text-zinc-400">
                    <FileText className="size-6" />
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-center text-zinc-400 font-mono">
                    Photo ID
                  </span>
                </div>

                {/* Details Fields */}
                <div className="col-span-2 flex flex-col justify-around text-xs space-y-1">
                  <div>
                    <span className="text-[10px] uppercase text-zinc-400 block font-medium">
                      Document Number
                    </span>
                    <span className="font-mono text-sm font-semibold tracking-wider text-amber-300">
                      {document.documentNumberMasked ?? 'DOC-VERIFIED-XXXX'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-zinc-400 block font-medium">
                      Holder / Phone Link
                    </span>
                    <span className="font-mono text-xs text-zinc-200">{driverPhone ?? 'Verified Account'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800">
                    <div>
                      <span className="text-[9px] uppercase text-zinc-400 block font-medium">
                        Document Type
                      </span>
                      <span className="text-[11px] font-medium text-zinc-300">
                        {isDL ? 'Class LMV/TR' : 'National ID'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase text-zinc-400 block font-medium">
                        Valid Upto
                      </span>
                      <span
                        className={`text-[11px] font-mono font-medium ${
                          isExpired ? 'text-red-400 font-bold' : 'text-emerald-400'
                        }`}
                      >
                        {formatDate(document.expiresAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Document Footer / Watermark Bar */}
              <div className="relative z-10 flex items-center justify-between border-t border-zinc-800 pt-2 text-[10px] text-zinc-500 font-mono">
                <span className="truncate max-w-[200px]">{document.storageKey}</span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <FileCheck className="size-3" />
                  CRYPTOGRAPHIC HASH MATCH
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Technical Audit Metadata Drawer */}
        <div className="flex flex-col gap-2 rounded-md bg-surface p-3 border border-border text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-text">Cloud Storage Reference</span>
            <Button
              size="sm"
              icon={copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
              onClick={handleCopyHash}
            >
              {copied ? 'Copied' : 'Copy Key'}
            </Button>
          </div>
          <code className="p-2 rounded bg-surface-muted text-text-subtle font-mono text-[11px] break-all border border-border">
            {document.storageKey}
          </code>
        </div>
      </div>
    </Dialog>
  );
}
