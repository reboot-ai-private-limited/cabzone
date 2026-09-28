'use client';

import React, { useState } from 'react';
import { AlertTriangle, Power, X } from 'lucide-react';
import type { ZoneDto } from '../types/zones.js';

interface DeactivateZoneDialogProps {
  zone: ZoneDto | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (zoneId: string, reason: string) => Promise<void>;
  isLoading?: boolean;
}

export function DeactivateZoneDialog({
  zone,
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: DeactivateZoneDialogProps) {
  const [reason, setReason] = useState('');

  if (!isOpen || !zone) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(zone.id, reason);
    setReason('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2 text-rose-600">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="text-sm font-bold text-slate-900">Deactivate Zone</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-slate-600">
            Are you sure you want to deactivate{' '}
            <span className="font-semibold text-slate-900">{zone.name}</span> (
            <span className="font-mono text-slate-800">{zone.code}</span>)?
          </p>

          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            This will immediately prevent this zone from participating in runtime zone resolution,
            dispatch matching, and ride pricing.
          </div>

          <div>
            <label
              htmlFor="deactivate-reason"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Deactivation Reason (Optional)
            </label>
            <input
              id="deactivate-reason"
              type="text"
              placeholder="e.g. Seasonal boundary change, Road closure, Construction"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg shadow-xs"
            >
              <Power className="w-3.5 h-3.5" />
              <span>{isLoading ? 'Deactivating...' : 'Confirm Deactivation'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
