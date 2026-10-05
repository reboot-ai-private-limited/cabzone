'use client';

import type { GeoPoint, VehicleCategory } from '@cabzone/contracts';
import { Badge, Button } from '@cabzone/design-system';
import { History, RotateCcw, Trash2 } from 'lucide-react';
import { formatPaise } from '@/lib/format.js';

export interface ScenarioEntry {
  id: string;
  timestamp: Date;
  pickup: GeoPoint;
  drop: GeoPoint;
  vehicleCategory: VehicleCategory;
  status: 'SUCCESS' | 'ERROR';
  serviceType?: string | undefined;
  bufferApplied?: boolean | undefined;
  routeScope?: string | null | undefined;
  suggestedFarePaise?: number | undefined;
  distanceM?: number | undefined;
  durationSeconds?: number | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
}

export interface ScenarioLogProps {
  scenarios: ScenarioEntry[];
  onSelectScenario: (scenario: ScenarioEntry) => void;
  onClearLog: () => void;
}

export function ScenarioLog({
  scenarios,
  onSelectScenario,
  onClearLog,
}: ScenarioLogProps) {
  if (scenarios.length === 0) {
    return (
      <div className="p-4 bg-surface rounded-lg border border-border text-center">
        <div className="flex items-center justify-center gap-1.5 text-xs text-text-subtle mb-1">
          <History className="size-3.5" />
          <span className="font-semibold uppercase tracking-wider text-[11px]">
            Session Scenario History
          </span>
        </div>
        <p className="text-xs text-text-subtle">
          Simulated runs will accumulate here so you can compare edge cases side by side.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-surface rounded-lg border border-border overflow-hidden">
      <div className="p-3 border-b border-border flex items-center justify-between bg-surface-muted/30">
        <div className="flex items-center gap-2">
          <History className="size-4 text-text-subtle" />
          <h3 className="text-xs font-semibold text-text uppercase tracking-wider">
            Scenario History ({scenarios.length})
          </h3>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClearLog}
          icon={<Trash2 className="size-3 text-text-subtle" />}
          className="text-xs h-7 px-2 text-text-subtle hover:text-danger"
        >
          Clear
        </Button>
      </div>

      <div className="overflow-x-auto max-h-72 overflow-y-auto divide-y divide-border">
        {scenarios.map((item) => {
          const isSuccess = item.status === 'SUCCESS';
          const serviceTone =
            item.serviceType === 'IN_CITY'
              ? 'accent'
              : item.serviceType === 'INTERSTATE'
                ? 'warning'
                : 'neutral';

          return (
            <div
              key={item.id}
              className="p-3 hover:bg-surface-muted/40 transition-colors flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-text-subtle">
                    {item.timestamp.toLocaleTimeString()}
                  </span>
                  <span className="font-semibold text-text">{item.vehicleCategory}</span>
                  {isSuccess ? (
                    <>
                      <Badge tone={serviceTone} className="text-[10px] py-0 px-1.5 font-medium">
                        {item.serviceType}
                      </Badge>
                      {item.bufferApplied && (
                        <Badge tone="warning" className="text-[10px] py-0 px-1.5 font-medium">
                          BUFFER
                        </Badge>
                      )}
                      {item.suggestedFarePaise !== undefined && (
                        <span className="font-semibold text-text">
                          {formatPaise(item.suggestedFarePaise)}
                        </span>
                      )}
                      {item.distanceM !== undefined && (
                        <span className="text-[11px] text-text-subtle">
                          ({(item.distanceM / 1000).toFixed(1)} km)
                        </span>
                      )}
                    </>
                  ) : (
                    <Badge tone="danger" className="text-[10px] py-0 px-1.5 font-medium font-mono">
                      {item.errorCode ?? 'ERROR'}
                    </Badge>
                  )}
                </div>

                <div className="text-[11px] text-text-subtle truncate">
                  <span className="text-success font-medium">P:</span> [
                  {item.pickup.lat.toFixed(4)}, {item.pickup.lng.toFixed(4)}] →{' '}
                  <span className="text-danger font-medium">D:</span> [
                  {item.drop.lat.toFixed(4)}, {item.drop.lng.toFixed(4)}]
                </div>
              </div>

              <Button
                size="sm"
                variant="secondary"
                onClick={() => onSelectScenario(item)}
                icon={<RotateCcw className="size-3" />}
                className="shrink-0 text-xs h-7 px-2"
                title="Load these coordinates into simulator"
              >
                Load
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
