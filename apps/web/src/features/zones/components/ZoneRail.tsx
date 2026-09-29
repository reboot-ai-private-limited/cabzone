'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, ArrowUpRight, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import type { IncityPackageDto, ZoneDto, ZoneType } from '@cabzone/contracts';
import { zoneStats } from '@cabzone/geo';
import { Button, cn } from '@cabzone/design-system';
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
    <div className="flex flex-col gap-5 overflow-y-auto p-4">
      <div className="flex items-baseline justify-between gap-2">
        <SectionLabel>
          Cities · <span className="tabular-nums">{cities.length}</span>
        </SectionLabel>
      </div>

      {cities.length === 0 ? (
        <p className="text-xs text-text-subtle border border-border rounded-md p-3">
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
        size="sm"
        variant="primary"
        icon={<Plus aria-hidden className="size-3.5" />}
        onClick={() => onCreate('CITY')}
        disabled={busy}
        className="self-start"
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
        'border rounded-md p-3 flex flex-col gap-2 text-left',
        selected ? 'border-interactive bg-surface-muted' : 'border-border',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(city.id)}
        className="text-left flex flex-col gap-0.5"
      >
        <span className="text-sm font-semibold text-text">{city.name}</span>
        <span className="text-xs text-text-subtle tabular-nums">
          {city.code} · {stats.areaKm2.toFixed(1)} km²
        </span>
      </button>

      <div className="border-t border-border pt-2 flex flex-col gap-1.5 text-xs text-text-subtle">
        <div className="flex items-center justify-between">
          <span>Destination buffer</span>
          <span className="font-mono text-text font-medium">
            {city.bufferDistanceM != null ? `${city.bufferDistanceM} m` : '20 km (default)'}
          </span>
        </div>

        {packages === undefined ? null : selling.length === 0 ? (
          <p className="flex items-start gap-1.5 text-xs text-warning pt-1">
            <AlertTriangle aria-hidden className="size-3.5 shrink-0 mt-0.5" />
            No active package sells against this city.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 pt-1">
            {selling.map((pkg) => (
              <li key={pkg.id}>
                <Link
                  href="/packages"
                  className="inline-flex items-center gap-1 text-xs text-interactive hover:text-interactive-hover hover:underline"
                >
                  {pkg.name}
                  <ArrowUpRight aria-hidden className="size-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button
        size="sm"
        icon={<Pencil aria-hidden className="size-3.5" />}
        onClick={() => onEditGeometry(city)}
      >
        Edit boundary
      </Button>
    </section>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">{children}</h3>
  );
}
