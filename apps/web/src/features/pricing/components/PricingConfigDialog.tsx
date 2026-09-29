'use client';

import { useEffect, useId, useState } from 'react';
import type { PricingConfigDto, VehicleCategory, ZoneDto } from '@cabzone/contracts';
import { VEHICLE_CATEGORIES } from '@cabzone/contracts';
import { Button } from '@cabzone/design-system';
import { Dialog } from '@cabzone/design-system';
import { Input } from '@cabzone/design-system';
import { Select } from '@cabzone/design-system';
import { useZones } from '@/features/zones/hooks/useZones.js';
import { formatPaise } from '@/lib/format.js';
import { useCreatePricingConfig, useUpdatePricingConfig } from '../hooks/usePricing.js';

export interface PricingConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this (DRAFT) config instead of creating a new one. */
  editingConfig?: PricingConfigDto | null;
}

function defaultsFor(config: PricingConfigDto | null | undefined) {
  return {
    cityZoneId: config?.cityZoneId ?? '',
    vehicleType: (config?.vehicleType ?? 'CAB') as VehicleCategory,
    baseFareRupees: config ? config.baseFarePaise / 100 : 50,
    ratePerKmRupees: config ? config.ratePerKmPaise / 100 : 15,
    minimumFareRupees: config ? config.minimumFarePaise / 100 : 60,
    includedDistanceKm: config ? config.includedDistanceM / 1000 : 2,
    bufferSurchargeRupees: config ? config.bufferSurchargePaise / 100 : 30,
    negotiationFloorPercent: config?.negotiationFloorPercent ?? 80,
    negotiationCeilingPercent: config?.negotiationCeilingPercent ?? 150,
    negotiationWindowSeconds: config?.negotiationWindowSeconds ?? 90,
    commissionPercent: config?.commissionPercent ?? 8,
    status: (config?.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE') as 'DRAFT' | 'ACTIVE',
  };
}

export function PricingConfigDialog({ open, onOpenChange, editingConfig }: PricingConfigDialogProps) {
  const isEditing = editingConfig != null;

  const cityZoneSelectId = useId();
  const cityZoneManualInputId = useId();
  const vehicleTypeSelectId = useId();
  const statusSelectId = useId();

  const baseFareInputId = useId();
  const ratePerKmInputId = useId();
  const minFareInputId = useId();
  const includedDistInputId = useId();
  const bufferSurchargeInputId = useId();
  const commissionInputId = useId();
  const floorInputId = useId();
  const ceilingInputId = useId();
  const windowInputId = useId();

  const { data: zonesData } = useZones();
  const cityZones: ZoneDto[] = (zonesData?.zones ?? []).filter((z: ZoneDto) => z.type === 'CITY');

  const [cityZoneId, setCityZoneId] = useState<string>('');
  const [vehicleType, setVehicleType] = useState<VehicleCategory>('CAB');
  const [baseFareRupees, setBaseFareRupees] = useState<number>(50);
  const [ratePerKmRupees, setRatePerKmRupees] = useState<number>(15);
  const [minimumFareRupees, setMinimumFareRupees] = useState<number>(60);
  const [includedDistanceKm, setIncludedDistanceKm] = useState<number>(2);
  const [bufferSurchargeRupees, setBufferSurchargeRupees] = useState<number>(30);
  const [negotiationFloorPercent, setNegotiationFloorPercent] = useState<number>(80);
  const [negotiationCeilingPercent, setNegotiationCeilingPercent] = useState<number>(150);
  const [negotiationWindowSeconds, setNegotiationWindowSeconds] = useState<number>(90);
  const [commissionPercent, setCommissionPercent] = useState<number>(8);
  const [status, setStatus] = useState<'DRAFT' | 'ACTIVE'>('ACTIVE');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Re-seed the form whenever the dialog opens, for both create and edit.
  useEffect(() => {
    if (!open) return;
    const d = defaultsFor(editingConfig);
    setCityZoneId(d.cityZoneId);
    setVehicleType(d.vehicleType);
    setBaseFareRupees(d.baseFareRupees);
    setRatePerKmRupees(d.ratePerKmRupees);
    setMinimumFareRupees(d.minimumFareRupees);
    setIncludedDistanceKm(d.includedDistanceKm);
    setBufferSurchargeRupees(d.bufferSurchargeRupees);
    setNegotiationFloorPercent(d.negotiationFloorPercent);
    setNegotiationCeilingPercent(d.negotiationCeilingPercent);
    setNegotiationWindowSeconds(d.negotiationWindowSeconds);
    setCommissionPercent(d.commissionPercent);
    setStatus(d.status);
    setValidationError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingConfig?.id]);

  const createMutation = useCreatePricingConfig(() => {
    onOpenChange(false);
  });
  const updateMutation = useUpdatePricingConfig(() => {
    onOpenChange(false);
  });
  const saving = isEditing ? updateMutation.isPending : createMutation.isPending;

  // Calculate live preview metrics
  const baseFarePaise = Math.round(baseFareRupees * 100);
  const ratePerKmPaise = Math.round(ratePerKmRupees * 100);
  const minimumFarePaise = Math.round(minimumFareRupees * 100);
  const includedDistanceM = Math.round(includedDistanceKm * 1000);
  const bufferSurchargePaise = Math.round(bufferSurchargeRupees * 100);

  const calcFare = (distKm: number, withBuffer = false) => {
    const distM = distKm * 1000;
    const billableM = Math.max(0, distM - includedDistanceM);
    const distFare = Math.round((billableM / 1000) * ratePerKmPaise);
    const buf = withBuffer ? bufferSurchargePaise : 0;
    const total = baseFarePaise + distFare + buf;
    return Math.max(minimumFarePaise, total);
  };

  const sample5km = calcFare(5);
  const sample15km = calcFare(15);
  const sample15kmBuffer = calcFare(15, true);

  const floor5km = Math.max(minimumFarePaise, Math.round((sample5km * negotiationFloorPercent) / 100));
  const ceiling5km = Math.round((sample5km * negotiationCeilingPercent) / 100);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (minimumFarePaise < baseFarePaise) {
      setValidationError('Minimum fare cannot be less than base fare.');
      return;
    }

    if (negotiationCeilingPercent < negotiationFloorPercent) {
      setValidationError('Negotiation ceiling must be greater than or equal to floor.');
      return;
    }

    if (isEditing && editingConfig) {
      updateMutation.mutate({
        id: editingConfig.id,
        body: {
          baseFarePaise,
          ratePerKmPaise,
          minimumFarePaise,
          includedDistanceM,
          bufferSurchargePaise,
          negotiationFloorPercent,
          negotiationCeilingPercent,
          negotiationWindowSeconds,
          commissionPercent,
        },
      });
      return;
    }

    const selectedZone = cityZoneId || (cityZones[0]?.id ?? '');
    if (!selectedZone) {
      setValidationError('Please select or specify a City Zone.');
      return;
    }

    createMutation.mutate({
      cityZoneId: selectedZone,
      vehicleType,
      baseFarePaise,
      ratePerKmPaise,
      minimumFarePaise,
      includedDistanceM,
      bufferSurchargePaise,
      negotiationFloorPercent,
      negotiationCeilingPercent,
      negotiationWindowSeconds,
      commissionPercent,
      status,
    });
  };

  const zoneOptions = cityZones.map((z: ZoneDto) => ({
    value: z.id,
    label: `${z.name} (${z.code})`,
  }));

  const vehicleOptions = VEHICLE_CATEGORIES.map((v) => ({
    value: v,
    label: v,
  }));

  const statusOptions = [
    { value: 'ACTIVE', label: 'ACTIVE (Publishes immediately & supersedes previous)' },
    { value: 'DRAFT', label: 'DRAFT (Staged rule, inactive until verified)' },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? 'Edit Pricing Configuration' : 'Create Pricing Configuration'}
      description={
        isEditing
          ? 'Adjust fares, buffer surcharge, and negotiation clamps for this rule. Changes overwrite the existing rule.'
          : 'Configure category base fares, distance increments, buffer surcharges, and negotiation clamps.'
      }
      className="max-w-3xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="pricing-config-form"
            variant="primary"
            loading={saving}
          >
            {isEditing ? 'Save Changes' : 'Save Pricing Rule'}
          </Button>
        </>
      }
    >
      <form id="pricing-config-form" onSubmit={handleSubmit} className="flex flex-col gap-5 py-1">
        {validationError && (
          <div className="p-3 text-xs rounded-md bg-danger/10 text-danger border border-danger/20">
            {validationError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text">City Zone</span>
            {isEditing ? (
              <div className="text-xs text-text-subtle px-3 py-2 rounded-md bg-surface-muted border border-border">
                {cityZones.find((z) => z.id === cityZoneId)?.name ?? cityZoneId}
                <span className="block text-[10px] mt-0.5">Fixed on this rule — create a new rule to change it.</span>
              </div>
            ) : zoneOptions.length > 0 ? (
              <Select
                id={cityZoneSelectId}
                value={cityZoneId || (zoneOptions[0]?.value ?? '')}
                onValueChange={setCityZoneId}
                options={zoneOptions}
                placeholder="Select city zone"
              />
            ) : (
              <div className="flex flex-col gap-1 text-xs font-semibold text-text">
                <label htmlFor={cityZoneManualInputId}>City Zone ID</label>
                <Input
                  id={cityZoneManualInputId}
                  value={cityZoneId}
                  onChange={(e) => setCityZoneId(e.target.value)}
                  placeholder="e.g. city-slg-1"
                  required
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text">Vehicle Category</span>
            {isEditing ? (
              <div className="text-xs text-text-subtle px-3 py-2 rounded-md bg-surface-muted border border-border">
                {vehicleType}
                <span className="block text-[10px] mt-0.5">Fixed on this rule.</span>
              </div>
            ) : (
              <Select
                id={vehicleTypeSelectId}
                value={vehicleType}
                onValueChange={(val) => setVehicleType(val as VehicleCategory)}
                options={vehicleOptions}
                placeholder="Select category"
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1 text-xs font-semibold text-text">
            <label htmlFor={baseFareInputId}>Base Fare (₹)</label>
            <Input
              id={baseFareInputId}
              type="number"
              min={0}
              step="1"
              value={baseFareRupees}
              onChange={(e) => setBaseFareRupees(Number(e.target.value))}
              required
            />
          </div>
          <div className="flex flex-col gap-1 text-xs font-semibold text-text">
            <label htmlFor={ratePerKmInputId}>Rate / km (₹)</label>
            <Input
              id={ratePerKmInputId}
              type="number"
              min={1}
              step="0.5"
              value={ratePerKmRupees}
              onChange={(e) => setRatePerKmRupees(Number(e.target.value))}
              required
            />
          </div>
          <div className="flex flex-col gap-1 text-xs font-semibold text-text">
            <label htmlFor={minFareInputId}>Min Fare (₹)</label>
            <Input
              id={minFareInputId}
              type="number"
              min={0}
              step="1"
              value={minimumFareRupees}
              onChange={(e) => setMinimumFareRupees(Number(e.target.value))}
              required
            />
          </div>
          <div className="flex flex-col gap-1 text-xs font-semibold text-text">
            <label htmlFor={includedDistInputId}>Included Dist (km)</label>
            <Input
              id={includedDistInputId}
              type="number"
              min={0}
              step="0.5"
              value={includedDistanceKm}
              onChange={(e) => setIncludedDistanceKm(Number(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1 text-xs font-semibold text-text">
            <label htmlFor={bufferSurchargeInputId}>Buffer Surcharge (₹)</label>
            <Input
              id={bufferSurchargeInputId}
              type="number"
              min={0}
              step="1"
              value={bufferSurchargeRupees}
              onChange={(e) => setBufferSurchargeRupees(Number(e.target.value))}
            />
            <span className="text-[10px] font-normal text-text-subtle">Outside city core</span>
          </div>
          <div className="flex flex-col gap-1 text-xs font-semibold text-text">
            <label htmlFor={commissionInputId}>Commission (%)</label>
            <Input
              id={commissionInputId}
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(Number(e.target.value))}
            />
            <span className="text-[10px] font-normal text-text-subtle">Platform revenue</span>
          </div>
          <div className="flex flex-col gap-1 text-xs font-semibold text-text">
            <label htmlFor={floorInputId}>Floor Clamp (%)</label>
            <Input
              id={floorInputId}
              type="number"
              min={10}
              max={100}
              value={negotiationFloorPercent}
              onChange={(e) => setNegotiationFloorPercent(Number(e.target.value))}
            />
            <span className="text-[10px] font-normal text-text-subtle">Min rider offer %</span>
          </div>
          <div className="flex flex-col gap-1 text-xs font-semibold text-text">
            <label htmlFor={ceilingInputId}>Ceiling Clamp (%)</label>
            <Input
              id={ceilingInputId}
              type="number"
              min={100}
              max={300}
              value={negotiationCeilingPercent}
              onChange={(e) => setNegotiationCeilingPercent(Number(e.target.value))}
            />
            <span className="text-[10px] font-normal text-text-subtle">Max rider offer %</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <div className="flex flex-col gap-1 text-xs font-semibold text-text">
            <label htmlFor={windowInputId}>Negotiation Window (seconds)</label>
            <Input
              id={windowInputId}
              type="number"
              min={15}
              max={300}
              value={negotiationWindowSeconds}
              onChange={(e) => setNegotiationWindowSeconds(Number(e.target.value))}
            />
            <span className="text-[10px] font-normal text-text-subtle">Quote validity duration</span>
          </div>
          {isEditing ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text">Status</span>
              <div className="text-xs text-text-subtle px-3 py-2 rounded-md bg-surface-muted border border-border">
                DRAFT
                <span className="block text-[10px] mt-0.5">Activate it from the table once you&apos;re done editing.</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text">Initial State</span>
              <Select
                id={statusSelectId}
                value={status}
                onValueChange={(val) => setStatus(val as 'DRAFT' | 'ACTIVE')}
                options={statusOptions}
              />
            </div>
          )}
        </div>

        {/* Live Fare Preview Card */}
        <div className="p-3.5 rounded-md bg-surface-muted border border-border flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-semibold text-text border-b border-border pb-1.5">
            <span>Real-time Fare Projection</span>
            <span className="text-text-subtle font-mono">{vehicleType} category</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
            <div className="flex flex-col">
              <span className="text-text-subtle">5 km Standard Ride:</span>
              <span className="font-semibold text-text text-sm font-mono">
                {formatPaise(sample5km)}
              </span>
              <span className="text-[11px] text-text-subtle">
                Allowed range: {formatPaise(floor5km)} – {formatPaise(ceiling5km)}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-text-subtle">15 km City Ride:</span>
              <span className="font-semibold text-text text-sm font-mono">
                {formatPaise(sample15km)}
              </span>
              <span className="text-[11px] text-text-subtle">
                Commission: {formatPaise(Math.round((sample15km * commissionPercent) / 100))}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-text-subtle">15 km with Buffer Surcharge:</span>
              <span className="font-semibold text-text text-sm font-mono">
                {formatPaise(sample15kmBuffer)}
              </span>
              <span className="text-[11px] text-text-subtle">Includes buffer fallback penalty</span>
            </div>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
