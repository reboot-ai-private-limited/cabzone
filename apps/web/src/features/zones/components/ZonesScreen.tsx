'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  activateZone,
  createZone,
  deactivateZone,
  getZones,
  updateZoneGeometry,
  updateZoneMetadata,
} from '../lib/api.js';
import { AdminLoginDialog } from '../../auth/components/AdminLoginDialog.js';
import { getStoredPhone, getStoredToken, logout } from '../../auth/lib/authApi.js';
import { DeactivateZoneDialog } from './DeactivateZoneDialog.js';
import { GeoJsonImportDialog } from './GeoJsonImportDialog.js';
import { ZoneForm } from './ZoneForm.js';
import { ZoneHistory } from './ZoneHistory.js';
import { ZoneInspector } from './ZoneInspector.js';
import { ZoneMap } from './ZoneMap.js';
import { ZonesTable } from './ZonesTable.js';
import { ZonesToolbar } from './ZonesToolbar.js';
import type {
  CreateZoneInputDto,
  GeoJsonGeometry,
  GeoJsonPolygon,
  ZoneDto,
  ZoneFilterState,
  ZoneViewMode,
} from '../types/zones.js';

export function ZonesScreen() {
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [selectedZone, setSelectedZone] = useState<ZoneDto | null>(null);
  const [viewMode, setViewMode] = useState<ZoneViewMode>('list');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [filter, setFilter] = useState<ZoneFilterState>({
    type: 'ALL',
    status: 'ALL',
    search: '',
    page: 1,
    limit: 20,
  });

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
  });

  // Modal / Dialog states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<ZoneDto | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);
  const [deactivatingZone, setDeactivatingZone] = useState<ZoneDto | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyZone, setHistoryZone] = useState<ZoneDto | null>(null);

  // Authentication state
  const [adminPhone, setAdminPhone] = useState<string | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Drawing mode state on map
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftGeometry, setDraftGeometry] = useState<GeoJsonPolygon | null>(null);

  // Check stored auth on mount
  useEffect(() => {
    const token = getStoredToken();
    const phone = getStoredPhone();
    setAdminPhone(phone);
    if (!token) {
      setIsAuthOpen(true);
    }
  }, []);

  // Load zones from API
  const loadZones = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await getZones({
        type: filter.type === 'ALL' ? undefined : filter.type,
        status: filter.status === 'ALL' ? undefined : filter.status,
        search: filter.search || undefined,
        page: filter.page,
        limit: filter.limit,
      });

      setZones(res.items);
      setPagination(res.pagination);

      // Keep selected zone reference synchronized
      setSelectedZone((prev) => (prev ? res.items.find((z) => z.id === prev.id) ?? prev : null));
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to fetch zones.';
      if (
        msg.includes('401') ||
        msg.includes('UNAUTHENTICATED') ||
        msg.includes('unauthorized') ||
        msg.includes('FORBIDDEN')
      ) {
        setIsAuthOpen(true);
      }
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  // Compute counts for toolbar tabs
  const counts = {
    ALL: pagination.total,
    CITY: zones.filter((z) => (z.zoneType ?? z.type) === 'CITY').length,
    PICKUP: zones.filter((z) => (z.zoneType ?? z.type) === 'PICKUP').length,
    EXCLUSION: zones.filter((z) => (z.zoneType ?? z.type) === 'EXCLUSION').length,
  };

  const cities = zones.filter((z) => (z.zoneType ?? z.type) === 'CITY' && z.status === 'ACTIVE');

  // Handlers
  const handleFilterChange = (update: Partial<ZoneFilterState>) => {
    setFilter((prev) => ({ ...prev, ...update }));
  };

  const handleSelectZone = (zone: ZoneDto) => {
    setSelectedZone(zone);
  };

  const handleCreateClick = () => {
    setEditingZone(null);
    setDraftGeometry(null);
    setIsFormOpen(true);
  };

  const handleEditDetails = (zone: ZoneDto) => {
    setEditingZone(zone);
    setDraftGeometry(null);
    setIsFormOpen(true);
  };

  const handleEditGeometry = (zone: ZoneDto) => {
    setSelectedZone(zone);
    setViewMode('map');
    setIsDrawing(true);
  };

  const handleViewHistory = (zone: ZoneDto) => {
    setHistoryZone(zone);
    setIsHistoryOpen(true);
  };

  const handleToggleStatus = async (zone: ZoneDto) => {
    if (zone.status === 'ACTIVE') {
      setDeactivatingZone(zone);
      setIsDeactivateOpen(true);
    } else {
      try {
        await activateZone(zone.id);
        await loadZones();
      } catch (err: unknown) {
        setErrorMessage((err as Error).message);
      }
    }
  };

  const handleConfirmDeactivate = async (zoneId: string, reason: string) => {
    try {
      await deactivateZone(zoneId, reason);
      await loadZones();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleSaveZone = async (data: CreateZoneInputDto) => {
    if (editingZone) {
      // If editing existing zone
      if (
        draftGeometry &&
        JSON.stringify(draftGeometry) !==
          JSON.stringify(editingZone.geometry ?? editingZone.boundary)
      ) {
        // Geometry changed: call versioned geometry update
        await updateZoneGeometry(editingZone.id, {
          expectedVersion: editingZone.version,
          geometry: draftGeometry,
        });
      }

      await updateZoneMetadata(editingZone.id, {
        name: data.name,
        code: data.code,
        stateCode: data.stateCode,
        parentCityZoneId: data.parentCityZoneId,
        bufferDistanceM: data.bufferDistanceM,
      });
    } else {
      // Creating brand new zone
      await createZone(data);
    }

    setDraftGeometry(null);
    setIsDrawing(false);
    await loadZones();
  };

  const handleSavePolygonFromMap = async (geometry: GeoJsonPolygon) => {
    // 1. If currently updating an existing zone's geometry
    const targetZone = editingZone ?? selectedZone;
    if (targetZone) {
      try {
        setIsLoading(true);
        await updateZoneGeometry(targetZone.id, {
          expectedVersion: targetZone.version,
          geometry,
        });
        setDraftGeometry(null);
        setIsDrawing(false);
        await loadZones();
        return;
      } catch (err: unknown) {
        setErrorMessage((err as Error).message);
        setIsLoading(false);
        setEditingZone(targetZone);
        setDraftGeometry(geometry);
        setIsFormOpen(true);
        return;
      }
    }

    // 2. If creating a brand new zone, open creation modal with the autocompleted geometry
    setEditingZone(null);
    setDraftGeometry(geometry);
    setIsFormOpen(true);
  };

  const handleImportGeometry = (geom: GeoJsonGeometry) => {
    if (geom.type === 'Polygon') {
      setDraftGeometry(geom);
    } else {
      setDraftGeometry({
        type: 'Polygon',
        coordinates: geom.coordinates[0] ?? [],
      });
    }
  };

  const handleLogout = () => {
    logout();
    setAdminPhone(null);
    setZones([]);
    setIsAuthOpen(true);
  };

  const handleAuthSuccess = () => {
    setAdminPhone(getStoredPhone());
    setIsAuthOpen(false);
    loadZones();
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-100 overflow-hidden">
      {/* Top Toolbar */}
      <ZonesToolbar
        filter={filter}
        onFilterChange={handleFilterChange}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onCreateClick={handleCreateClick}
        onRefresh={loadZones}
        isLoading={isLoading}
        counts={counts}
        adminPhone={adminPhone}
        onLoginClick={() => setIsAuthOpen(true)}
        onLogoutClick={handleLogout}
      />

      {/* Error banner */}
      {errorMessage && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2 text-xs text-rose-800 flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-600 hover:text-rose-900 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Table View */}
        {viewMode === 'list' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <ZonesTable
              zones={zones}
              selectedZoneId={selectedZone?.id}
              onSelectZone={handleSelectZone}
              onEditDetails={handleEditDetails}
              onEditGeometry={handleEditGeometry}
              onViewHistory={handleViewHistory}
              onToggleStatus={handleToggleStatus}
              isLoading={isLoading}
              pagination={pagination}
              onPageChange={(page) => handleFilterChange({ page })}
            />
          </div>
        )}

        {/* Map View */}
        {viewMode === 'map' && (
          <div className="flex-1 w-full h-full relative">
            <ZoneMap
              zones={zones}
              selectedZoneId={selectedZone?.id}
              onSelectZone={handleSelectZone}
              draftGeometry={draftGeometry}
              onDraftChange={setDraftGeometry}
              isDrawing={isDrawing}
              onToggleDrawing={() => setIsDrawing((d) => !d)}
              onSavePolygon={handleSavePolygonFromMap}
            />
          </div>
        )}
      </div>

      {/* Bottom Zone Inspector Drawer */}
      <ZoneInspector
        zone={selectedZone}
        onClose={() => setSelectedZone(null)}
        onEditDetails={handleEditDetails}
        onEditGeometry={handleEditGeometry}
        onViewHistory={handleViewHistory}
        onToggleStatus={handleToggleStatus}
      />

      {/* Modals & Dialogs */}
      <ZoneForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSaveZone}
        cities={cities}
        initialData={editingZone}
        draftGeometry={draftGeometry}
        onOpenGeoJsonImport={() => setIsImportOpen(true)}
        onStartDrawing={() => {
          setIsFormOpen(false);
          setViewMode('map');
          setIsDrawing(true);
        }}
      />

      <GeoJsonImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImport={handleImportGeometry}
      />

      <DeactivateZoneDialog
        zone={deactivatingZone}
        isOpen={isDeactivateOpen}
        onClose={() => {
          setIsDeactivateOpen(false);
          setDeactivatingZone(null);
        }}
        onConfirm={handleConfirmDeactivate}
      />

      <ZoneHistory
        zone={historyZone}
        isOpen={isHistoryOpen}
        onClose={() => {
          setIsHistoryOpen(false);
          setHistoryZone(null);
        }}
      />

      <AdminLoginDialog
        isOpen={isAuthOpen}
        onClose={adminPhone ? () => setIsAuthOpen(false) : undefined}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
