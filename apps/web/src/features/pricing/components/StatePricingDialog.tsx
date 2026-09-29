'use client';

import { useId, useState } from 'react';
import { Button } from '@cabzone/design-system';
import { Dialog } from '@cabzone/design-system';
import { Input } from '@cabzone/design-system';
import { formatPaise } from '@/lib/format.js';
import { useCreateStatePricing } from '../hooks/usePricing.js';

export interface StatePricingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StatePricingDialog({ open, onOpenChange }: StatePricingDialogProps) {
  const stateCodeInputId = useId();
  const baseFareInputId = useId();
  const ratePerKmInputId = useId();
  const minFareInputId = useId();

  const [stateCode, setStateCode] = useState<string>('WB');
  const [baseFareRupees, setBaseFareRupees] = useState<number>(80);
  const [ratePerKmRupees, setRatePerKmRupees] = useState<number>(18);
  const [minimumFareRupees, setMinimumFareRupees] = useState<number>(100);
  const [validationError, setValidationError] = useState<string | null>(null);

  const createMutation = useCreateStatePricing(() => {
    onOpenChange(false);
  });

  const baseFarePaise = Math.round(baseFareRupees * 100);
  const ratePerKmPaise = Math.round(ratePerKmRupees * 100);
  const minimumFarePaise = Math.round(minimumFareRupees * 100);

  const sample50km = Math.max(minimumFarePaise, baseFarePaise + Math.round(50 * ratePerKmPaise));
  const sample100km = Math.max(minimumFarePaise, baseFarePaise + Math.round(100 * ratePerKmPaise));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const code = stateCode.trim().toUpperCase();
    if (code.length < 2 || code.length > 5) {
      setValidationError('State code must be between 2 and 5 letters (e.g. WB, UP, BR).');
      return;
    }

    if (minimumFarePaise < baseFarePaise) {
      setValidationError('Minimum fare cannot be less than base fare.');
      return;
    }

    createMutation.mutate({
      stateCode: code,
      baseFarePaise,
      ratePerKmPaise,
      minimumFarePaise,
      status: 'ACTIVE',
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create Interstate State Pricing Rule"
      description="Define fallback per-km distance rates and minimum baseline fares for long-distance and interstate travel."
      className="max-w-lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="state-pricing-form"
            variant="primary"
            loading={createMutation.isPending}
          >
            Save State Rate
          </Button>
        </>
      }
    >
      <form id="state-pricing-form" onSubmit={handleSubmit} className="flex flex-col gap-4 py-1">
        {validationError && (
          <div className="p-3 text-xs rounded-md bg-danger/10 text-danger border border-danger/20">
            {validationError}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 text-xs font-semibold text-text">
            <label htmlFor={stateCodeInputId}>State Code</label>
            <Input
              id={stateCodeInputId}
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value.toUpperCase())}
              placeholder="e.g. WB, UP, BR, DL"
              required
            />
            <span className="text-[10px] font-normal text-text-subtle">
              Two or three letter ISO-3166 state code
            </span>
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
        </div>

        {/* Live Estimate Card */}
        <div className="p-3 rounded-md bg-surface-muted border border-border flex flex-col gap-1.5 text-xs">
          <span className="font-semibold text-text">Interstate Trip Projection ({stateCode.toUpperCase()}):</span>
          <div className="grid grid-cols-2 gap-2 text-text-subtle font-mono text-[11px] pt-1">
            <div>50 km Trip: <span className="font-semibold text-text">{formatPaise(sample50km)}</span></div>
            <div>100 km Trip: <span className="font-semibold text-text">{formatPaise(sample100km)}</span></div>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
