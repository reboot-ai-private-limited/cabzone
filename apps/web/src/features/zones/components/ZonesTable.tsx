'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, MoreHorizontal, Pencil, PowerOff, Trash2 } from 'lucide-react';
import type { ZoneDto, ZoneType } from '@cabzone/contracts';
/**
 * The SAME function the API reports `stats` from on POST /admin/zones/validate. Area and
 * vertex count are computed in the browser rather than fetched, and cannot disagree with the
 * server because it is not a second implementation — it is the same one.
 */
import { zoneStats } from '@cabzone/geo';
import {
  Badge,
  Button,
  CellStack,
  DataState,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FilterBar,
  FilterField,
  Pagination,
  SearchInput,
  Select,
  SkeletonTable,
  StatusPill,
  type Column,
  type ErrorStateProps,
  type SortState,
} from '@cabzone/design-system';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { SEARCH_DEBOUNCE_MS } from '@/lib/hooks/timing';

/**
 * The LIST view — the second of the two views on this screen, and not the default.
 *
 * The map answers "what does our coverage look like". This answers "show me every polygon that
 * ever existed", which is a genuinely different question and one a map is bad at: superseded
 * versions stack invisibly on top of each other, and an inactive zone has no useful position on
 * a map of what is live.
 *
 * So this is the audit surface. It is also why the table was the wrong DEFAULT rather than
 * simply wrong: sorting seven zones by area is a real thing to want, occasionally, and it tells
 * you nothing about whether the city has pickup coverage.
 */

const PAGE_SIZE = 15;

/** The skeleton uses the SAME widths as the columns, so nothing shifts when the data lands. */
const COLUMN_WIDTHS = ['w-72', 'w-32', 'w-28', 'w-24', 'w-20', 'w-24', 'w-16'];

type FilterKey = 'q' | 'type' | 'page' | 'sort' | 'dir';

export interface ZonesTableProps {
  zones: ZoneDto[];
  loading: boolean;
  refetching: boolean;
  error: ErrorStateProps | undefined;
  onSelect: (id: string) => void;
  onEdit: (zone: ZoneDto) => void;
  onDeactivate: (zone: ZoneDto) => void;
  onDelete: (zone: ZoneDto) => void;
}

export function ZonesTable({
  zones,
  loading,
  refetching,
  error,
  onSelect,
  onEdit,
  onDeactivate,
  onDelete,
}: ZonesTableProps) {
  const params = useFilterParams<FilterKey>();

  /**
   * The search box is the one control with two values: what the admin has typed, which must
   * appear instantly, and what the view is filtered by, which lags by `SEARCH_DEBOUNCE_MS`.
   * Driving the input straight off the URL would make it lag too, and a text field that echoes
   * a quarter of a second late feels broken in a way no amount of correctness makes up for.
   */
  const [typed, setTyped] = useState(() => params.get('q') ?? '');
  const search = useDebouncedValue(typed, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    // The guard is what stops this looping: writing the URL re-renders, which re-runs the
    // effect, which now finds nothing to do.
    if (search !== (params.get('q') ?? '')) params.set({ q: search || undefined, page: undefined });
  }, [search, params]);

  const type = (params.get('type') || 'ALL') as 'ALL' | ZoneType;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const sortKey = params.get('sort') || 'name';
  const sortDir = params.get('dir') === 'desc' ? 'desc' : 'asc';
  // Memoised, not built inline: a fresh object every render would make the sort dependency of
  // the filtering memo below change every render, and re-sort the whole list on each one.
  const sort = useMemo<SortState>(() => ({ key: sortKey, direction: sortDir }), [sortKey, sortDir]);

  /**
   * Filtering, sorting and paging happen in the browser because `GET /admin/zones` returns the
   * whole set — there is no page parameter in `ListZonesQuery`, and there should not be yet:
   * a city has tens of zones, not thousands. When that stops being true this moves server-side
   * and the component's props do not change.
   */
  const filtered = useMemo(() => {
    const needle = (search ?? '').trim().toLowerCase();

    const matching = zones.filter(
      (zone) =>
        (type === 'ALL' || zone.type === type) &&
        (needle === '' ||
          zone.name.toLowerCase().includes(needle) ||
          zone.code.toLowerCase().includes(needle)),
    );

    return [...matching].sort((a, b) => {
      const direction = sort.direction === 'asc' ? 1 : -1;
      if (sort.key === 'area')
        return (zoneStats(a.geometry).areaKm2 - zoneStats(b.geometry).areaKm2) * direction;
      if (sort.key === 'type') return a.type.localeCompare(b.type) * direction;
      return a.name.localeCompare(b.name) * direction;
    });
  }, [zones, search, type, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<ZoneDto>[] = [
    {
      key: 'name',
      header: 'Zone',
      width: COLUMN_WIDTHS[0] ?? '',
      sortable: true,
      render: (zone) => <CellStack primary={zone.name} secondary={zone.code} />,
    },
    {
      key: 'type',
      header: 'Type',
      width: COLUMN_WIDTHS[1] ?? '',
      sortable: true,
      render: (zone) => <StatusPill status={zone.type} />,
    },
    {
      key: 'area',
      header: 'Area',
      width: COLUMN_WIDTHS[2] ?? '',
      align: 'right',
      numeric: true,
      sortable: true,
      render: (zone) => `${zoneStats(zone.geometry).areaKm2.toFixed(1)} km²`,
    },
    {
      key: 'vertices',
      header: 'Vertices',
      width: COLUMN_WIDTHS[3] ?? '',
      align: 'right',
      numeric: true,
      render: (zone) => zoneStats(zone.geometry).vertexCount,
    },
    {
      key: 'active',
      header: 'Status',
      width: COLUMN_WIDTHS[4] ?? '',
      render: (zone) => (
        <Badge tone={zone.is_active ? 'success' : 'neutral'}>
          {zone.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: COLUMN_WIDTHS[5] ?? '',
      align: 'right',
      render: (zone) => (
        /**
         * Stop propagation so clicking inside the menu does not also trigger onRowClick,
         * which would select the zone and switch to the map view.
         */
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Actions for ${zone.name}`}
                icon={<MoreHorizontal aria-hidden className="size-4" />}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                icon={<Pencil aria-hidden className="size-3.5" />}
                onSelect={() => onEdit(zone)}
              >
                Edit
              </DropdownMenuItem>
              {zone.is_active && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    icon={<PowerOff aria-hidden className="size-3.5" />}
                    onSelect={() => onDeactivate(zone)}
                  >
                    Deactivate
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                icon={<Trash2 aria-hidden className="size-3.5" />}
                destructive
                onSelect={() => onDelete(zone)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <>
      <FilterBar>
        <FilterField label="Search" className="flex-1 min-w-64">
          <SearchInput value={typed ?? ''} onChange={setTyped} placeholder="Search by name or code" />
        </FilterField>
        <FilterField label="Type">
          <Select
            value={type}
            onValueChange={(value) => {
              // A filter change resets the page. Page 4 of the old result set is usually past
              // the end of the new one, and an empty table reads as "no zones" rather than
              // "you are past the end".
              params.set({ type: value === 'ALL' ? undefined : value, page: undefined });
            }}
            options={[
              { value: 'ALL', label: 'All types' },
              { value: 'CITY', label: 'City' },
            ]}
          />
        </FilterField>
      </FilterBar>

      <section className="bg-surface border border-border rounded-md overflow-hidden">
        <DataState
          loading={loading}
          error={error}
          empty={filtered.length === 0}
          emptyState={{
            icon: <Building2 aria-hidden className="size-6" />,
            title: zones.length === 0 ? 'No zones yet' : 'No zones match those filters',
            description:
              zones.length === 0
                ? 'Configure an operational city boundary to establish the origin city.'
                : 'Try a different type, or clear the search.',
          }}
          skeleton={<SkeletonTable rows={10} columns={COLUMN_WIDTHS} />}
        >
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(zone) => zone.id}
            sort={sort}
            onSortChange={(next) =>
              params.set({ sort: next.key, dir: next.direction, page: undefined })
            }
            onRowClick={(zone) => onSelect(zone.id)}
            refetching={refetching}
          />
          <Pagination
            page={page}
            pageCount={pageCount}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={(next) => params.set({ page: next === 1 ? undefined : String(next) })}
          />
        </DataState>
      </section>
    </>
  );
}
