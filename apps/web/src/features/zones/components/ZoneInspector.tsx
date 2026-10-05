'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  MapPin,
  Pencil,
  Power,
  Trash2,
  Upload,
} from 'lucide-react';
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
 * In Cabzonee, a zone is a CITY: the metropolitan/municipal boundary and its fallback
 * distance buffer. Multiple active CITY zones can coexist; any point inside one resolves
 * to that city.
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
  onEditGeometry: () => void;
  onImport: () => void;
  onExport: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
  onShowOnMap: (geometry: Polygon) => void;
  onCancel: () => void;
  onSave: () => void;
}

export function ZoneInspector(props: ZoneInspectorProps) {
  const { mode, zone, type } = props;
  const [collapsed, setCollapsed] = useState(false);

  if (mode === 'view' && zone === null) {
    return (
      <div className="p-4 flex items-center justify-between text-xs text-text-subtle bg-surface-muted/40">
        <span>Select an operational zone from the sidebar list or click one on the map to inspect boundary dimensions, vertex points, and tariff associations.</span>
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
  onDelete,
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
        <Button
          size="sm"
          variant="ghost"
          className={`text-danger${zone.is_active ? '' : ' ml-auto'}`}
          icon={<Trash2 aria-hidden className="size-3.5" />}
          onClick={onDelete}
        >
          Delete
        </Button>
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
  onImport,
  onShowOnMap,
  onCancel,
  onSave,
}: ZoneInspectorProps) {
  const creating = zone === null;
  const set = <K extends keyof ZoneForm>(key: K, value: ZoneForm[K]): void =>
    onFormChange({ ...form, [key]: value });

  // Save is blocked on an ERROR or missing fields.
  const blocked =
    draft === null ||
    validation.errors.length > 0 ||
    form.name.trim() === '' ||
    form.code.trim() === '';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <FormField label="Zone Name" required hint="Display name for operational city">
          {({ id, invalid }) => (
            <Input
              id={id}
              invalid={invalid}
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="e.g. Siliguri City"
            />
          )}
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Zone Code" required hint="Unique ID">
            {({ id, invalid, describedBy }) => (
              <Input
                id={id}
                invalid={invalid}
                aria-describedby={describedBy}
                value={form.code}
                onChange={(event) => set('code', event.target.value.toUpperCase())}
                placeholder="SLG-MAIN"
              />
            )}
          </FormField>

          {type === 'CITY' ? (
            <FormField label="Buffer (m)" hint="In-city corridor">
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
          ) : (
            <div />
          )}
        </div>
      </div>

      {/* Geometry Stats Card */}
      <div className="grid grid-cols-2 gap-2 p-3 bg-surface-muted/60 border border-border rounded-xl">
        <div className="flex flex-col">
          <span className="text-[11px] text-text-subtle font-medium uppercase tracking-wider">Calculated Area</span>
          <span className="text-sm font-bold font-mono text-text">{validation.areaKm2.toFixed(2)} km²</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] text-text-subtle font-medium uppercase tracking-wider">Boundary Vertices</span>
          <span className="text-sm font-bold font-mono text-text">{validation.vertexCount} points</span>
        </div>
      </div>

      {/* Boundary Editor Guidance */}
      <div className="rounded-xl border border-border bg-surface-muted/30 p-3 text-xs text-text-subtle flex flex-col gap-1">
        <span className="font-semibold text-text flex items-center gap-1.5">
          <MapPin className="size-3.5 text-interactive" /> Boundary Tracing Guide
        </span>
        <p className="text-[11px] leading-relaxed">
          Drag white vertex points on the map to adjust the perimeter. Click ghost midpoints to insert new vertices.
        </p>
      </div>

      {/* GeoJSON Import Action */}
      <Button
        size="sm"
        variant="secondary"
        className="w-full justify-center rounded-xl"
        icon={<Upload aria-hidden className="size-3.5" />}
        onClick={onImport}
      >
        Import GeoJSON Boundary
      </Button>

      {/* Violations or Valid State */}
      {validation.violations.length === 0 && draft !== null && (
        <div className="rounded-xl p-3 bg-success-muted/30 border border-success/30 text-xs text-success flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>Boundary geometry is topologically sound with no self-intersections.</span>
        </div>
      )}

      <ZoneViolations
        violations={validation.violations}
        confirming={validation.confirming}
        empty={draft === null}
        onShowOnMap={onShowOnMap}
      />

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-border mt-auto">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={onSave}
          disabled={blocked}
          loading={saving}
          className="px-4"
        >
          {creating ? 'Create zone' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
