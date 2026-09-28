import React from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import type { ZoneViolation } from '../types/zones.js';

interface ZoneViolationsProps {
  violations: ZoneViolation[];
}

export function ZoneViolations({ violations }: ZoneViolationsProps) {
  if (violations.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-800">
        <AlertCircle className="w-4 h-4 text-rose-600" />
        <span>Validation Issues ({violations.length})</span>
      </div>
      <ul className="space-y-1 text-xs text-rose-700">
        {violations.map((v) => (
          <li key={`${v.code}-${v.message}`} className="flex items-start gap-1.5">
            {v.severity === 'ERROR' ? (
              <span className="shrink-0 mt-0.5 inline-flex items-center px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-rose-200 text-rose-900">
                {v.code}
              </span>
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-600 shrink-0" />
            )}
            <span>{v.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
