import React from 'react';
import type { AdminStatus } from '@cabzone/contracts';

export function AdminStatusBadge({ status, className = '' }: { status: AdminStatus | string; className?: string }) {
  const isActive = status === 'ACTIVE';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
        isActive
          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
          : 'bg-rose-50 text-rose-800 border-rose-300'
      } ${className}`}
    >
      <span
        className={`size-1.5 rounded-full ${
          isActive ? 'bg-emerald-600' : 'bg-rose-600'
        }`}
      />
      <span>{isActive ? 'Active' : 'Suspended'}</span>
    </span>
  );
}
