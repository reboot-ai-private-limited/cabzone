import React from 'react';
import type { ZoneStatus, ZoneType } from '../types/zones.js';

interface StatusBadgeProps {
  status: ZoneStatus;
}

export function ZoneStatusBadge({ status }: StatusBadgeProps) {
  const isOnline = status === 'ACTIVE';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
        isOnline
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-slate-100 text-slate-600 border-slate-200'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`}
      />
      {status}
    </span>
  );
}

interface TypeBadgeProps {
  type: ZoneType;
}

export function ZoneTypeBadge({ type }: TypeBadgeProps) {
  switch (type) {
    case 'CITY':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
          CITY
        </span>
      );
    case 'PICKUP':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          PICKUP
        </span>
      );
    case 'EXCLUSION':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          EXCLUSION
        </span>
      );
    case 'HILL':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
          HILL
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          {type}
        </span>
      );
  }
}

interface ChargeBadgeProps {
  chargeType?: 'FREE' | 'PAID' | null | undefined;
  chargePaise?: number | null | undefined;
}

export function ZoneChargeBadge({ chargeType, chargePaise }: ChargeBadgeProps) {
  if (!chargeType) return null;
  if (chargeType === 'PAID') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
        ₹{chargePaise ? (chargePaise / 100).toFixed(0) : '0'} Surcharge
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
      Free Pickup
    </span>
  );
}
