'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Edit2,
  History,
  MapPin,
  Power,
  User,
  X,
} from 'lucide-react';
import { getZoneHistory } from '../lib/api.js';
import { ZoneStatusBadge } from './ZoneStatusBadge.js';
import type { ZoneAuditDto, ZoneDto } from '../types/zones.js';

interface ZoneHistoryProps {
  zone: ZoneDto | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ZoneHistory({ zone, isOpen, onClose }: ZoneHistoryProps) {
  const [versions, setVersions] = useState<ZoneDto[]>([]);
  const [auditLogs, setAuditLogs] = useState<ZoneAuditDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'versions' | 'audit'>('versions');

  useEffect(() => {
    if (isOpen && zone) {
      setIsLoading(true);
      getZoneHistory(zone.id)
        .then((res) => {
          setVersions(res.versions);
          setAuditLogs(res.auditLogs);
        })
        .catch(() => {
          // If network error, fallback to current zone as single version
          setVersions([zone]);
          setAuditLogs([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, zone]);

  if (!isOpen || !zone) return null;

  const getActionBadge = (action: ZoneAuditDto['action']) => {
    switch (action) {
      case 'CREATE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            CREATED
          </span>
        );
      case 'UPDATE_GEOMETRY':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
            <MapPin className="w-3 h-3" />
            GEOMETRY UPDATED
          </span>
        );
      case 'UPDATE_METADATA':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
            <Edit2 className="w-3 h-3" />
            METADATA UPDATED
          </span>
        );
      case 'ACTIVATE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            <Power className="w-3 h-3" />
            ACTIVATED
          </span>
        );
      case 'DEACTIVATE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
            <Power className="w-3 h-3" />
            DEACTIVATED
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden border border-slate-200 max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Zone History & Audit Log
              </h3>
              <p className="text-[11px] text-slate-500">
                {zone.name} (<span className="font-mono">{zone.code}</span>)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-100 bg-slate-50 px-5 pt-2 gap-4">
          <button
            type="button"
            onClick={() => setSelectedTab('versions')}
            className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
              selectedTab === 'versions'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Geometry Versions ({versions.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedTab('audit')}
            className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
              selectedTab === 'audit'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Audit Trail ({auditLogs.length})
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-8 text-slate-400">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin mb-2" />
              <p className="text-xs">Loading history...</p>
            </div>
          ) : selectedTab === 'versions' ? (
            <div className="space-y-3">
              {versions.map((ver) => {
                const isCurrent = ver.id === zone.id;
                const formattedDate = new Date(ver.updatedAt).toLocaleString('en-IN', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={ver.id}
                    className={`rounded-lg border p-3 flex flex-col gap-2 transition-colors ${
                      isCurrent
                        ? 'border-indigo-200 bg-indigo-50/30'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-white">
                          v{ver.version}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">
                            CURRENT ACTIVE
                          </span>
                        )}
                        <ZoneStatusBadge status={ver.status} />
                      </div>
                      <span className="text-[11px] text-slate-500">{formattedDate}</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600 pt-1 border-t border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Zone ID</span>
                        <span className="font-mono text-[11px] truncate block">{ver.id}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Supersedes</span>
                        <span className="font-mono text-[11px] text-slate-500">
                          {ver.supersedesZoneId ? ver.supersedesZoneId.substring(0, 8) : 'None (v1)'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Updated By</span>
                        <span className="truncate block">{ver.updatedBy ?? 'Admin'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Vertices</span>
                        <span>
                          {ver.geometry?.type === 'Polygon'
                            ? ver.geometry.coordinates[0]?.length ?? 0
                            : 'MultiPolygon'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {auditLogs.length === 0 ? (
                <div className="text-center p-8 text-slate-400 text-xs">
                  No explicit audit trail recorded for this zone yet.
                </div>
              ) : (
                auditLogs.map((log) => {
                  const formattedDate = new Date(log.createdAt).toLocaleString('en-IN', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={log.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        {getActionBadge(log.action)}
                        <span className="text-[11px] text-slate-400">{formattedDate}</span>
                      </div>

                      {log.reason && (
                        <p className="text-xs text-slate-700 font-medium">
                          &ldquo;{log.reason}&rdquo;
                        </p>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>Actor: {log.actorId}</span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">ID: {log.id.substring(0, 8)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-slate-100 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
