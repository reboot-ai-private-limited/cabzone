'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, ArrowUpRight, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import type { IncityPackageDto, ZoneDto, ZoneType } from '@cabzone/contracts';
import { zoneStats } from '@cabzone/geo';
import { Badge, Button, cn } from '@cabzone/design-system';
import { packagesForZone } from '../hooks/useIncityPackages';

/**
 * The zone rail aligns with docs/LLD/zones.md:
 * - CITY: Operational geographic/pricing boundary & destination buffer. Multiple active
 *   CITY zones can coexist; any point inside one resolves to that city.
 */

export interface ZoneRailProps {
  zones: ZoneDto[];
  packages: IncityPackageDto[] | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEditGeometry: (zone: ZoneDto) => void;
  onCreate: (type: ZoneType) => void;
  busy: boolean;
}

export function ZoneRail({
  zones,
  packages,
  selectedId,
  onSelect,
  onEditGeometry,
  onCreate,
  busy,
}: ZoneRailProps) {
  const active = zones.filter((zone) => zone.status === 'ACTIVE' || zone.is_active === true);
  const cities = active.filter((zone) => zone.type === 'CITY');

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <SectionLabel>
          Operational Cities · <span className="tabular-nums font-mono">{cities.length}</span>
        </SectionLabel>
      </div>

      {cities.length === 0 ? (
        <p className="text-xs text-text-subtle border border-border rounded-xl p-4 bg-surface-muted/40">
          No active city boundary configured. Pickups establish origin city when inside a CITY polygon.
        </p>
      ) : (
        cities.map((city) => (
          <CityCard
            key={city.id}
            city={city}
            packages={packages}
            selected={city.id === selectedId}
            onSelect={onSelect}
            onEditGeometry={onEditGeometry}
          />
        ))
      )}

      <Button
        size="md"
        variant="primary"
        icon={<Plus aria-hidden className="size-4" />}
        onClick={() => onCreate('CITY')}
        disabled={busy}
        className="w-full justify-center rounded-xl bg-interactive hover:bg-interactive-hover text-white py-2 font-semibold shadow-xs mt-1"
      >
        Add city boundary
      </Button>
    </div>
  );
}

function CityCard({
  city,
  packages,
  selected,
  onSelect,
  onEditGeometry,
}: {
  city: ZoneDto;
  packages: IncityPackageDto[] | undefined;
  selected: boolean;
  onSelect: (id: string) => void;
  onEditGeometry: (zone: ZoneDto) => void;
}) {
  const stats = zoneStats(city.geometry);
  const selling = packagesForZone(packages, city.id).filter((pkg) => pkg.is_active);

  return (
    <section
      className={cn(
        'border rounded-xl p-4 flex flex-col gap-3 text-left transition-all',
        selected
          ? 'border-2 border-interactive bg-surface-muted/50 shadow-sm'
          : 'border-border-strong bg-surface hover:border-interactive/50',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(city.id)}
        className="flex items-start justify-between gap-2 text-left w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive group"
      >
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-text group-hover:text-interactive truncate transition-colors">
              {city.name}
            </span>
            <Badge tone="success">Active</Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-subtle font-mono">
            <span className="bg-surface-sunken px-2 py-0.5 rounded border border-border">
              {city.code}
            </span>
            <span className="font-semibold text-text">{stats.areaKm2.toFixed(1)} km²</span>
          </div>
        </div>
      </button>

      <div className="border-t border-border pt-2.5 flex flex-col gap-2 text-xs text-text-subtle">
        <div className="flex items-center justify-between">
          <span className="font-medium">Destination Buffer</span>
          <span className="font-mono text-text font-semibold">
            {city.bufferDistanceM != null ? `${city.bufferDistanceM} m` : '20 km (default)'}
          </span>
        </div>

        {packages === undefined ? null : selling.length === 0 ? (
          <p className="flex items-start gap-1.5 text-xs text-warning pt-0.5">
            <AlertTriangle aria-hidden className="size-3.5 shrink-0 mt-0.5" />
            No active package sells against this city.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 pt-0.5">
            {selling.map((pkg) => (
              <li key={pkg.id}>
                <Link
                  href="/packages"
                  className="inline-flex items-center gap-1 text-xs text-interactive hover:text-interactive-hover hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {pkg.name}
                  <ArrowUpRight aria-hidden className="size-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pt-1 flex items-center justify-between">
        <Button
          size="sm"
          variant="secondary"
          icon={<Pencil aria-hidden className="size-3.5" />}
          onClick={(e) => {
            e.stopPropagation();
            onEditGeometry(city);
          }}
          className="w-full justify-center rounded-lg"
        >
          Edit boundary
        </Button>
      </div>
    </section>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">{children}</h3>
  );
}
