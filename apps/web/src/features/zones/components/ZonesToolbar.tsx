import React from 'react';
import {
  ListFilter,
  LogOut,
  Map as MapIcon,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Table as TableIcon,
  User,
} from 'lucide-react';
import type { ZoneFilterState, ZoneStatus, ZoneType, ZoneViewMode } from '../types/zones.js';

interface ZonesToolbarProps {
  filter: ZoneFilterState;
  onFilterChange: (update: Partial<ZoneFilterState>) => void;
  viewMode: ZoneViewMode;
  onViewModeChange: (mode: ZoneViewMode) => void;
  onCreateClick: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
  adminPhone?: string | null;
  onLoginClick?: () => void;
  onLogoutClick?: () => void;
  counts?: {
    ALL: number;
    CITY: number;
    PICKUP: number;
    EXCLUSION: number;
    HILL?: number;
  };
}

export function ZonesToolbar({
  filter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  onCreateClick,
  onRefresh,
  isLoading = false,
  adminPhone,
  onLoginClick,
  onLogoutClick,
  counts,
}: ZonesToolbarProps) {
  const types: Array<{ key: ZoneType | 'ALL'; label: string }> = [
    { key: 'ALL', label: 'All Zones' },
    { key: 'CITY', label: 'City' },
    { key: 'PICKUP', label: 'Pickup' },
    { key: 'EXCLUSION', label: 'Exclusion' },
    { key: 'HILL', label: 'Hill' },
  ];

  return (
    <div className="flex flex-col gap-4 border-b border-slate-200 bg-white p-4">
      {/* Top row: Title, View Switcher & Action buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Zones Control Plane</h1>
          <span className="text-xs text-slate-500 hidden sm:inline">
            Authoritative Geographic Boundaries
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Admin user status badge / login button */}
          {adminPhone ? (
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-mono font-medium text-slate-700">{adminPhone}</span>
              {onLogoutClick && (
                <button
                  type="button"
                  onClick={onLogoutClick}
                  className="text-slate-400 hover:text-rose-600 p-0.5 rounded"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            onLoginClick && (
              <button
                type="button"
                onClick={onLoginClick}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg transition-colors"
              >
                <User className="w-3.5 h-3.5" />
                <span>Admin Sign In</span>
              </button>
            )
          )}

          {/* View mode toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('map')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'map'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Map</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Refresh zones"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onCreateClick}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Create Zone</span>
          </button>
        </div>
      </div>

      {/* Bottom row: Type Filter tabs, Status Selector, and Search input */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Type tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {types.map(({ key, label }) => {
            const isSelected = filter.type === key;
            const count = counts ? counts[key] : undefined;

            return (
              <button
                key={key}
                type="button"
                onClick={() => onFilterChange({ type: key, page: 1 })}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  isSelected
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>{label}</span>
                {count !== undefined && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      isSelected
                        ? 'bg-slate-800 text-slate-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search & Status filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Status select */}
          <div className="flex items-center gap-1.5">
            <ListFilter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filter.status}
              onChange={(e) =>
                onFilterChange({ status: e.target.value as ZoneStatus | 'ALL', page: 1 })
              }
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 hover:border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          {/* Search bar */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or code..."
              value={filter.search}
              onChange={(e) => onFilterChange({ search: e.target.value, page: 1 })}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white placeholder-slate-400 text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
