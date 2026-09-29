'use client';

import type { PricingConfigDto } from '@cabzone/contracts';
import { Badge, Button, Dialog } from '@cabzone/design-system';
import { formatPaise } from '@/lib/format.js';

export function PricingConfigViewDialog({
  config,
  zoneName,
  onOpenChange,
  onActivate,
}: {
  config: PricingConfigDto | null;
  zoneName: string;
  onOpenChange: (open: boolean) => void;
  onActivate: (config: PricingConfigDto) => void;
}) {
  const rows: [string, string][] =
    config === null
      ? []
      : [
          ['City zone', zoneName],
          ['Vehicle type', config.vehicleType],
          [
            'Base fare',
            `${formatPaise(config.baseFarePaise)} (includes ${config.includedDistanceM / 1000} km)`,
          ],
          ['Rate per km', `${formatPaise(config.ratePerKmPaise)}/km`],
          ['Minimum fare', formatPaise(config.minimumFarePaise)],
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
