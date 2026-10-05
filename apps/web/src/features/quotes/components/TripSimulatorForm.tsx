'use client';

import { useState, useEffect } from 'react';
import type { GeoPoint, VehicleCategory } from '@cabzone/contracts';
import { VEHICLE_CATEGORIES, VEHICLE_CATEGORY_REGISTRY } from '@cabzone/contracts';
import { isPointInIndia } from '@cabzone/geo';
import { Button, Input, Select, type SelectOption } from '@cabzone/design-system';
import { AlertTriangle, MapPin, Navigation, Play, RotateCcw } from 'lucide-react';
import { validateCoordinates } from '@/lib/api/endpoints/quotes.js';

export interface TripSimulatorFormProps {
  pickup: GeoPoint | null;
  drop: GeoPoint | null;
  vehicleCategory: VehicleCategory;
  onPickupChange: (point: GeoPoint | null) => void;
  onDropChange: (point: GeoPoint | null) => void;
  onVehicleChange: (cat: VehicleCategory) => void;
  activeTarget: 'pickup' | 'drop' | 'auto';
  onActiveTargetChange: (target: 'pickup' | 'drop' | 'auto') => void;
  onSimulate: () => void;
  loading: boolean;
}

interface Preset {
  label: string;
  pickup: GeoPoint;
  drop: GeoPoint;
  vehicle: VehicleCategory;
  desc: string;
}

const PRESETS: Preset[] = [
  {
    label: 'In-City Trip (Siliguri)',
    pickup: { lat: 26.7141, lng: 88.4334 }, // Siliguri City Center
    drop: { lat: 26.728, lng: 88.425 }, // Siliguri North
    vehicle: 'CAB',
    desc: 'Both points inside Siliguri city zone',
  },
  {
    label: 'Buffer Zone (Drop in Buffer)',
    pickup: { lat: 26.7141, lng: 88.4334 },
    drop: { lat: 26.685, lng: 88.38 }, // ~5km west (within buffer threshold)
    vehicle: 'CAB',
    desc: 'Drop in buffer threshold zone',
  },
  {
    label: 'Outstation Trip (Jalpaiguri)',
    pickup: { lat: 26.7141, lng: 88.4334 },
    drop: { lat: 26.5407, lng: 88.7188 }, // Jalpaiguri (~45km)
    vehicle: 'CAB',
    desc: 'Beyond buffer, intra-state outstation',
  },
  {
    label: 'E-Rickshaw In-City Allowed',
    pickup: { lat: 26.7141, lng: 88.4334 },
    drop: { lat: 26.728, lng: 88.425 },
    vehicle: 'E_RICKSHAW',
    desc: 'E-Rickshaw within city boundary',
  },
  {
    label: 'E-Rickshaw Outstation (Rejection Test)',
    pickup: { lat: 26.7141, lng: 88.4334 },
    drop: { lat: 26.5407, lng: 88.7188 },
    vehicle: 'E_RICKSHAW',
    desc: 'Triggers E_RICKSHAW_CITY_ONLY error',
  },
  {
    label: 'Suburban Pickup (In-City Buffer)',
    pickup: { lat: 26.7271, lng: 88.3953 }, // Matigara (~3.5km from boundary)
    drop: { lat: 26.7141, lng: 88.4334 }, // Siliguri City Center
    vehicle: 'CAB',
    desc: 'Pickup outside boundary, within 20km buffer -> In-City with buffer surcharge',
  },
  {
    label: 'Far Outstation Pickup (>20km WB)',
    pickup: { lat: 26.35, lng: 88.25 }, // ~45km outside Siliguri
    drop: { lat: 26.7141, lng: 88.4334 }, // Siliguri City Center
    vehicle: 'CAB',
    desc: 'Pickup >20km outside zone -> Outstation fare via WB state rate',
  },
  {
    label: 'Interstate Outstation (Siliguri WB -> Kishanganj Bihar)',
    pickup: { lat: 26.7141, lng: 88.4334 }, // Siliguri, WB
    drop: { lat: 26.0984, lng: 87.9482 }, // Kishanganj, Bihar (~95km)
    vehicle: 'CAB',
    desc: 'Crosses state border (WB -> Bihar) -> State distance breakdown (WB + BR)',
  },
  {
    label: 'Sikkim Mountain Outstation (Gangtok Pickup)',
    pickup: { lat: 27.3389, lng: 88.6065 }, // Gangtok, Sikkim
    drop: { lat: 26.7141, lng: 88.4334 }, // Siliguri, WB
    vehicle: 'CAB',
    desc: 'Pickup in Sikkim (SK) -> Prices via Sikkim manual state outstation rate',
  },
  {
    label: 'Foreign Pickup Rejection (Nepal Pickup)',
    pickup: { lat: 26.48, lng: 87.28 }, // Biratnagar, Nepal
    drop: { lat: 26.7141, lng: 88.4334 }, // Siliguri, India
    vehicle: 'CAB',
    desc: 'Pickup in Nepal -> Strictly restricted to Indian sovereign territory',
  },
  {
    label: 'Foreign Drop Rejection (Nepal Drop)',
    pickup: { lat: 26.7141, lng: 88.4334 }, // Siliguri, India
    drop: { lat: 26.48, lng: 87.28 }, // Biratnagar, Nepal
    vehicle: 'CAB',
    desc: 'Drop in Nepal -> Blocked by sovereign Indian territory boundary',
  },
];

export function TripSimulatorForm({
  pickup,
  drop,
  vehicleCategory,
  onPickupChange,
  onDropChange,
  onVehicleChange,
  activeTarget,
  onActiveTargetChange,
  onSimulate,
  loading,
}: TripSimulatorFormProps) {
  // Local string state to allow natural decimal typing without jumping
  const [pickupLatStr, setPickupLatStr] = useState(pickup ? String(pickup.lat) : '');
  const [pickupLngStr, setPickupLngStr] = useState(pickup ? String(pickup.lng) : '');
  const [dropLatStr, setDropLatStr] = useState(drop ? String(drop.lat) : '');
  const [dropLngStr, setDropLngStr] = useState(drop ? String(drop.lng) : '');

  // Keep strings synced when parent coordinates change (e.g. from map clicks or dragging)
  useEffect(() => {
    if (pickup) {
      setPickupLatStr(String(pickup.lat));
      setPickupLngStr(String(pickup.lng));
    } else {
      setPickupLatStr('');
      setPickupLngStr('');
    }
  }, [pickup]);

  useEffect(() => {
    if (drop) {
      setDropLatStr(String(drop.lat));
      setDropLngStr(String(drop.lng));
    } else {
      setDropLatStr('');
      setDropLngStr('');
    }
  }, [drop]);

  const handlePickupLatChange = (val: string) => {
    setPickupLatStr(val);
    const parsedLat = Number(val);
    const parsedLng = Number(pickupLngStr);
    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
      onPickupChange({ lat: parsedLat, lng: parsedLng });
    }
  };

  const handlePickupLngChange = (val: string) => {
    setPickupLngStr(val);
    const parsedLat = Number(pickupLatStr);
    const parsedLng = Number(val);
    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
      onPickupChange({ lat: parsedLat, lng: parsedLng });
    }
  };

  const handleDropLatChange = (val: string) => {
    setDropLatStr(val);
    const parsedLat = Number(val);
    const parsedLng = Number(dropLngStr);
    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
      onDropChange({ lat: parsedLat, lng: parsedLng });
    }
  };

  const handleDropLngChange = (val: string) => {
    setDropLngStr(val);
    const parsedLat = Number(dropLatStr);
    const parsedLng = Number(val);
    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
      onDropChange({ lat: parsedLat, lng: parsedLng });
    }
  };

  const pickupIndiaCheck = pickup ? isPointInIndia(pickup) : null;
  const dropIndiaCheck = drop ? isPointInIndia(drop) : null;

  const isPickupInIndia = pickupIndiaCheck ? pickupIndiaCheck.inside : true;
  const isDropInIndia = dropIndiaCheck ? dropIndiaCheck.inside : true;

  const isPickupValid = pickup !== null && validateCoordinates(pickup) && isPickupInIndia;
  const isDropValid = drop !== null && validateCoordinates(drop) && isDropInIndia;
  const canSimulate = isPickupValid && isDropValid && !loading;

  const vehicleOptions: SelectOption[] = VEHICLE_CATEGORIES.map((cat) => ({
    value: cat,
    label: `${VEHICLE_CATEGORY_REGISTRY[cat]?.displayName ?? cat} (${cat})`,
  }));

  const applyPreset = (preset: Preset) => {
    onPickupChange(preset.pickup);
    onDropChange(preset.drop);
    onVehicleChange(preset.vehicle);
    onActiveTargetChange('auto');
  };

  const handleReset = () => {
    onPickupChange(null);
    onDropChange(null);
    onActiveTargetChange('auto');
  };

  return (
    <div className="flex flex-col gap-5 p-4 bg-surface rounded-lg border border-border">
      {/* Quick Presets */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-subtle">
            Quick Test Scenarios
          </span>
          {(pickup !== null || drop !== null) && (
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-text-subtle hover:text-text flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="size-3" />
              Reset Points
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              title={preset.desc}
              className="text-xs px-2.5 py-1 rounded bg-surface-muted hover:bg-border/60 text-text font-medium transition-colors border border-border"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-4 flex flex-col gap-4">
        {/* Pickup Section */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="size-2 rounded-full bg-success inline-block" />
              <span className="text-xs font-semibold text-text">Pickup Location (P)</span>
              <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded px-1.5 py-0.2">
                🇮🇳 India Only
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={activeTarget === 'pickup' ? 'primary' : 'ghost'}
                onClick={() =>
                  onActiveTargetChange(activeTarget === 'pickup' ? 'auto' : 'pickup')
                }
                icon={<MapPin className="size-3" />}
                className="text-xs h-7 px-2"
              >
                {activeTarget === 'pickup' ? 'Setting on map...' : 'Set on map'}
              </Button>
              {pickup !== null && (
                <button
                  type="button"
                  onClick={() => onPickupChange(null)}
                  className="text-xs text-text-subtle hover:text-danger px-1.5 py-0.5"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] text-text-subtle block mb-1">Latitude</span>
              <Input
                type="number"
                step="any"
                placeholder="e.g. 26.727100"
                value={pickupLatStr}
                onChange={(e) => handlePickupLatChange(e.target.value)}
                invalid={
                  pickupLatStr !== '' &&
                  (isNaN(Number(pickupLatStr)) ||
                    Number(pickupLatStr) < -90 ||
                    Number(pickupLatStr) > 90 ||
                    !isPickupInIndia)
                }
                className="text-xs h-8"
              />
            </div>
            <div>
              <span className="text-[11px] text-text-subtle block mb-1">Longitude</span>
              <Input
                type="number"
                step="any"
                placeholder="e.g. 88.395300"
                value={pickupLngStr}
                onChange={(e) => handlePickupLngChange(e.target.value)}
                invalid={
                  pickupLngStr !== '' &&
                  (isNaN(Number(pickupLngStr)) ||
                    Number(pickupLngStr) < -180 ||
                    Number(pickupLngStr) > 180 ||
                    !isPickupInIndia)
                }
                className="text-xs h-8"
              />
            </div>
          </div>
          {pickup !== null && !isPickupInIndia && (
            <div className="flex items-start gap-2 p-2.5 rounded bg-danger/10 border border-danger/30 text-danger text-xs animate-shake">
              <AlertTriangle className="size-4 shrink-0 mt-0.5 text-danger" />
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold">Pickup Restricted to India</span>
                <span>{pickupIndiaCheck?.reason ?? 'Pickup location is outside Indian sovereign territory. Cabzone operates strictly within India.'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Drop Section */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="size-2 rounded-full bg-danger inline-block" />
              <span className="text-xs font-semibold text-text">Drop Location (D)</span>
              <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded px-1.5 py-0.2">
                🇮🇳 India Only
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={activeTarget === 'drop' ? 'primary' : 'ghost'}
                onClick={() =>
                  onActiveTargetChange(activeTarget === 'drop' ? 'auto' : 'drop')
                }
                icon={<Navigation className="size-3" />}
                className="text-xs h-7 px-2"
              >
                {activeTarget === 'drop' ? 'Setting on map...' : 'Set on map'}
              </Button>
              {drop !== null && (
                <button
                  type="button"
                  onClick={() => onDropChange(null)}
                  className="text-xs text-text-subtle hover:text-danger px-1.5 py-0.5"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] text-text-subtle block mb-1">Latitude</span>
              <Input
                type="number"
                step="any"
                placeholder="e.g. 26.681200"
                value={dropLatStr}
                onChange={(e) => handleDropLatChange(e.target.value)}
                invalid={
                  dropLatStr !== '' &&
                  (isNaN(Number(dropLatStr)) ||
                    Number(dropLatStr) < -90 ||
                    Number(dropLatStr) > 90 ||
                    !isDropInIndia)
                }
                className="text-xs h-8"
              />
            </div>
            <div>
              <span className="text-[11px] text-text-subtle block mb-1">Longitude</span>
              <Input
                type="number"
                step="any"
                placeholder="e.g. 88.395300"
                value={dropLngStr}
                onChange={(e) => handleDropLngChange(e.target.value)}
                invalid={
                  dropLngStr !== '' &&
                  (isNaN(Number(dropLngStr)) ||
                    Number(dropLngStr) < -180 ||
                    Number(dropLngStr) > 180 ||
                    !isDropInIndia)
                }
                className="text-xs h-8"
              />
            </div>
          </div>
          {drop !== null && !isDropInIndia && (
            <div className="flex items-start gap-2 p-2.5 rounded bg-danger/10 border border-danger/30 text-danger text-xs animate-shake">
              <AlertTriangle className="size-4 shrink-0 mt-0.5 text-danger" />
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold">Drop Restricted to India</span>
                <span>{dropIndiaCheck?.reason ?? 'Drop location is outside Indian sovereign territory. Cross-border trips are strictly prohibited.'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Vehicle Selection */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-text">Vehicle Category</span>
          <Select
            value={vehicleCategory}
            onValueChange={(val) => onVehicleChange(val as VehicleCategory)}
            options={vehicleOptions}
          />
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <Button
            variant="primary"
            size="md"
            loading={loading}
            disabled={!canSimulate}
            onClick={onSimulate}
            icon={<Play className="size-4" />}
            className="w-full justify-center text-sm font-semibold"
          >
            {loading ? 'Simulating Quote...' : 'Simulate Quote'}
          </Button>

          {!canSimulate && !loading && (
            <p className="text-[11px] text-text-subtle text-center mt-2">
              {!isPickupInIndia
                ? 'Pickup location must be within Indian sovereign territory'
                : !isDropInIndia
                  ? 'Drop location must be within Indian sovereign territory'
                  : !isPickupValid && !isDropValid
                    ? 'Place pickup and drop pins on the map or type coordinates'
                    : !isPickupValid
                      ? 'Set valid pickup coordinates'
                      : 'Set valid drop coordinates'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
