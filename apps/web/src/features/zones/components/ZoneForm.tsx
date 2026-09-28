'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileCode,
  MapPin,
  Save,
  Square,
  X,
} from 'lucide-react';
import {
  validateGeometry,
  type CreateZoneInputDto,
  type GeoJsonGeometry,
  type GeoJsonPolygon,
  type ZoneDto,
  type ZoneType,
  type ZoneViolation,
} from '@cabzone/contracts';
import { validateZone } from '../lib/api.js';
import { ZoneViolations } from './ZoneViolations.js';

interface ZoneFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateZoneInputDto) => Promise<void>;
  cities: ZoneDto[];
  initialData?: ZoneDto | null;
  draftGeometry?: GeoJsonPolygon | null;
  onOpenGeoJsonImport: () => void;
  onStartDrawing?: () => void;
  isLoading?: boolean;
}

export function ZoneForm({
  isOpen,
  onClose,
  onSave,
  cities,
  initialData,
  draftGeometry,
  onOpenGeoJsonImport,
  onStartDrawing,
  isLoading = false,
}: ZoneFormProps) {
  const isEditing = Boolean(initialData);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<ZoneType>('CITY');
  const [stateCode, setStateCode] = useState('WB');
  const [parentCityZoneId, setParentCityZoneId] = useState<string>('');
  const [bufferDistanceM, setBufferDistanceM] = useState<string>('20000');
  const [geometry, setGeometry] = useState<GeoJsonGeometry | null>(null);

  const [violations, setViolations] = useState<ZoneViolation[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isServerValidated, setIsServerValidated] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Initialize or populate form
  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setCode(initialData.code);
      setType(initialData.zoneType ?? initialData.type);
      setStateCode(initialData.stateCode);
      setParentCityZoneId(initialData.parentCityZoneId ?? '');
      setBufferDistanceM(
        initialData.bufferDistanceM ? String(initialData.bufferDistanceM) : '20000',
      );
      setGeometry(initialData.geometry ?? initialData.boundary);
    } else {
      setName('');
      setCode('');
      setType('CITY');
      setStateCode('WB');
      setParentCityZoneId('');
      setBufferDistanceM('20000');
      setGeometry(null);
    }
    setViolations([]);
    setIsServerValidated(false);
    setSubmitError(null);
  }, [initialData, isOpen]);

  // Synchronize draft geometry from map if available
  useEffect(() => {
    if (draftGeometry) {
      setGeometry(draftGeometry);
      setIsServerValidated(false);
    }
  }, [draftGeometry]);

  if (!isOpen) return null;

  // Auto-generate code slug from name if not manually changed
  const handleNameChange = (val: string) => {
    setName(val);
    if (!isEditing && (!code || code === generateSlug(name))) {
      setCode(generateSlug(val));
    }
  };

  const generateSlug = (val: string) => {
    return val
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  // Run dry-run validation (local + API)
  const handleValidate = async () => {
    setViolations([]);
    setSubmitError(null);

    if (!geometry) {
      setViolations([
        {
          code: 'Z-001',
          severity: 'ERROR',
          message: 'Zone geometry is required. Please draw on the map or import GeoJSON.',
        },
      ]);
      return false;
    }

    // 1. Local structure check
    const local = validateGeometry(geometry);
    if (!local.valid) {
      setViolations(local.violations);
      return false;
    }

    // 2. Server conflict check
    setIsValidating(true);
    try {
      const res = await validateZone({
        type,
        geometry,
        excludeZoneId: initialData?.id,
      });

      setViolations(res.violations);
      if (res.valid) {
        setIsServerValidated(true);
        return true;
      }
      return false;
    } catch (err: unknown) {
      setSubmitError((err as Error).message);
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!name.trim()) {
      setSubmitError('Zone name is required.');
      return;
    }

    if (type === 'PICKUP' && !parentCityZoneId) {
      setSubmitError('PICKUP zone must specify a parent CITY zone.');
      return;
    }

    if (!geometry) {
      setSubmitError('Zone geometry is required.');
      return;
    }

    // Validate before saving if not already verified
    if (!isServerValidated) {
      const ok = await handleValidate();
      if (!ok) return;
    }

    try {
      await onSave({
        name: name.trim(),
        code: code.trim().toUpperCase() || generateSlug(name),
        type,
        zoneType: type,
        stateCode: stateCode.trim().toUpperCase(),
        parentCityZoneId: type === 'PICKUP' ? parentCityZoneId : null,
        bufferDistanceM: type === 'CITY' && bufferDistanceM ? Number(bufferDistanceM) : null,
        geometry,
      });
      onClose();
    } catch (err: unknown) {
      setSubmitError((err as Error).message);
    }
  };

  const hasErrors = violations.some((v) => v.severity === 'ERROR');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full flex flex-col overflow-hidden border border-slate-200 max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">
              {initialData ? `Edit Zone (${initialData.code})` : 'Create New Zone'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto p-5 space-y-4">
          {submitError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Type Selector */}
          <div>
            <label htmlFor="form-zone-type" className="block text-xs font-semibold text-slate-700 mb-1">
              Zone Type <span className="text-rose-500">*</span>
            </label>
            <select
              id="form-zone-type"
              value={type}
              disabled={isEditing}
              onChange={(e) => {
                setType(e.target.value as ZoneType);
                setIsServerValidated(false);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white disabled:bg-slate-50 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
            >
              <option value="CITY">CITY (Authoritative City Boundary)</option>
              <option value="PICKUP">PICKUP (Active Dispatch & Service Coverage)</option>
              <option value="EXCLUSION">EXCLUSION (Restricted Area / Absolute Veto)</option>
            </select>
          </div>

          {/* Name & Code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="form-zone-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Zone Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="form-zone-name"
                type="text"
                required
                placeholder="e.g. Siliguri West"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div>
              <label htmlFor="form-zone-code" className="block text-xs font-semibold text-slate-700 mb-1">
                Zone Code <span className="text-rose-500">*</span>
              </label>
              <input
                id="form-zone-code"
                type="text"
                required
                placeholder="e.g. SLG_WEST"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-1.5 text-xs font-mono font-bold border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>

          {/* State Code & Parent City */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="form-state-code" className="block text-xs font-semibold text-slate-700 mb-1">
                State Code (2 Letters)
              </label>
              <input
                id="form-state-code"
                type="text"
                maxLength={2}
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-1.5 text-xs font-mono uppercase border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-900"
              />
            </div>

            {type === 'PICKUP' && (
              <div>
                <label htmlFor="form-parent-city" className="block text-xs font-semibold text-slate-700 mb-1">
                  Parent City Zone <span className="text-rose-500">*</span>
                </label>
                <select
                  id="form-parent-city"
                  required
                  value={parentCityZoneId}
                  onChange={(e) => setParentCityZoneId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-slate-900"
                >
                  <option value="">Select Parent City...</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {type === 'CITY' && (
              <div>
                <label htmlFor="form-buffer-distance" className="block text-xs font-semibold text-slate-700 mb-1">
                  Derived Buffer (Meters)
                </label>
                <input
                  id="form-buffer-distance"
                  type="number"
                  placeholder="20000"
                  value={bufferDistanceM}
                  onChange={(e) => setBufferDistanceM(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-900"
                />
              </div>
            )}
          </div>

          {/* Geometry Section */}
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900">
                Geographic Boundary (GeoJSON) <span className="text-rose-500">*</span>
              </span>
              {geometry && (
                <span className="text-[11px] font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-medium">
                  {geometry.type === 'Polygon'
                    ? `${geometry.coordinates[0]?.length ?? 0} Vertices`
                    : `${geometry.coordinates.length} Polygons`}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onOpenGeoJsonImport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs"
              >
                <FileCode className="w-3.5 h-3.5 text-indigo-600" />
                <span>Import GeoJSON</span>
              </button>

              {onStartDrawing && (
                <button
                  type="button"
                  onClick={onStartDrawing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs"
                >
                  <Square className="w-3.5 h-3.5 text-amber-600" />
                  <span>Draw on Map</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleValidate}
                disabled={!geometry || isValidating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:opacity-50 transition-colors"
              >
                <span>{isValidating ? 'Validating...' : 'Validate Geometry'}</span>
              </button>
            </div>
          </div>

          {/* Validation Feedback */}
          {violations.length > 0 && <ZoneViolations violations={violations} />}

          {isServerValidated && !hasErrors && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Geometry validated successfully without operational conflicts.</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !geometry || hasErrors}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isLoading ? 'Saving...' : 'Save Zone'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
