'use client';

import type { PricingConfigDto } from '@cabzone/contracts';
import { Badge, Button, Dialog } from '@cabzone/design-system';
import { formatPaise } from '@/lib/format.js';

export function PricingConfigViewDialog({
  config,
  zoneName,
  onOpenChange,
  onActivate,
  onEdit,
}: {
  config: PricingConfigDto | null;
  zoneName: string;
  onOpenChange: (open: boolean) => void;
  onActivate: (config: PricingConfigDto) => void;
  onEdit?: (config: PricingConfigDto) => void;
}) {
  const territoryLabel =
    config?.level === 'GLOBAL'
      ? '🌍 Global Baseline (All India)'
      : config?.level === 'STATE'
        ? `🏛️ ${config.stateName ?? config.stateCode ?? 'State Level'}`
        : `🏙️ ${zoneName || 'City Zone'}`;

  const rows: [string, string][] =
    config === null
      ? []
      : [
          ['Pricing Scope', config.level],
          ['Territory / Target', territoryLabel],
          ['Vehicle category', config.vehicleType],
          ['City base fare', formatPaise(config.baseFarePaise)],
          ['City rate per km', `${formatPaise(config.ratePerKmPaise)}/km`],
          ['City minimum fare', formatPaise(config.minimumFarePaise)],
          ['Outstation base fare', formatPaise(config.outstationBaseFarePaise)],
          ['Outstation rate per km', `${formatPaise(config.outstationRatePerKmPaise)}/km`],
          ['Outstation minimum fare', formatPaise(config.outstationMinimumFarePaise)],
          [
            'Buffer surcharge',
            config.bufferSurchargePaise > 0 ? formatPaise(config.bufferSurchargePaise) : 'None',
          ],
          [
            'Negotiation range',
            `${config.negotiationFloorPercent}% – ${config.negotiationCeilingPercent}%`,
          ],
          ['Negotiation window', `${config.negotiationWindowSeconds}s`],
          ['Commission', `${config.commissionPercent}%`],
          ['Effective from', new Date(config.effectiveFrom).toLocaleDateString()],
        ];

  return (
    <Dialog
      open={config !== null}
      onOpenChange={onOpenChange}
      title="Pricing Rule Details"
      footer={
        <>
          {config !== null && onEdit && (
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
                onEdit(config);
              }}
            >
              Edit Rule
            </Button>
          )}
          {config !== null && config.status !== 'ACTIVE' && (
            <Button variant="primary" onClick={() => onActivate(config)}>
              Activate
            </Button>
          )}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </>
      }
    >
      {config !== null && (
        <dl className="flex flex-col divide-y divide-border">
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-text-subtle">Status</dt>
            <dd>
              <Badge tone={config.status === 'ACTIVE' ? 'success' : 'neutral'}>{config.status}</Badge>
            </dd>
          </div>
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-6 py-2.5 text-sm">
              <dt className="text-text-subtle">{label}</dt>
              <dd className="font-medium text-text text-right">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Dialog>
  );
}
