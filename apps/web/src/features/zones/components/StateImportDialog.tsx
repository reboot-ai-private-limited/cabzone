'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, Info, TriangleAlert, Upload } from 'lucide-react';
import { Button, Dialog } from '@cabzone/design-system';
import type { ImportStatesResult } from '@/lib/api/endpoints/states';
import { useImportStateBoundaries } from '../hooks/useStateBoundaries';

/**
 * Super-admin import of state/UT borders. Only the launch states (WB, BR, SK, AS) are kept from
 * the file; everything else is skipped and stays NOT_SERVICEABLE.
 */
export function StateImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<ImportStatesResult | null>(null);

  const importer = useImportStateBoundaries((res) => setResult(res));

  const reset = (): void => {
    setText('');
    setFileName(null);
    setVersion('');
    setError(undefined);
    setResult(null);
    importer.reset();
    if (fileInput.current) fileInput.current.value = '';
  };

  const close = (next: boolean): void => {
    if (!next) reset();
    onOpenChange(next);
  };

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
    setError(undefined);
    setResult(null);
  };

  const submit = (): void => {
    let geojson: unknown;
    try {
      geojson = JSON.parse(text);
    } catch {
      setError('That is not valid JSON.');
      return;
    }
    const type = (geojson as { type?: string } | null)?.type;
    if (type !== 'FeatureCollection' && type !== 'Feature') {
      setError('Expected a GeoJSON FeatureCollection or Feature.');
      return;
    }
    setError(undefined);
    importer.mutate(
      { geojson, sourceVersion: version.trim() === '' ? null : version.trim() },
      { onError: (e) => setError(e instanceof Error ? e.message : 'Import failed.') },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Import state borders"
      description="Upload a GeoJSON file of Indian state boundaries. Only West Bengal, Bihar, Sikkim and Assam are imported; other states remain not serviceable."
      footer={
        result ? (
          <Button variant="primary" onClick={() => close(false)}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              loading={importer.isPending}
              disabled={text.trim() === ''}
            >
              Import
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3 text-sm">
          {result.imported.length > 0 && (
            <p className="flex items-start gap-2 text-text">
              <CheckCircle2 aria-hidden className="size-4 mt-0.5 shrink-0 text-success" />
              Imported: <strong>{result.imported.join(', ')}</strong>
            </p>
          )}
          {result.missing.length > 0 && (
            <p className="flex items-start gap-2 text-text">
              <TriangleAlert aria-hidden className="size-4 mt-0.5 shrink-0 text-warning" />
              Not found in file (still not serviceable): <strong>{result.missing.join(', ')}</strong>
            </p>
          )}
          {result.rejected.map((r) => (
            <p key={r.stateCode} className="flex items-start gap-2 text-danger">
              <TriangleAlert aria-hidden className="size-4 mt-0.5 shrink-0" />
              {r.stateCode}: {r.reason}
            </p>
          ))}
          {result.skippedNotServiceable.length > 0 && (
            <p className="text-xs text-text-subtle">
              Skipped {result.skippedNotServiceable.length} other state(s) — not serviceable yet.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="flex items-start gap-1.5 text-xs text-text-subtle">
            <Info aria-hidden className="size-3.5 shrink-0 mt-px" />
            Use an official or properly licensed dataset. Features are matched by a{' '}
            <code>stateCode</code> property or by state name (<code>ST_NM</code>,{' '}
            <code>NAME_1</code>, <code>STATE</code>, <code>stateName</code>). Re-importing replaces
            a state&apos;s border.
          </p>

          <input
            ref={fileInput}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button
            variant="secondary"
            icon={<Upload aria-hidden className="size-4" />}
            onClick={() => fileInput.current?.click()}
          >
            {fileName ?? 'Choose GeoJSON file'}
          </Button>

          <label className="flex flex-col gap-1 text-xs font-semibold text-text">
            Or paste GeoJSON
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setFileName(null);
              }}
              rows={5}
              spellCheck={false}
              className="w-full rounded-md border border-border-strong bg-surface p-2 font-mono text-xs text-text"
              placeholder='{"type":"FeatureCollection","features":[…]}'
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-text">
            Dataset version (optional)
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. 2026-01"
              className="h-10 w-full rounded-md border border-border-strong bg-surface px-2 text-sm text-text"
            />
          </label>

          {error !== undefined && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
