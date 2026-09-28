'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Download, Pencil, Power, Upload } from 'lucide-react';
import type { ZoneDto, ZoneType } from '@cabzone/contracts';
import type { Polygon } from '@cabzone/geo';
import {
  Badge,
  Button,
  DefinitionList,
  FieldRow,
  FormField,
  Input,
  StatusPill,
  cn,
} from '@cabzone/design-system';
import type { ZoneValidation } from '../hooks/useZoneValidation';
import { ZoneViolations } from './ZoneViolations';

/**
 * The panel under the map: what this zone is, and — in edit mode — what it is becoming.
 *
 * In Cabzone, zones represent geographic operational control:
 * - CITY: Metropolitan / municipal boundary and fallback distance buffer
 * - PICKUP: Serviceability gate for active ride dispatch
 * - EXCLUSION: Prohibited geographic area where pickups and drops are refused
 */

export interface ZoneForm {
  name: string;
  code: string;
  bufferDistanceM?: string;
}

export interface ZoneInspectorProps {
  mode: 'view' | 'edit';
  /** `null` while creating — there is no saved zone behind the form yet. */
  zone: ZoneDto | null;
  type: ZoneType;
  form: ZoneForm;
  onFormChange: (form: ZoneForm) => void;
  draft: Polygon | null;
  validation: ZoneValidation;
  saving: boolean;
  hasParentCity?: boolean;
  onEditGeometry: () => void;
  onImport: () => void;
  onExport: () => void;
  onDeactivate: () => void;
  onShowOnMap: (geometry: Polygon) => void;
  onCancel: () => void;
  onSave: () => void;
}

export function ZoneInspector(props: ZoneInspectorProps) {
  const { mode, zone, type } = props;
  const [collapsed, setCollapsed] = useState(false);

  if (mode === 'view' && zone === null) {
    return (
      <div className="p-4 text-xs text-text-subtle">
        Select a zone from the sidebar list, or click one on the map.
      </div>
    );
  }

  const isView = mode === 'view';
  const showContent = !isView || !collapsed;

  return (
    <div
      className={cn(
        'flex flex-col p-4 transition-all duration-150',
        isView && collapsed ? 'py-2.5 gap-0' : 'gap-3',
      )}
    >
      <header className="flex items-center justify-between gap-3 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold text-text truncate">
            {mode === 'edit' && zone === null ? `New ${type.toLowerCase()} zone` : zone?.name}
          </h2>
          <StatusPill status={type} />
          {zone !== null && (
            <>
              <Badge tone="neutral">v{zone.version}</Badge>
              {!zone.is_active && <Badge tone="neutral">Inactive</Badge>}
            </>
          )}
        </div>

        {isView && (
          <div className="flex items-center gap-3 shrink-0">
            {collapsed && zone !== null && (
              <span className="text-xs text-text-subtle tabular-nums font-mono">
                {zone.code} · {props.validation.areaKm2.toFixed(1)} km²
              </span>
            )}
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="px-2 py-1 rounded-sm text-text-subtle hover:text-text hover:bg-surface-muted transition-colors flex items-center gap-1.5 text-xs border border-border"
              aria-label={collapsed ? 'Expand details' : 'Collapse details'}
              title={collapsed ? 'Expand inspector' : 'Collapse inspector'}
            >
              <span className="text-xs font-medium">{collapsed ? 'Expand' : 'Collapse'}</span>
              {collapsed ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          </div>
        )}
      </header>

      {showContent && (mode === 'view' ? <ViewBody {...props} /> : <EditBody {...props} />)}
    </div>
  );
}

function ViewBody({
  zone,
  validation,
  onEditGeometry,
  onImport,
  onExport,
  onDeactivate,
}: ZoneInspectorProps) {
  if (zone === null) return null;

  return (
    <>
      <DefinitionList>
        <FieldRow label="Code">{zone.code}</FieldRow>
        <FieldRow label="Area">
          <span className="tabular-nums">{validation.areaKm2.toFixed(2)} km²</span>
        </FieldRow>
        <FieldRow label="Vertices">
          <span className="tabular-nums">{validation.vertexCount}</span>
        </FieldRow>
        {zone.type === 'CITY' && zone.bufferDistanceM != null && (
          <FieldRow label="Fallback buffer">
            <span className="tabular-nums">{zone.bufferDistanceM} m</span>
          </FieldRow>
        )}
      </DefinitionList>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          size="sm"
          icon={<Pencil aria-hidden className="size-3.5" />}
          onClick={onEditGeometry}
        >
          Edit boundary
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Upload aria-hidden className="size-3.5" />}
          onClick={onImport}
        >
          Replace from GeoJSON
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Download aria-hidden className="size-3.5" />}
          onClick={onExport}
        >
          Export
        </Button>
        {zone.is_active && (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger ml-auto"
            icon={<Power aria-hidden className="size-3.5" />}
            onClick={onDeactivate}
          >
            Deactivate
          </Button>
        )}
      </div>
    </>
  );
}

function EditBody({
  zone,
  type,
  form,
  onFormChange,
  draft,
  validation,
  saving,
  hasParentCity = true,
  onImport,
  onShowOnMap,
  onCancel,
  onSave,
}: ZoneInspectorProps) {
  const creating = zone === null;
  const set = <K extends keyof ZoneForm>(key: K, value: ZoneForm[K]): void =>
    onFormChange({ ...form, [key]: value });

  const isMissingCity = creating && type === 'PICKUP' && !hasParentCity;

  // Save is blocked on an ERROR, missing city for pickup, or missing fields.
  const blocked =
    draft === null ||
    validation.errors.length > 0 ||
    form.name.trim() === '' ||
    form.code.trim() === '' ||
    isMissingCity;

  return (
    <>
      {isMissingCity && (
        <div className="p-3 bg-danger/10 border border-danger/30 rounded-sm text-xs text-danger">
          <strong>Missing Parent City:</strong> A PICKUP zone must reference an active CITY zone.
          Please create a City boundary before adding pickup coverage.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Zone Name" required>
          {({ id, invalid }) => (
            <Input
              id={id}
              invalid={invalid}
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder={
                type === 'CITY'
                  ? 'Siliguri City Area'
                  : type === 'PICKUP'
                    ? 'Siliguri Core Pickup'
                    : 'Military Cantonment Exclusion'
              }
            />
          )}
        </FormField>

        <FormField label="Zone Code" required hint="Unique uppercase identifier.">
          {({ id, invalid, describedBy }) => (
            <Input
              id={id}
              invalid={invalid}
              aria-describedby={describedBy}
              value={form.code}
              onChange={(event) => set('code', event.target.value.toUpperCase())}
              placeholder={
                type === 'CITY'
                  ? 'SMC-MAIN'
                  : type === 'PICKUP'
                    ? 'SLG-PICKUP-CORE'
                    : 'SLG-EXCL-ARMY'
              }
            />
          )}
        </FormField>

        {type === 'CITY' && (
          <div className="col-span-2">
            <FormField label="Fallback Buffer Distance (m)" hint="Optional buffer in meters (e.g. 5000)">
              {({ id, invalid }) => (
                <Input
                  id={id}
                  invalid={invalid}
                  type="number"
                  min={0}
                  value={form.bufferDistanceM ?? ''}
                  onChange={(event) => set('bufferDistanceM', event.target.value)}
                  placeholder="5000"
                />
              )}
            </FormField>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-text-subtle tabular-nums pt-1">
        <span>
          Area <span className="text-text font-medium">{validation.areaKm2.toFixed(2)} km²</span>
        </span>
        <span>
          Vertices <span className="text-text font-medium">{validation.vertexCount}</span>
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          icon={<Upload aria-hidden className="size-3.5" />}
          onClick={onImport}
        >
          Import GeoJSON
        </Button>
      </div>

      <ZoneViolations
        violations={validation.violations}
        confirming={validation.confirming}
        empty={draft === null}
        onShowOnMap={onShowOnMap}
      />

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={onSave}
          disabled={blocked}
          loading={saving}
        >
          {creating ? 'Create zone' : 'Save changes'}
        </Button>
      </div>
    </>
  );
}
