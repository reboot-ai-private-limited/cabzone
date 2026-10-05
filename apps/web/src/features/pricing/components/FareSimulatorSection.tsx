'use client';

import { useId, useMemo, useState } from 'react';
import { Badge } from '@cabzone/design-system';
import { Input } from '@cabzone/design-system';
import { Select } from '@cabzone/design-system';
import { formatPaise } from '@/lib/format.js';
import { usePricingConfigs } from '../hooks/usePricing.js';

export function FareSimulatorSection() {
  const configSelectId = useId();
  const riderOfferInputId = useId();

  const { data: configs } = usePricingConfigs({ status: 'ACTIVE' });
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [serviceType, setServiceType] = useState<'CITY' | 'OUTSTATION'>('CITY');
  const [simulatedDistanceKm, setSimulatedDistanceKm] = useState<number>(8.5);
  const [isBufferFallback, setIsBufferFallback] = useState<boolean>(false);
  const [riderCounterOfferRupees, setRiderCounterOfferRupees] = useState<number>(180);

  const activeConfig = useMemo(() => {
    if (!configs || configs.length === 0) return null;
    if (selectedConfigId) {
      return configs.find((c) => c.id === selectedConfigId) ?? configs[0] ?? null;
    }
    return configs[0] ?? null;
  }, [configs, selectedConfigId]);

  const configOptions = (configs ?? []).map((c) => ({
    value: c.id,
    label: `${c.vehicleType} – Zone: ${c.cityZoneId} (v${c.version})`,
  }));

  // Calculations based on activeConfig and serviceType
  const isOutstation = serviceType === 'OUTSTATION';
  const effectiveBaseFarePaise = activeConfig
    ? (isOutstation ? activeConfig.outstationBaseFarePaise : activeConfig.baseFarePaise)
    : 0;
  const effectiveRatePerKmPaise = activeConfig
    ? (isOutstation ? activeConfig.outstationRatePerKmPaise : activeConfig.ratePerKmPaise)
    : 0;
  const effectiveMinimumFarePaise = activeConfig
    ? (isOutstation ? activeConfig.outstationMinimumFarePaise : activeConfig.minimumFarePaise)
    : 0;

  const distanceM = Math.round(simulatedDistanceKm * 1000);
  const distanceFarePaise = activeConfig
    ? Math.round((distanceM / 1000) * effectiveRatePerKmPaise)
    : 0;
  const bufferFarePaise =
    !isOutstation && isBufferFallback && activeConfig ? activeConfig.bufferSurchargePaise : 0;
  const calculatedSubtotalPaise = effectiveBaseFarePaise + distanceFarePaise + bufferFarePaise;
  const suggestedFarePaise = activeConfig
    ? Math.max(effectiveMinimumFarePaise, calculatedSubtotalPaise)
    : 0;

  const floorPercent = activeConfig?.negotiationFloorPercent ?? 80;
  const ceilingPercent = activeConfig?.negotiationCeilingPercent ?? 150;
  const commissionPercent = activeConfig?.commissionPercent ?? 8;

  const floorPaise = activeConfig
    ? Math.max(
        effectiveMinimumFarePaise,
        Math.round((suggestedFarePaise * floorPercent) / 100),
      )
    : 0;
  const ceilingPaise = Math.round((suggestedFarePaise * ceilingPercent) / 100);

  const riderOfferPaise = Math.round(riderCounterOfferRupees * 100);
  const isOfferValid = riderOfferPaise >= floorPaise && riderOfferPaise <= ceilingPaise;
  const isBelowFloor = riderOfferPaise < floorPaise;
  const isAboveCeiling = riderOfferPaise > ceilingPaise;

  const commissionPaise = Math.round((riderOfferPaise * commissionPercent) / 100);
  const driverNetPaise = riderOfferPaise - commissionPaise;

  return (
    <div className="flex flex-col gap-6">
      {/* Simulation Controls Header */}
      <div className="p-4 rounded-md bg-surface border border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text whitespace-nowrap">Pricing Model:</span>
            <div className="w-full sm:w-72">
              {configOptions.length > 0 ? (
                <Select
                  id={configSelectId}
                  value={activeConfig?.id ?? ''}
                  onValueChange={setSelectedConfigId}
                  options={configOptions}
                  placeholder="Choose active category rule"
                />
              ) : (
                <span className="text-xs text-text-subtle">No active pricing rules yet.</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text whitespace-nowrap">Trip Scope:</span>
            <div className="flex items-center gap-1 bg-surface-muted p-0.5 rounded-md border border-border">
              <button
                type="button"
                onClick={() => setServiceType('CITY')}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                  !isOutstation
                    ? 'bg-surface text-text shadow-sm'
                    : 'text-text-subtle hover:text-text'
                }`}
              >
                City
              </button>
              <button
                type="button"
                onClick={() => setServiceType('OUTSTATION')}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                  isOutstation
                    ? 'bg-surface text-text shadow-sm'
                    : 'text-text-subtle hover:text-text'
                }`}
              >
                Outstation
              </button>
            </div>
          </div>
        </div>

        {!isOutstation ? (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-text select-none">
              <input
                type="checkbox"
                checked={isBufferFallback}
                onChange={(e) => setIsBufferFallback(e.target.checked)}
                className="rounded border-border text-interactive focus:ring-interactive size-4"
                aria-label="Include Buffer Zone Surcharge"
              />
              <span>Include Buffer Zone Surcharge</span>
            </label>
            {isBufferFallback && <Badge tone="warning">Buffer Applied</Badge>}
          </div>
        ) : (
          <Badge tone="accent">Outstation Tier Applied</Badge>
        )}
      </div>

      {activeConfig ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Distance & Trip Configuration */}
          <div className="p-5 rounded-md bg-surface border border-border flex flex-col gap-5 lg:col-span-1">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-sm font-semibold text-text">Trip Parameters</span>
              <div className="flex items-center gap-2">
                <Badge tone={isOutstation ? 'accent' : 'neutral'}>
                  {isOutstation ? 'OUTSTATION' : 'CITY'}
                </Badge>
                <Badge tone="accent">{activeConfig.vehicleType}</Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs">
                <span className="text-text-subtle">Ride Distance:</span>
                <span className="font-mono font-bold text-text">{simulatedDistanceKm.toFixed(1)} km</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="50"
                step="0.5"
                value={simulatedDistanceKm}
                onChange={(e) => setSimulatedDistanceKm(Number(e.target.value))}
                className="w-full cursor-pointer accent-interactive"
                aria-label="Ride Distance slider"
              />
              <div className="flex justify-between text-[10px] text-text-subtle font-mono">
                <span>0.5 km</span>
                <span>25 km</span>
                <span>50 km</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-border text-xs">
              <div className="flex justify-between text-text-subtle">
                <span>{isOutstation ? 'Outstation Base Fare:' : 'Base Fare:'}</span>
                <span className="font-mono text-text">{formatPaise(effectiveBaseFarePaise)}</span>
              </div>
              <div className="flex justify-between text-text-subtle">
                <span>Distance Fare ({formatPaise(effectiveRatePerKmPaise)}/km):</span>
                <span className="font-mono text-text">{formatPaise(distanceFarePaise)}</span>
              </div>
              {!isOutstation && isBufferFallback && (
                <div className="flex justify-between text-warning">
                  <span>Buffer Surcharge:</span>
                  <span className="font-mono">+{formatPaise(bufferFarePaise)}</span>
                </div>
              )}
              <div className="flex justify-between text-text-subtle">
                <span>Minimum Guard:</span>
                <span className="font-mono text-text">{formatPaise(effectiveMinimumFarePaise)}</span>
              </div>
            </div>
          </div>

          {/* Suggested Fare Output */}
          <div className="p-5 rounded-md bg-surface border border-border flex flex-col justify-between gap-4 lg:col-span-1">
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase font-bold tracking-wider text-text-subtle">
                Generated System Quote
              </span>
              <div className="flex items-baseline gap-2 pt-2">
                <span className="font-mono text-3xl font-extrabold text-text">
                  {formatPaise(suggestedFarePaise)}
                </span>
                <span className="text-xs text-text-subtle">suggested</span>
              </div>
            </div>

            <div className="p-3.5 rounded-md bg-surface-muted border border-border flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between font-semibold text-text">
                <span>Negotiation Range Clamps</span>
                <span className="text-[11px] text-text-subtle">{activeConfig.negotiationWindowSeconds}s window</span>
              </div>
              <div className="flex items-center justify-between text-text-subtle pt-1 font-mono">
                <span>Floor ({floorPercent}%):</span>
                <span className="font-bold text-text">{formatPaise(floorPaise)}</span>
              </div>
              <div className="flex items-center justify-between text-text-subtle font-mono">
                <span>Ceiling ({ceilingPercent}%):</span>
                <span className="font-bold text-text">{formatPaise(ceilingPaise)}</span>
              </div>
            </div>

            <div className="text-[11px] text-text-subtle leading-relaxed">
              Riders can offer any amount within this range. If an offer violates the floor or ceiling, the server rejects it with an invariant error.
            </div>
          </div>

          {/* Rider Counter-Offer Tester */}
          <div className="p-5 rounded-md bg-surface border border-border flex flex-col gap-4 lg:col-span-1">
            <span className="text-sm font-semibold text-text border-b border-border pb-2">
              Counter-Offer Sandbox
            </span>

            <div className="flex flex-col gap-1 text-xs font-semibold text-text">
              <label htmlFor={riderOfferInputId}>Simulated Rider Offer (₹)</label>
              <Input
                id={riderOfferInputId}
                type="number"
                min={10}
                step="5"
                value={riderCounterOfferRupees}
                onChange={(e) => setRiderCounterOfferRupees(Number(e.target.value))}
              />
            </div>

            {/* Verdict Card */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-text">Offer Evaluation:</span>
              {isOfferValid && (
                <div className="p-3 rounded-md bg-success/10 border border-success/30 flex items-center justify-between">
                  <Badge tone="success">ACCEPTED</Badge>
                  <span className="text-xs font-medium text-success">Within bounds</span>
                </div>
              )}
              {isBelowFloor && (
                <div className="p-3 rounded-md bg-danger/10 border border-danger/30 flex flex-col gap-1">
                  <Badge tone="danger">REJECTED: BELOW FLOOR</Badge>
                  <span className="text-[11px] text-danger">
                    Minimum allowed is {formatPaise(floorPaise)}.
                  </span>
                </div>
              )}
              {isAboveCeiling && (
                <div className="p-3 rounded-md bg-danger/10 border border-danger/30 flex flex-col gap-1">
                  <Badge tone="danger">REJECTED: EXCEEDS CEILING</Badge>
                  <span className="text-[11px] text-danger">
                    Maximum allowed is {formatPaise(ceilingPaise)}.
                  </span>
                </div>
              )}
            </div>

            {/* Payout breakdown */}
            <div className="p-3 rounded-md bg-surface-muted border border-border flex flex-col gap-1.5 text-xs font-mono">
              <div className="flex justify-between text-text-subtle">
                <span>Rider Pays:</span>
                <span className="font-semibold text-text">{formatPaise(riderOfferPaise)}</span>
              </div>
              <div className="flex justify-between text-text-subtle">
                <span>Commission ({commissionPercent}%):</span>
                <span className="text-interactive font-semibold">-{formatPaise(commissionPaise)}</span>
              </div>
              <div className="flex justify-between text-text font-bold pt-1 border-t border-border">
                <span>Driver Payout:</span>
                <span className="text-success">{formatPaise(driverNetPaise)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center bg-surface border border-border rounded-md text-text-subtle text-sm">
          No active pricing rules found. Please create and activate a pricing rule to test simulations.
        </div>
      )}
    </div>
  );
}
