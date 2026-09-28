import React from 'react';
import {
  Edit2,
  History,
  MapPin,
  Power,
  X,
} from 'lucide-react';
import { ZoneStatusBadge, ZoneTypeBadge } from './ZoneStatusBadge.js';
import type { ZoneDto } from '../types/zones.js';

interface ZoneInspectorProps {
  zone: ZoneDto | null;
  onClose: () => void;
  onEditDetails: (zone: ZoneDto) => void;
  onEditGeometry: (zone: ZoneDto) => void;
  onViewHistory: (zone: ZoneDto) => void;
  onToggleStatus: (zone: ZoneDto) => void;
}

export function ZoneInspector({
  zone,
  onClose,
  onEditDetails,
  onEditGeometry,
  onViewHistory,
  onToggleStatus,
}: ZoneInspectorProps) {
  if (!zone) return null;

  const formattedCreated = new Date(zone.createdAt).toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const formattedUpdated = new Date(zone.updatedAt).toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const zoneType = zone.zoneType ?? zone.type;

  return (
    <div className="border-t border-slate-200 bg-white p-4 shadow-lg flex flex-col gap-3">
      {/* Header: Title, badges & close */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">{zone.name}</h2>
            <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
              {zone.code}
            </span>
            <ZoneTypeBadge type={zoneType} />
            <ZoneStatusBadge status={zone.status} />
          </div>
          <span className="text-[11px] font-mono text-slate-400 mt-0.5">ID: {zone.id}</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Grid of properties */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 py-2 border-y border-slate-100 text-xs">
        <div>
          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Version</span>
          <span className="font-mono font-bold text-slate-800">v{zone.version}</span>
        </div>

        <div>
          <span className="text-slate-400 block text-[10px] uppercase font-semibold">State Code</span>
          <span className="font-semibold text-slate-800">{zone.stateCode}</span>
        </div>

        <div>
          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Buffer Distance</span>
          <span className="text-slate-800">
            {zone.bufferDistanceM ? `${(zone.bufferDistanceM / 1000).toFixed(1)} km` : 'None / Default'}
          </span>
        </div>

        <div>
          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Geometry Type</span>
          <span className="font-mono text-slate-800">{zone.geometry?.type || zone.boundary?.type || 'Polygon'}</span>
        </div>

        <div>
          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Created & Updated</span>
          <span className="text-slate-800 text-[11px] block">{formattedUpdated}</span>
          <span className="text-slate-400 text-[10px] block">Init: {formattedCreated}</span>
        </div>

        <div>
          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Updated By</span>
          <span className="text-slate-800 truncate block">{zone.updatedBy ?? 'Admin'}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEditGeometry(zone)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors border border-indigo-200"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Edit Geometry</span>
          </button>

          <button
            type="button"
            onClick={() => onEditDetails(zone)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit Details</span>
          </button>

          <button
            type="button"
            onClick={() => onViewHistory(zone)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit History</span>
          </button>
        </div>

        <div>
          <button
            type="button"
            onClick={() => onToggleStatus(zone)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
              zone.status === 'ACTIVE'
                ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{zone.status === 'ACTIVE' ? 'Deactivate Zone' : 'Activate Zone'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
