'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, List, LogIn, LogOut, Map as MapIcon, Upload } from 'lucide-react';
import type { ZoneDto, ZoneType } from '@cabzone/contracts';
import { zoneStats, type Polygon } from '@cabzone/geo';
import {
  Badge,
  Button,
  ErrorState,
  PageHeader,
  SegmentedControl,
  Skeleton,
  StatTile,
  StatusPill,
  TopProgressBar,
  cn,
} from '@cabzone/design-system';
import { ApiError } from '@/lib/api/ApiError';
import { toErrorState } from '@/lib/api/toErrorState';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { AdminLoginDialog } from '../../auth/components/AdminLoginDialog';
import { getStoredPhone, getStoredToken, logout } from '../../auth/lib/authApi';
import { useZones } from '../hooks/useZones';
import { useIncityPackages } from '../hooks/useIncityPackages';
import { useZoneValidation } from '../hooks/useZoneValidation';
import {
  useCreateZone,
  useUpdateZoneGeometry,
  useUpdateZoneMetadata,
} from '../hooks/useZoneMutations';
import { toGeoJsonExport } from '../lib/geojson-import';
import { hasApiKey, type MapTypeId } from '../lib/google-maps';
import { DeactivateZoneDialog } from './DeactivateZoneDialog';
import { DeleteZoneDialog } from './DeleteZoneDialog';
import { PlaceSearch } from './PlaceSearch';
import { GeoJsonImportDialog } from './GeoJsonImportDialog';
import { ZoneInspector, type ZoneForm } from './ZoneInspector';
import { ZoneRail } from './ZoneRail';
import { ZonesTable } from './ZonesTable';

/**
 * Coverage — the zones screen.
 *
 * ONE SCREEN, TWO VIEWS, AND THE MAP IS THE DEFAULT. The table this replaced was not wrong
 * because it was a table; it was wrong because it rendered three different kinds of thing as
 * one kind of row. A CITY zone is a setting (there is exactly one, operationally), a PICKUP
 * zone is one of a fixed pair, and a HILL zone is one of a growing list — and the `pickup_charge`
 * column being `—` on five rows out of seven was that mismatch showing through.
 *
 * The list view survives as the AUDIT surface, where superseded versions and inactive zones
 * live. See `ZonesTable`.
 *
 * State that a colleague might need to see lives in the URL — the view, the selection — so a
 * link to "the zone I am asking you about" is a link and not a description. Editor state
 * (the draft polygon, the form) deliberately does not: a half-drawn boundary is not something
 * to restore from a bookmark.
 */

/**
 * MapLibre and Draw are ~210 kB of the zones route on their own, and NOTHING else in the panel
 * needs them — nor does this screen's own list view. Loading them per route (which is what Next
 * is still buying us, per docs/engineering/frontend-architecture.md) is not granular enough
 * when the heavy thing is one of two views.
 *
 * `ssr: false` is the other half. MapLibre reaches for browser globals at module scope; there
 * is no server render of a WebGL canvas worth having, and prerendering it only risks the kind
 * of failure that shows up in production and not in `next dev`.
 */
const ZoneMap = dynamic(() => import('./ZoneMap').then((module) => module.ZoneMap), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-surface-muted" />,
});

type FilterKey = 'view' | 'zone';

interface EditSession {
  /** `null` when creating — there is no saved zone behind the draft yet. */
  zoneId: string | null;
  type: ZoneType;
}

const BLANK_FORM: ZoneForm = { name: '', code: '' };

function formFor(zone: ZoneDto): ZoneForm {
  return {
    name: zone.name,
    code: zone.code,
    bufferDistanceM: zone.bufferDistanceM != null ? String(zone.bufferDistanceM) : '',
  };
}

export function ZonesScreen() {
  const params = useFilterParams<FilterKey>();
  const view = params.get('view') === 'list' ? 'list' : 'map';
  const selectedId = params.get('zone') || null;

  const [session, setSession] = useState<EditSession | null>(null);
  const [draft, setDraft] = useState<Polygon | null>(null);
  const [form, setForm] = useState<ZoneForm>(BLANK_FORM);
  const [mapType, setMapType] = useState<MapTypeId>('roadmap');
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const [violationFocus, setViolationFocus] = useState<Polygon | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<ZoneDto | null>(null);
  const [deleting, setDeleting] = useState<ZoneDto | null>(null);

  // Authentication state
  const [adminPhone, setAdminPhone] = useState<string | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    const phone = getStoredPhone();
    setAdminPhone(phone);
    if (!token) {
      setIsAuthOpen(true);
    }
  }, []);

  const zonesQuery = useZones();
  const packagesQuery = useIncityPackages();

  useEffect(() => {
    if (zonesQuery.error) {
      const msg = (zonesQuery.error as Error).message || '';
      if (
        (zonesQuery.error instanceof ApiError && zonesQuery.error.status === 401) ||
        msg.includes('401') ||
        msg.includes('UNAUTHENTICATED')
      ) {
        setIsAuthOpen(true);
      }
    }
  }, [zonesQuery.error]);

  const handleAuthSuccess = () => {
    setAdminPhone(getStoredPhone());
    setIsAuthOpen(false);
    void zonesQuery.refetch();
    void packagesQuery.refetch();
  };

 

  const zones = useMemo(() => zonesQuery.data?.zones ?? [], [zonesQuery.data]);
  const selected = zones.find((zone) => zone.id === selectedId) ?? null;
  const editing = session !== null;

  const select = useCallback(
    (id: string | null) => {
      params.set({ zone: id ?? undefined });
      setViolationFocus(null);
      setFitToken((token) => token + 1);
    },
    [params],
  );

  const validation = useZoneValidation({
    geometry: editing ? draft : (selected?.geometry?.type === 'Polygon' ? selected.geometry : null),
    type: session?.type ?? selected?.type ?? 'CITY',
    zones,
    ...(session?.zoneId == null ? {} : { excludeZoneId: session.zoneId }),
    enabled: editing,
  });

  const create = useCreateZone((zone) => {
    setSession(null);
    setDraft(null);
    select(zone.id);
    setFitToken((token) => token + 1);
  });
  const updateMetadata = useUpdateZoneMetadata();
  const updateGeometry = useUpdateZoneGeometry((zone) => {
    setSession(null);
    setDraft(null);
    // Geometry saves overwrite the zone in place; re-select to refresh the view.
    select(zone.id);
    setFitToken((token) => token + 1);
  });

  const activeZones = useMemo(
    () => zones.filter((z) => z.status === 'ACTIVE' || z.is_active === true),
    [zones],
  );

  const totalAreaKm2 = useMemo(() => {
    return activeZones.reduce((acc, curr) => {
      try {
        if (curr.geometry?.type === 'Polygon') {
          return acc + zoneStats(curr.geometry).areaKm2;
        }
      } catch {
        // ignore invalid geometry
      }
      return acc;
    }, 0);
  }, [activeZones]);

  const activeCityZone = useMemo(
    () => activeZones.find((z) => z.type === 'CITY') ?? activeZones[0],
    [activeZones],
  );

  const destinationBufferDisplay =
    activeCityZone?.bufferDistanceM != null
      ? `${activeCityZone.bufferDistanceM} m (${(activeCityZone.bufferDistanceM / 1000).toFixed(1)} km)`
      : '5,000 m (5.0 km)';

  useEffect(() => {
    if (zones.length > 0 && selectedId === null && fitToken === 0) {
      const defaultZone =
        zones.find((z) => z.status === 'ACTIVE' || z.is_active === true) ?? zones[0];
      if (defaultZone) {
        select(defaultZone.id);
      }
      setFitToken(1);
    }
  }, [zones, selectedId, fitToken, select]);

  const saving = create.isPending || updateGeometry.isPending || updateMetadata.isPending;
  const blocked =
    draft === null ||
    validation.errors.length > 0 ||
    form.name.trim() === '' ||
    form.code.trim() === '';

  /**
   * A new zone starts EMPTY, and the admin places the first corner.
   *
   * Nothing is drawn here on purpose: the map goes to crosshair and waits. A previous version
   * of this seeded a starter polygon automatically, which is not what creating a zone means —
   * the boundary is the admin's to place, not something to be handed a guess at and asked to
   * correct. What makes the tracing bearable is the rubber band in `ZoneMap`: once the first
   * corner is down, the next edge follows the cursor, so every click is aimed rather than blind.
   */
  const startCreate = (type: ZoneType): void => {
    select(null);
    setSession({ zoneId: null, type });
    setDraft(null);
    setForm(BLANK_FORM);
  };

  const startEdit = (zone: ZoneDto): void => {
    select(zone.id);
    setSession({ zoneId: zone.id, type: zone.type });
    setDraft(zone.geometry.type === 'Polygon' ? zone.geometry : null);
    setForm(formFor(zone));
    setFitToken((token) => token + 1);
  };

  const cancel = (): void => {
    setSession(null);
    setDraft(null);
    setViolationFocus(null);
  };

  const save = (): void => {
    if (draft === null || session === null) return;

    if (session.zoneId === null) {
      create.mutate({
        type: session.type,
        name: form.name.trim(),
        code: form.code.trim(),
        stateCode: 'WB',
        bufferDistanceM: form.bufferDistanceM ? Number(form.bufferDistanceM) : null,
        geometry: draft,
      });
      return;
    }

    const zone = zones.find((candidate) => candidate.id === session.zoneId);
    if (zone === undefined) return;

    const bufferM = form.bufferDistanceM ? Number(form.bufferDistanceM) : null;
    const metadataChanged =
      form.name.trim() !== zone.name ||
      form.code.trim() !== zone.code ||
      bufferM !== (zone.bufferDistanceM ?? null);

    const commitGeometry = (): void => {
      updateGeometry.mutate(
        { id: zone.id, geometry: draft },
        {
          onError: (error) => {
            if (error instanceof ApiError && (error.code as string) === 'ZONE_ALREADY_SUPERSEDED') cancel();
          },
        },
      );
    };

    if (!metadataChanged) {
      commitGeometry();
      return;
    }

    updateMetadata.mutate(
      {
        id: zone.id,
        patch: {
          name: form.name.trim(),
          code: form.code.trim(),
          bufferDistanceM: bufferM,
        },
      },
      { onSuccess: commitGeometry },
    );
  };

  const exportSelected = (): void => {
    if (selected === null) return;
    void navigator.clipboard.writeText(
      toGeoJsonExport(
        selected.name,
        selected.code,
        selected.geometry.type === 'Polygon' ? selected.geometry : { type: 'Polygon', coordinates: [] },
      ),
    );
  };

  /**
   * The edit session is a full-screen surface (see the `<section>` className). Two things a
   * full-screen surface owes: the page behind it must not scroll, and there must be a keyboard
   * way out. Escape does exactly what Cancel does — discards the draft and drops back to the
   * normal split view. It is deliberately not gated on "mid-trace": abandoning a half-drawn
   * boundary with Escape is the expected thing, and it is the same discard the Cancel button
   * already offers.
   */
  useEffect(() => {
    if (!editing) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !saving) cancel();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
    // `cancel` is a stable closure over setters only; re-subscribing on every `saving` flip is
    // the point — the Escape guard has to see the current value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, saving]);

  const errorState = zonesQuery.isError
    ? toErrorState(zonesQuery.error, () => void zonesQuery.refetch())
    : undefined;

  return (
    <>
      <PageHeader
        title="Zones"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Zones' }]}
        actions={
          <div className="flex items-center gap-2">
            <SegmentedControl
              label="View"
              value={view}
              onValueChange={(next) => params.set({ view: next === 'map' ? undefined : next })}
              segments={[
                { value: 'map', label: 'Map', icon: <MapIcon aria-hidden className="size-3.5" /> },
                { value: 'list', label: 'List', icon: <List aria-hidden className="size-3.5" /> },
              ]}
            />
        
          </div>
        }
      />


      {view === 'list' ? (
        <ZonesTable
          zones={zones}
          loading={zonesQuery.isLoading}
          refetching={zonesQuery.isFetching && !zonesQuery.isLoading}
          error={errorState}
          onSelect={(id) => {
            select(id);
            params.set({ view: undefined });
          }}
        />
      ) : editing ? (
        <div className="fixed inset-0 z-50 bg-surface flex flex-col h-screen w-screen overflow-hidden">
          {/* Top Boundary Editor Studio Header */}
          <header className="h-14 px-4 border-b border-border bg-surface flex items-center justify-between shrink-0 z-20">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                size="sm"
                variant="ghost"
                icon={<ArrowLeft aria-hidden className="size-4" />}
                onClick={cancel}
              >
                Exit Editor
              </Button>
              <div className="h-4 w-px bg-border shrink-0" />
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-bold text-text truncate">
                  {session?.zoneId === null
                    ? 'New City Boundary'
                    : `Editing ${form.name || selected?.name || 'Boundary'}`}
                </span>
                <Badge tone="accent">Boundary Editor</Badge>
                {session && <StatusPill status={session.type} />}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-text-subtle hidden md:inline mr-2">
                Press <kbd className="px-1.5 py-0.5 rounded border border-border bg-surface-muted text-[11px] font-mono">Esc</kbd> to exit
              </span>
              <Button
                size="sm"
                variant="secondary"
                icon={<Upload aria-hidden className="size-3.5" />}
                onClick={() => setImportOpen(true)}
              >
                Import GeoJSON
              </Button>
              <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={save}
                disabled={blocked}
                loading={saving}
              >
                {session?.zoneId === null ? 'Create zone' : 'Save changes'}
              </Button>
            </div>
          </header>

          {/* Studio Workspace: Left Editor Sidebar + Right Map */}
          <div className="flex flex-1 min-h-0 overflow-hidden relative">
            <aside className="w-96 lg:w-[420px] shrink-0 border-r border-border bg-surface flex flex-col h-full overflow-hidden z-10 shadow-sm">
              <div className="flex-1 overflow-y-auto p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <ZoneInspector
                  mode="edit"
                  zone={session?.zoneId == null ? null : selected}
                  type={session?.type ?? selected?.type ?? 'CITY'}
                  form={form}
                  onFormChange={setForm}
                  draft={draft}
                  validation={validation}
                  saving={saving}
                  onEditGeometry={() => selected !== null && startEdit(selected)}
                  onImport={() => setImportOpen(true)}
                  onExport={exportSelected}
                  onDeactivate={() => setDeactivating(selected)}
                  onDelete={() => setDeleting(selected)}
                  onShowOnMap={(geometry) => {
                    setViolationFocus(geometry);
                    setFitToken((token) => token + 1);
                  }}
                  onCancel={cancel}
                  onSave={save}
                />
              </div>
            </aside>

            <main className="flex-1 h-full relative overflow-hidden bg-surface-muted">
              {!hasApiKey ? (
                <MissingKeyNotice />
              ) : (
                <>
                  <ZoneMap
                    zones={zones}
                    selectedId={selectedId}
                    onSelect={select}
                    editing={true}
                    draft={draft}
                    onDraftChange={setDraft}
                    violationGeometry={violationFocus}
                    mapType={mapType}
                    fitToken={fitToken}
                    onMapReady={setMapInstance}
                  />

                  <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
                    <SegmentedControl
                      label="Map type"
                      value={mapType}
                      onValueChange={setMapType}
                      segments={[
                        { value: 'roadmap', label: 'Map' },
                        { value: 'hybrid', label: 'Satellite' },
                        { value: 'terrain', label: 'Terrain' },
                      ]}
                    />
                    <PlaceSearch map={mapInstance} />
                  </div>
                </>
              )}
            </main>
          </div>
        </div>
      ) : (
        <section
          className={cn(
            'bg-surface border border-border-strong rounded-xl shadow-xs overflow-hidden flex flex-col',
            'min-h-[720px] lg:min-h-[780px] xl:min-h-[840px]',
          )}
        >
          {/* A background refetch dims nothing and blanks nothing — the polygon an admin is
              editing must not vanish because a poll came back. */}
          <TopProgressBar active={zonesQuery.isFetching && !zonesQuery.isLoading} />

          {zonesQuery.isLoading ? (
            <div className="flex flex-1">
              <div className="w-96 shrink-0 border-r border-border p-4 flex flex-col gap-3">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-20 rounded-xl" />
                ))}
              </div>
              <Skeleton className="flex-1 min-h-[640px] rounded-none" />
            </div>
          ) : errorState !== undefined ? (
            <div className="p-6">
              <ErrorState {...errorState} />
            </div>
          ) : (
            <div className="flex flex-1 min-h-0 min-h-[640px] lg:min-h-[700px] xl:min-h-[760px]">
              {/* The rail is the accessible path through this screen: every zone by name */}
              <div className="w-96 shrink-0 border-r border-border bg-surface flex flex-col">
                <ZoneRail
                  zones={zones}
                  packages={packagesQuery.data}
                  selectedId={selectedId}
                  onSelect={select}
                  onEditGeometry={startEdit}
                  onCreate={startCreate}
                  busy={editing}
                />
              </div>

              <div className="flex-1 flex flex-col min-w-0">
                <div className="relative flex-1 min-h-[480px] lg:min-h-[560px] xl:min-h-[620px]">
                  {!hasApiKey ? (
                    <MissingKeyNotice />
                  ) : (
                    <>
                      <ZoneMap
                        zones={zones}
                        selectedId={selectedId}
                        onSelect={select}
                        editing={false}
                        draft={null}
                        onDraftChange={setDraft}
                        violationGeometry={violationFocus}
                        mapType={mapType}
                        fitToken={fitToken}
                        onMapReady={setMapInstance}
                      />

                      <div className="absolute top-2 left-2 flex items-center gap-2">
                        <SegmentedControl
                          label="Map type"
                          value={mapType}
                          onValueChange={setMapType}
                          segments={[
                            { value: 'roadmap', label: 'Map' },
                            { value: 'hybrid', label: 'Satellite' },
                            { value: 'terrain', label: 'Terrain' },
                          ]}
                        />
                        <PlaceSearch map={mapInstance} />
                      </div>
                    </>
                  )}
                </div>

                <div className="border-t border-border">
                  <ZoneInspector
                    mode="view"
                    zone={selected}
                    type={selected?.type ?? 'CITY'}
                    form={form}
                    onFormChange={setForm}
                    draft={selected?.geometry?.type === 'Polygon' ? selected.geometry : null}
                    validation={validation}
                    saving={saving}
                    onEditGeometry={() => selected !== null && startEdit(selected)}
                    onImport={() => setImportOpen(true)}
                    onExport={exportSelected}
                    onDeactivate={() => setDeactivating(selected)}
                    onDelete={() => setDeleting(selected)}
                    onShowOnMap={(geometry) => {
                      setViolationFocus(geometry);
                      setFitToken((token) => token + 1);
                    }}
                    onCancel={cancel}
                    onSave={save}
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <GeoJsonImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={(polygon) => {
          // Importing outside an edit session starts one, so a paste is never a change the
          // admin cannot see before it is saved.
          if (session === null && selected !== null) startEdit(selected);
          setDraft(polygon);
          setFitToken((token) => token + 1);
        }}
      />

      <DeactivateZoneDialog
        zone={deactivating}
        onOpenChange={(open) => !open && setDeactivating(null)}
        onDeactivated={() => select(null)}
      />

      <DeleteZoneDialog
        zone={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={() => select(null)}
      />

      <AdminLoginDialog
        isOpen={isAuthOpen}
        onClose={adminPhone ? () => setIsAuthOpen(false) : undefined}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
}

/**
 * No API key. A blank grey rectangle would read as a broken map — this says which variable is
 * missing and what it needs, because the person hitting it is a developer on a fresh checkout,
 * not an admin.
 *
 * The rest of the screen keeps working: the rail lists every zone, the inspector shows its
 * metadata and area, and the List view is entirely unaffected. Only drawing needs the map.
 */
function MissingKeyNotice() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-surface-muted p-6">
      <div className="max-w-sm text-center flex flex-col gap-2">
        <p className="text-sm font-medium text-text">The map needs an API key</p>
        <p className="text-xs text-text-subtle">
          Set <code className="text-text">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> and rebuild — it is
          inlined at build time, so a restart alone will not pick it up. Restrict the key by HTTP
          referrer and to the Maps JavaScript and Places APIs before deploying it.
        </p>
        <p className="text-xs text-text-subtle">
          Everything else on this screen works without it, except drawing a boundary.
        </p>
      </div>
    </div>
  );
}
