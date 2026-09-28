import React from 'react';
import {
  Clock,
  Edit2,
  Eye,
  History,
  MapPin,
  Power,
} from 'lucide-react';
import { ZoneStatusBadge, ZoneTypeBadge } from './ZoneStatusBadge.js';
import type { ZoneDto } from '../types/zones.js';

interface ZonesTableProps {
  zones: ZoneDto[];
  selectedZoneId?: string | null | undefined;
  onSelectZone: (zone: ZoneDto) => void;
  onEditDetails: (zone: ZoneDto) => void;
  onEditGeometry: (zone: ZoneDto) => void;
  onViewHistory: (zone: ZoneDto) => void;
  onToggleStatus: (zone: ZoneDto) => void;
  isLoading?: boolean;
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
  onPageChange?: (page: number) => void;
}

export function ZonesTable({
  zones,
  selectedZoneId,
  onSelectZone,
  onEditDetails,
  onEditGeometry,
  onViewHistory,
  onToggleStatus,
  isLoading = false,
  pagination,
  onPageChange,
}: ZonesTableProps) {
  if (isLoading && zones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin mb-3" />
        <p className="text-xs">Loading zones configuration...</p>
      </div>
    );
  }

  if (zones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <MapPin className="w-10 h-10 text-slate-300 mb-3" />
        <h3 className="text-sm font-semibold text-slate-900">No zones found</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          No geographic zones match the selected filters. Try changing your search query or create a new zone.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3">Zone Name</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-center">Version</th>
              <th className="px-4 py-3">Last Updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {zones.map((zone) => {
              const isSelected = zone.id === selectedZoneId;
              const formattedDate = new Date(zone.updatedAt).toLocaleDateString('en-IN', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <tr
                  key={zone.id}
                  onClick={() => onSelectZone(zone)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-slate-50 font-medium' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <td className="px-4 py-3 text-slate-900">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-900">{zone.name}</span>
                      {zone.parentCityZoneId && (
                        <span className="text-[10px] text-slate-400">Child of City</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-slate-700">
                    {zone.code}
                  </td>
                  <td className="px-4 py-3">
                    <ZoneTypeBadge type={zone.zoneType ?? zone.type} />
                  </td>
                  <td className="px-4 py-3">
                    <ZoneStatusBadge status={zone.status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-100 text-slate-800">
                      v{zone.version}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-[11px]">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{formattedDate}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onSelectZone(zone)}
                        className="p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded"
                        title="View Zone Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditDetails(zone)}
                        className="p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded"
                        title="Edit Metadata"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditGeometry(zone)}
                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                        title="Update Geometry"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onViewHistory(zone)}
                        className="p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded"
                        title="Audit & History"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleStatus(zone)}
                        className={`p-1 rounded ${
                          zone.status === 'ACTIVE'
                            ? 'text-rose-500 hover:text-rose-700 hover:bg-rose-50'
                            : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'
                        }`}
                        title={zone.status === 'ACTIVE' ? 'Deactivate Zone' : 'Activate Zone'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pagination && (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 bg-slate-50 text-xs text-slate-600">
          <div>
            Showing{' '}
            <span className="font-semibold text-slate-900">
              {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}
            </span>{' '}
            to{' '}
            <span className="font-semibold text-slate-900">
              {Math.min(pagination.page * pagination.limit, pagination.total)}
            </span>{' '}
            of <span className="font-semibold text-slate-900">{pagination.total}</span> zones
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange?.(pagination.page - 1)}
              className="px-2.5 py-1 text-xs border border-slate-200 rounded bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-2 font-mono font-medium">Page {pagination.page}</span>
            <button
              type="button"
              disabled={pagination.page * pagination.limit >= pagination.total}
              onClick={() => onPageChange?.(pagination.page + 1)}
              className="px-2.5 py-1 text-xs border border-slate-200 rounded bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
