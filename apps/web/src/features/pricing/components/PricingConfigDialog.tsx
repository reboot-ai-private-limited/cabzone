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

const INDIAN_STATES = [
  { value: 'WB', label: 'WB - West Bengal' },
  { value: 'SK', label: 'SK - Sikkim' },
  { value: 'BR', label: 'BR - Bihar' },
  { value: 'AS', label: 'AS - Assam' },
  { value: 'JH', label: 'JH - Jharkhand' },
  { value: 'OD', label: 'OD - Odisha' },
  { value: 'UP', label: 'UP - Uttar Pradesh' },
  { value: 'DL', label: 'DL - Delhi' },
  { value: 'MH', label: 'MH - Maharashtra' },
  { value: 'KA', label: 'KA - Karnataka' },
  { value: 'TN', label: 'TN - Tamil Nadu' },
  { value: 'TS', label: 'TS - Telangana' },
  { value: 'GJ', label: 'GJ - Gujarat' },
  { value: 'RJ', label: 'RJ - Rajasthan' },
  { value: 'PB', label: 'PB - Punjab' },
  { value: 'HR', label: 'HR - Haryana' },
  { value: 'HP', label: 'HP - Himachal Pradesh' },
  { value: 'UK', label: 'UK - Uttarakhand' },
  { value: 'MP', label: 'MP - Madhya Pradesh' },
  { value: 'CG', label: 'CG - Chhattisgarh' },
  { value: 'KL', label: 'KL - Kerala' },
  { value: 'AP', label: 'AP - Andhra Pradesh' },
  { value: 'GA', label: 'GA - Goa' },
  { value: 'ML', label: 'ML - Meghalaya' },
  { value: 'MN', label: 'MN - Manipur' },
  { value: 'TR', label: 'TR - Tripura' },
  { value: 'MZ', label: 'MZ - Mizoram' },
  { value: 'NL', label: 'NL - Nagaland' },
  { value: 'AR', label: 'AR - Arunachal Pradesh' },
  { value: 'JK', label: 'JK - Jammu & Kashmir' },
  { value: 'LA', label: 'LA - Ladakh' },
];

function defaultsFor(config: PricingConfigDto | null | undefined) {
  const level = (config?.level ?? (config?.stateCode ? 'STATE' : config?.cityZoneId ? 'CITY' : 'GLOBAL')) as 'GLOBAL' | 'STATE' | 'CITY';
  return {
    pricingLevel: level,
    cityZoneId: config?.cityZoneId ?? '',
    stateCode: config?.stateCode ?? 'WB',
    vehicleType: (config?.vehicleType ?? 'CAB') as VehicleCategory,
    baseFareRupees: config ? config.baseFarePaise / 100 : 50,
    ratePerKmRupees: config ? config.ratePerKmPaise / 100 : 15,
    minimumFareRupees: config ? config.minimumFarePaise / 100 : 60,
    outstationBaseFareRupees: config ? config.outstationBaseFarePaise / 100 : 75,
    outstationRatePerKmRupees: config ? config.outstationRatePerKmPaise / 100 : 20,
    outstationMinimumFareRupees: config ? config.outstationMinimumFarePaise / 100 : 150,
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
  const outstationBaseFareInputId = useId();
  const outstationRatePerKmInputId = useId();
  const outstationMinFareInputId = useId();
  const bufferSurchargeInputId = useId();
  const commissionInputId = useId();
  const floorInputId = useId();
  const ceilingInputId = useId();
  const windowInputId = useId();

  const { data: zonesData } = useZones();
  const cityZones: ZoneDto[] = (zonesData?.zones ?? []).filter((z: ZoneDto) => z.type === 'CITY');

  const [pricingLevel, setPricingLevel] = useState<'GLOBAL' | 'STATE' | 'CITY'>('CITY');
  const [cityZoneId, setCityZoneId] = useState<string>('');
  const [stateCode, setStateCode] = useState<string>('WB');
  const [vehicleType, setVehicleType] = useState<VehicleCategory>('CAB');
  const [baseFareRupees, setBaseFareRupees] = useState<number>(50);
  const [ratePerKmRupees, setRatePerKmRupees] = useState<number>(15);
  const [minimumFareRupees, setMinimumFareRupees] = useState<number>(60);
  const [outstationBaseFareRupees, setOutstationBaseFareRupees] = useState<number>(75);
  const [outstationRatePerKmRupees, setOutstationRatePerKmRupees] = useState<number>(20);
  const [outstationMinimumFareRupees, setOutstationMinimumFareRupees] = useState<number>(150);
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
    setPricingLevel(d.pricingLevel);
    setCityZoneId(d.cityZoneId);
    setStateCode(d.stateCode);
    setVehicleType(d.vehicleType);
    setBaseFareRupees(d.baseFareRupees);
    setRatePerKmRupees(d.ratePerKmRupees);
    setMinimumFareRupees(d.minimumFareRupees);
    setOutstationBaseFareRupees(d.outstationBaseFareRupees);
    setOutstationRatePerKmRupees(d.outstationRatePerKmRupees);
    setOutstationMinimumFareRupees(d.outstationMinimumFareRupees);
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
  const outstationBaseFarePaise = Math.round(outstationBaseFareRupees * 100);
  const outstationRatePerKmPaise = Math.round(outstationRatePerKmRupees * 100);
  const outstationMinimumFarePaise = Math.round(outstationMinimumFareRupees * 100);
  const bufferSurchargePaise = Math.round(bufferSurchargeRupees * 100);

  const calcFare = (distKm: number, withBuffer = false) => {
    const distM = distKm * 1000;
    const distFare = Math.round((distM / 1000) * ratePerKmPaise);
    const buf = withBuffer ? bufferSurchargePaise : 0;
    const total = baseFarePaise + distFare + buf;
    return Math.max(minimumFarePaise, total);
  };

  const calcOutstationFare = (distKm: number) => {
    const distM = distKm * 1000;
    const distFare = Math.round((distM / 1000) * outstationRatePerKmPaise);
    const total = outstationBaseFarePaise + distFare;
    return Math.max(outstationMinimumFarePaise, total);
  };

  const sample5km = calcFare(5);
  const sample15km = calcFare(15);
  const sample15kmBuffer = calcFare(15, true);
  const sample50kmOutstation = calcOutstationFare(50);

  const floor5km = Math.max(minimumFarePaise, Math.round((sample5km * negotiationFloorPercent) / 100));
  const ceiling5km = Math.round((sample5km * negotiationCeilingPercent) / 100);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (minimumFarePaise < baseFarePaise) {
      setValidationError('City minimum fare cannot be less than city base fare.');
      return;
    }

    if (outstationMinimumFarePaise < outstationBaseFarePaise) {
      setValidationError('Outstation minimum fare cannot be less than outstation base fare.');
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
          stateCode: pricingLevel === 'STATE' ? stateCode : undefined,
          baseFarePaise,
          ratePerKmPaise,
          minimumFarePaise,
          outstationBaseFarePaise,
          outstationRatePerKmPaise,
          outstationMinimumFarePaise,
          bufferSurchargePaise,
          negotiationFloorPercent,
          negotiationCeilingPercent,
          negotiationWindowSeconds,
          commissionPercent,
          status,
        },
      });
      return;
    }

    if (pricingLevel === 'CITY') {
      const selectedZone = cityZoneId || (cityZones[0]?.id ?? '');
      if (!selectedZone) {
        setValidationError('Please select or specify a City Zone.');
        return;
      }

      createMutation.mutate({
        level: 'CITY',
        cityZoneId: selectedZone,
        stateCode: null,
        vehicleType,
        baseFarePaise,
        ratePerKmPaise,
        minimumFarePaise,
        outstationBaseFarePaise,
        outstationRatePerKmPaise,
        outstationMinimumFarePaise,
        bufferSurchargePaise,
        negotiationFloorPercent,
        negotiationCeilingPercent,
        negotiationWindowSeconds,
        commissionPercent,
        status,
      });
    } else if (pricingLevel === 'STATE') {
      if (!stateCode) {
        setValidationError('Please select a State.');
        return;
      }

      createMutation.mutate({
        level: 'STATE',
        cityZoneId: null,
        stateCode,
        vehicleType,
        baseFarePaise,
        ratePerKmPaise,
        minimumFarePaise,
        outstationBaseFarePaise,
        outstationRatePerKmPaise,
        outstationMinimumFarePaise,
        bufferSurchargePaise,
        negotiationFloorPercent,
        negotiationCeilingPercent,
        negotiationWindowSeconds,
        commissionPercent,
        status,
      });
    } else {
      createMutation.mutate({
        level: 'GLOBAL',
        cityZoneId: null,
        stateCode: null,
        vehicleType,
        baseFarePaise,
        ratePerKmPaise,
        minimumFarePaise,
        outstationBaseFarePaise,
        outstationRatePerKmPaise,
        outstationMinimumFarePaise,
        bufferSurchargePaise,
        negotiationFloorPercent,
        negotiationCeilingPercent,
        negotiationWindowSeconds,
        commissionPercent,
        status,
      });
    }
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
      title={
        isEditing
          ? `Edit ${
              editingConfig?.level === 'GLOBAL'
                ? 'Global Baseline'
                : editingConfig?.level === 'STATE'
                  ? `${editingConfig.stateName ?? editingConfig.stateCode} State`
                  : 'City'
            } Pricing (${editingConfig?.vehicleType})`
          : 'Create Pricing Configuration'
      }
      description={
        isEditing
          ? 'Adjust fares, outstation parameters, buffer surcharge, negotiation clamps, and status for this rule.'
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

        {/* Scope / Level Selector */}
        <div className="flex flex-col gap-2.5 p-3 rounded-lg bg-surface-muted border border-border">
          <span className="text-xs font-semibold text-text">Pricing Scope / Territory</span>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={isEditing}
              onClick={() => setPricingLevel('GLOBAL')}
              className={`px-3 py-2 text-xs font-semibold rounded-md border text-center transition-colors ${
                pricingLevel === 'GLOBAL'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface hover:bg-border/40 text-text border-border disabled:opacity-60'
              }`}
            >
              🌍 Global Baseline
            </button>
            <button
              type="button"
              disabled={isEditing}
              onClick={() => setPricingLevel('STATE')}
              className={`px-3 py-2 text-xs font-semibold rounded-md border text-center transition-colors ${
                pricingLevel === 'STATE'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface hover:bg-border/40 text-text border-border disabled:opacity-60'
              }`}
            >
              🏛️ State Level
            </button>
            <button
              type="button"
              disabled={isEditing}
              onClick={() => setPricingLevel('CITY')}
              className={`px-3 py-2 text-xs font-semibold rounded-md border text-center transition-colors ${
                pricingLevel === 'CITY'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface hover:bg-border/40 text-text border-border disabled:opacity-60'
              }`}
            >
              🏙️ City Zone
            </button>
          </div>

          {pricingLevel === 'GLOBAL' && (
            <p className="text-[11px] text-text-subtle">
              Global Default: Fallback rate applicable across all of India when no specific State or City override exists.
            </p>
          )}

          {pricingLevel === 'STATE' && (
            <div className="flex flex-col gap-1.5 mt-1">
              <span className="text-xs font-semibold text-text">Select State / Territory</span>
              <Select
                value={stateCode}
                onValueChange={setStateCode}
                options={INDIAN_STATES}
              />
              <p className="text-[11px] text-text-subtle">
                Applies to trips within or originating from this state when outside mapped city zones (e.g. WB, SK).
              </p>
            </div>
          )}

          {pricingLevel === 'CITY' && (
            <div className="flex flex-col gap-1.5 mt-1">
              <span className="text-xs font-semibold text-text">City Zone</span>
              {isEditing ? (
                <div className="text-xs text-text-subtle px-3 py-2 rounded-md bg-surface border border-border">
                  {cityZones.find((z) => z.id === cityZoneId)?.name ?? cityZoneId}
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
                <Input
                  id={cityZoneManualInputId}
                  value={cityZoneId}
                  onChange={(e) => setCityZoneId(e.target.value)}
                  placeholder="e.g. city-slg-1"
                  required
                />
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        <div className="text-xs font-bold text-text-subtle uppercase tracking-wider">
          City Rate Tier (In-City Rides)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        </div>

        <div className="text-xs font-bold text-text-subtle uppercase tracking-wider pt-2 border-t border-border">
          Outstation Rate Tier (Inter-City & Beyond Buffer)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1 text-xs font-semibold text-text">
            <label htmlFor={outstationBaseFareInputId}>Outstation Base Fare (₹)</label>
            <Input
              id={outstationBaseFareInputId}
              type="number"
              min={0}
              step="1"
              value={outstationBaseFareRupees}
              onChange={(e) => setOutstationBaseFareRupees(Number(e.target.value))}
              required
            />
          </div>
          <div className="flex flex-col gap-1 text-xs font-semibold text-text">
            <label htmlFor={outstationRatePerKmInputId}>Outstation Rate / km (₹)</label>
            <Input
              id={outstationRatePerKmInputId}
              type="number"
              min={1}
              step="0.5"
              value={outstationRatePerKmRupees}
              onChange={(e) => setOutstationRatePerKmRupees(Number(e.target.value))}
              required
            />
          </div>
          <div className="flex flex-col gap-1 text-xs font-semibold text-text">
            <label htmlFor={outstationMinFareInputId}>Outstation Min Fare (₹)</label>
            <Input
              id={outstationMinFareInputId}
              type="number"
              min={0}
              step="1"
              value={outstationMinimumFareRupees}
              onChange={(e) => setOutstationMinimumFareRupees(Number(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="text-xs font-bold text-text-subtle uppercase tracking-wider pt-2 border-t border-border">
          Platform Parameters & Clamps
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
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text">{isEditing ? 'Status' : 'Initial State'}</span>
            <Select
              id={statusSelectId}
              value={status}
              onValueChange={(val) => setStatus(val as 'DRAFT' | 'ACTIVE')}
              options={statusOptions}
            />
            {isEditing && (
              <span className="text-[10px] text-text-subtle">
                Active rules take effect immediately for trip quotes in this scope.
              </span>
            )}
          </div>
        </div>

        {/* Live Fare Preview Card */}
        <div className="p-3.5 rounded-md bg-surface-muted border border-border flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-semibold text-text border-b border-border pb-1.5">
            <span>Real-time Fare Projection</span>
            <span className="text-text-subtle font-mono">{vehicleType} category</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 text-xs">
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
              <span className="text-text-subtle">15 km Buffer Ride:</span>
              <span className="font-semibold text-text text-sm font-mono">
                {formatPaise(sample15kmBuffer)}
              </span>
              <span className="text-[11px] text-text-subtle">Includes buffer surcharge</span>
            </div>

            <div className="flex flex-col">
              <span className="text-text-subtle">50 km Outstation Ride:</span>
              <span className="font-semibold text-text text-sm font-mono">
                {formatPaise(sample50kmOutstation)}
              </span>
              <span className="text-[11px] text-text-subtle">Rate: {formatPaise(outstationRatePerKmPaise)}/km</span>
            </div>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
