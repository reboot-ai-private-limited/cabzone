'use client';

import { useId, useState } from 'react';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import type {
  PricingConfigDto,
  PricingConfigLevel,
  PricingConfigStatus,
  VehicleCategory,
  ZoneDto,
} from '@cabzone/contracts';
import { VEHICLE_CATEGORIES } from '@cabzone/contracts';
import {
  Badge,
  type BadgeTone,
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Select,
} from '@cabzone/design-system';
import { useZones } from '@/features/zones/hooks/useZones.js';
import { formatPaise } from '@/lib/format.js';
import {
  useActivatePricingConfig,
  useDeletePricingConfig,
  usePricingConfigs,
} from '../hooks/usePricing.js';
import { PricingConfigDialog } from './PricingConfigDialog.js';
import { PricingConfigViewDialog } from './PricingConfigViewDialog.js';

const STATUS_TONES: Record<PricingConfigStatus, BadgeTone> = {
  ACTIVE: 'success',
  DRAFT: 'warning',
  RETIRED: 'neutral',
};

export function PricingConfigsTable() {
  const levelFilterId = useId();
  const cityZoneFilterId = useId();
  const vehicleFilterId = useId();
  const statusFilterId = useId();

  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [selectedCityZoneId, setSelectedCityZoneId] = useState<string>('ALL');
  const [selectedVehicleType, setSelectedVehicleType] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const [activatingConfig, setActivatingConfig] = useState<PricingConfigDto | null>(null);
  const [editingConfig, setEditingConfig] = useState<PricingConfigDto | null>(null);
  const [deletingConfig, setDeletingConfig] = useState<PricingConfigDto | null>(null);
  const [viewingConfig, setViewingConfig] = useState<PricingConfigDto | null>(null);

  const { data: zonesData } = useZones();
  const cityZones: ZoneDto[] = (zonesData?.zones ?? []).filter((z: ZoneDto) => z.type === 'CITY');

  const {
    data: configs,
    isLoading,
    isFetching,
  } = usePricingConfigs({
    level: selectedLevel === 'ALL' ? undefined : (selectedLevel as PricingConfigLevel),
    cityZoneId: selectedCityZoneId === 'ALL' ? undefined : selectedCityZoneId,
    vehicleType:
      selectedVehicleType === 'ALL' ? undefined : (selectedVehicleType as VehicleCategory),
    status: selectedStatus === 'ALL' ? undefined : (selectedStatus as PricingConfigStatus),
  });

  const activateMutation = useActivatePricingConfig(() => {
    setActivatingConfig(null);
  });
  const deleteMutation = useDeletePricingConfig(() => {
    setDeletingConfig(null);
  });

  const getCityZoneName = (zoneId: string | null) => {
    if (!zoneId) return '—';
    const found = cityZones.find((z: ZoneDto) => z.id === zoneId);
    return found ? `${found.name} (${found.code})` : zoneId;
  };

  const columns: Column<PricingConfigDto>[] = [
    {
      key: 'scope',
      header: 'Scope / Territory',
      render: (row) => {
        if (row.level === 'GLOBAL' || (!row.cityZoneId && !row.stateCode)) {
          return (
            <div className="flex items-center gap-1.5">
              <Badge tone="neutral">GLOBAL</Badge>
              <span className="text-xs text-text-subtle font-medium">Pan-India Default</span>
            </div>
          );
        }
        if (row.level === 'STATE' || row.stateCode) {
          return (
            <div className="flex items-center gap-1.5">
              <Badge tone="info">STATE</Badge>
              <span className="text-sm font-semibold text-text">
                {row.stateName ? `${row.stateName} (${row.stateCode})` : row.stateCode}
              </span>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-1.5">
            <Badge tone="warning">CITY</Badge>
            <span className="font-semibold text-text text-sm">
              {getCityZoneName(row.cityZoneId)}
            </span>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={STATUS_TONES[row.status]}>{row.status}</Badge>,
    },
    {
      key: 'vehicleType',
      header: 'Vehicle Type',
      render: (row) => (
        <span className="text-sm font-semibold tracking-wide text-text uppercase">
          {row.vehicleType}
        </span>
      ),
    },
    {
      key: 'baseFare',
      header: 'Base Fare',
      numeric: true,
      render: (row) => (
        <span className="font-mono text-sm font-semibold text-text">
          {formatPaise(row.baseFarePaise)}
        </span>
      ),
    },
    {
      key: 'ratePerKm',
      header: 'City Rate',
      numeric: true,
      render: (row) => (
        <span className="font-mono text-sm text-text font-medium whitespace-nowrap">
          {formatPaise(row.ratePerKmPaise)}/km
        </span>
      ),
    },
    {
      key: 'outstationRatePerKm',
      header: 'Outstation Rate',
      numeric: true,
      render: (row) => (
        <span className="font-mono text-sm text-text font-medium whitespace-nowrap">
          {formatPaise(row.outstationRatePerKmPaise)}/km
        </span>
      ),
    },
    {
      key: 'negotiation',
      header: 'Negotiation',
      render: (row) => (
        <span className="text-text font-mono text-sm whitespace-nowrap">
          {row.negotiationFloorPercent}% – {row.negotiationCeilingPercent}%
        </span>
      ),
    },
    {
      key: 'commission',
      header: 'Commission',
      numeric: true,
      render: (row) => (
        <span className="font-mono text-sm font-semibold text-text">{row.commissionPercent}%</span>
      ),
    },
    {
      key: 'cancellation',
      header: 'Cancel Fee',
      numeric: true,
      render: (row) => (
        <div className="flex flex-col items-end whitespace-nowrap">
          <span className="font-mono text-sm font-semibold text-text">
            {formatPaise(row.cancellationFeePaise)}
          </span>
          <span className="text-[11px] font-mono text-text-subtle">
            {row.riderCancellationGraceSeconds}s / {row.driverNoShowWaitSeconds}s
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      render: (row) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Button
            size="sm"
            variant="secondary"
            icon={<Eye aria-hidden className="size-3.5" />}
            onClick={(e) => {
              e.stopPropagation();
              setViewingConfig(row);
            }}
          >
            View
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Pencil aria-hidden className="size-3.5" />}
            onClick={(e) => {
              e.stopPropagation();
              setEditingConfig(row);
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Trash2 aria-hidden className="size-3.5" />}
            onClick={(e) => {
              e.stopPropagation();
              setDeletingConfig(row);
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const levelFilterOptions = [
    { value: 'ALL', label: 'All Scopes' },
    { value: 'GLOBAL', label: '🌍 Global Default' },
    { value: 'STATE', label: '🏛️ State Level' },
    { value: 'CITY', label: '🏙️ City Zone' },
  ];

  const cityZoneFilterOptions = [
    { value: 'ALL', label: 'All City Zones' },
    ...cityZones.map((z: ZoneDto) => ({ value: z.id, label: `${z.name} (${z.code})` })),
  ];

  const vehicleFilterOptions = [
    { value: 'ALL', label: 'All Categories' },
    ...VEHICLE_CATEGORIES.map((v) => ({ value: v, label: v })),
  ];

  const statusFilterOptions = [
    { value: 'ALL', label: 'All Statuses' },
    { value: 'ACTIVE', label: 'Active Only' },
    { value: 'DRAFT', label: 'Draft Only' },
    { value: 'RETIRED', label: 'Retired History' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-5 p-4 rounded-md bg-surface border border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-subtle">Scope:</span>
          <div className="w-48">
            <Select
              id={levelFilterId}
              value={selectedLevel}
              onValueChange={setSelectedLevel}
              options={levelFilterOptions}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-text-subtle">Zone:</span>
          <div className="w-52">
            <Select
              id={cityZoneFilterId}
              value={selectedCityZoneId}
              onValueChange={setSelectedCityZoneId}
              options={cityZoneFilterOptions}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-text-subtle">Category:</span>
          <div className="w-44">
            <Select
              id={vehicleFilterId}
              value={selectedVehicleType}
              onValueChange={setSelectedVehicleType}
              options={vehicleFilterOptions}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-text-subtle">Status:</span>
          <div className="w-44">
            <Select
              id={statusFilterId}
              value={selectedStatus}
              onValueChange={setSelectedStatus}
              options={statusFilterOptions}
            />
          </div>
        </div>
      </div>

      {/* Pricing Rules Table */}
      {configs && configs.length > 0 ? (
        <DataTable
          columns={columns}
          rows={configs}
          rowKey={(r) => r.id}
          refetching={isFetching && !isLoading}
        />
      ) : (
        <EmptyState
          title="No pricing configurations found"
          description="Create a new pricing rule for your city zones to enable live ride fare estimations."
        />
      )}

      {/* Activation Confirm Dialog */}
      {activatingConfig && (
        <ConfirmDialog
          open={Boolean(activatingConfig)}
          onOpenChange={(open) => !open && setActivatingConfig(null)}
          title="Activate Pricing Configuration"
          variant="primary"
          confirmLabel="Activate Rule"
          loading={activateMutation.isPending}
          onConfirm={() => activateMutation.mutate(activatingConfig.id)}
          consequences={[
            `Immediately makes this rule the canonical fare calculator for ${activatingConfig.vehicleType} in ${getCityZoneName(activatingConfig.cityZoneId)}.`,
            'Any previously active rule for this zone and vehicle category will be automatically retired.',
            'All newly requested ride quotes will reflect these updated base, per-km, and cancellation policy rules immediately.',
          ]}
        />
      )}

      {/* View Dialog */}
      <PricingConfigViewDialog
        config={viewingConfig}
        zoneName={viewingConfig ? getCityZoneName(viewingConfig.cityZoneId) : ''}
        onOpenChange={(open) => !open && setViewingConfig(null)}
        onActivate={(c) => {
          setViewingConfig(null);
          setActivatingConfig(c);
        }}
        onEdit={(c) => {
          setViewingConfig(null);
          setEditingConfig(c);
        }}
      />

      {/* Edit Dialog */}
      <PricingConfigDialog
        open={editingConfig !== null}
        onOpenChange={(open) => !open && setEditingConfig(null)}
        editingConfig={editingConfig}
      />

      {/* Delete Confirm Dialog */}
      {deletingConfig && (
        <ConfirmDialog
          open={Boolean(deletingConfig)}
          onOpenChange={(open) => !open && setDeletingConfig(null)}
          title="Delete Pricing Configuration"
          variant="danger"
          confirmLabel="Delete"
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deletingConfig.id)}
          consequences={[
            `Permanently deletes the ${deletingConfig.status.toLowerCase()} rule for ${deletingConfig.vehicleType} in ${getCityZoneName(deletingConfig.cityZoneId)}.`,
            'This cannot be undone.',
          ]}
        />
      )}
    </div>
  );
}
