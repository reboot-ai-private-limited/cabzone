'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileCode,
  Upload,
  X,
} from 'lucide-react';
import {
  normalizeGeoJson,
  validateGeometry,
  type GeoJsonGeometry,
  type ZoneViolation,
} from '@cabzone/contracts';
import { ZoneViolations } from './ZoneViolations.js';

interface GeoJsonImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (geometry: GeoJsonGeometry) => void;
}

export function GeoJsonImportDialog({
  isOpen,
  onClose,
  onImport,
}: GeoJsonImportDialogProps) {
  const [rawText, setRawText] = useState('');
  const [parsedGeom, setParsedGeom] = useState<GeoJsonGeometry | null>(null);
  const [violations, setViolations] = useState<ZoneViolation[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleValidateAndParse = (text: string) => {
    setRawText(text);
    setParseError(null);
    setViolations([]);
    setParsedGeom(null);

    if (!text.trim()) return;

    try {
      const parsed = JSON.parse(text);
      const normalized = normalizeGeoJson(parsed);
      const valResult = validateGeometry(normalized);

      setParsedGeom(normalized);
      setViolations(valResult.violations);
    } catch (err: unknown) {
      setParseError((err as Error).message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      handleValidateAndParse(content);
    };
    reader.readAsText(file);
  };

  const handleApplyImport = () => {
    if (parsedGeom && violations.filter((v) => v.severity === 'ERROR').length === 0) {
      onImport(parsedGeom);
      onClose();
    }
  };

  const hasErrors =
    parseError !== null || violations.some((v) => v.severity === 'ERROR');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Import GeoJSON Geometry</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-xs text-slate-500">
            Paste a valid GeoJSON object (Polygon, MultiPolygon, Feature, or FeatureCollection) or upload a file.
          </p>

          {/* File upload input */}
          <div className="flex items-center gap-3">
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100">
              <Upload className="w-3.5 h-3.5" />
              <span>Choose GeoJSON file</span>
              <input
                type="file"
                accept=".json,.geojson,application/geo+json,application/json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <span className="text-[11px] text-slate-400">or paste JSON below</span>
          </div>

          {/* Text Area */}
          <div>
            <textarea
              rows={8}
              value={rawText}
              onChange={(e) => handleValidateAndParse(e.target.value)}
              placeholder='{ "type": "Polygon", "coordinates": [...] }'
              className="w-full p-3 font-mono text-[11px] border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-slate-900 placeholder:text-slate-400"
            />
          </div>

          {/* Validation Feedback */}
          {parseError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {violations.length > 0 && <ZoneViolations violations={violations} />}

          {parsedGeom && !hasErrors && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold">Valid {parsedGeom.type} Geometry</span>
              </div>
              <span className="text-[11px] font-mono text-emerald-700">
                {parsedGeom.type === 'Polygon'
                  ? `${parsedGeom.coordinates[0]?.length ?? 0} vertices`
                  : `${parsedGeom.coordinates.length} polygons`}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApplyImport}
            disabled={!parsedGeom || hasErrors}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-xs"
          >
            Apply Geometry
          </button>
        </div>
      </div>
    </div>
  );
}
