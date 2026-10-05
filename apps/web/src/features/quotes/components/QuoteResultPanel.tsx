'use client';

import { useState } from 'react';
import type { QuoteDto } from '@cabzone/contracts';
import { Badge, Skeleton } from '@cabzone/design-system';
import { AlertCircle, Check, CheckCircle2, Copy, Receipt } from 'lucide-react';
import { ApiError } from '@/lib/api/ApiError.js';
import { formatPaise } from '@/lib/format.js';
import { LiveRideSimulator } from './LiveRideSimulator.js';

export interface QuoteResultPanelProps {
  quote: QuoteDto | null;
  error: unknown | null;
  loading: boolean;
}

export function QuoteResultPanel({ quote, error, loading }: QuoteResultPanelProps) {
  const [tokenCopied, setTokenCopied] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-4 bg-surface rounded-lg border border-border animate-pulse">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Skeleton className="h-14 rounded-md" />
          <Skeleton className="h-14 rounded-md" />
          <Skeleton className="h-14 rounded-md" />
          <Skeleton className="h-14 rounded-md" />
        </div>
        <Skeleton className="h-20 rounded-md mt-2" />
      </div>
    );
  }

  // 1. Error View
  if (error) {
    let errorCode = 'SIMULATION_ERROR';
    let errorMessage = 'An error occurred while calculating the quote.';

    if (error instanceof ApiError) {
      errorCode = error.code || 'API_ERROR';
      errorMessage = error.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
      if (error.message.includes(':')) {
        const parts = error.message.split(':');
        errorCode = parts[0]?.trim() || errorCode;
        errorMessage = parts.slice(1).join(':').trim();
      }
    }

    return (
      <div className="flex flex-col gap-3 p-4 bg-danger/5 rounded-lg border border-danger/30">
        <div className="flex items-center gap-2 text-danger">
          <AlertCircle className="size-5 shrink-0" />
          <h3 className="text-sm font-semibold">Backend Rejected Trip Simulation</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge tone="danger" className="font-mono text-xs">
            {errorCode}
          </Badge>
        </div>

        <div className="p-3 bg-surface rounded-md border border-border text-xs text-text font-mono break-words">
          {errorMessage}
        </div>

        <div className="text-[11px] text-text-subtle space-y-1">
          <p className="font-medium text-text">Operational Explanation:</p>
          {errorCode.includes('NO_ACTIVE_ZONE') ? (
            <p>
              The pickup location does not fall inside any registered active City zone or its buffer zone. In Cabzone, origin pickup containment is mandatory for service eligibility.
            </p>
          ) : errorCode.includes('E_RICKSHAW_CITY_ONLY') ? (
            <p>
              Per PRD specifications, E-Rickshaws are strictly confined to in-city trips. This requested trip resolved as OUTSTATION or INTERSTATE, which cannot be serviced by an E-Rickshaw.
            </p>
          ) : errorCode.includes('PRICING_UNAVAILABLE') ? (
            <p>
              No active pricing configuration was found for the vehicle category in the resolved city zone. Configure vehicle rates under the Pricing Matrix.
            </p>
          ) : errorCode.includes('ROUTE_UNAVAILABLE') ? (
            <p>
              The routing engine could not construct a valid drivable road route between these coordinates.
            </p>
          ) : (
            <p>
              The backend trip classifier or pricing engine rejected the route with the code shown above.
            </p>
          )}
        </div>
      </div>
    );
  }

  // 2. Empty State
  if (!quote) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-surface rounded-lg border border-border text-center">
        <div className="size-10 rounded-full bg-surface-muted flex items-center justify-center text-text-subtle mb-3">
          <Receipt className="size-5" />
        </div>
        <h3 className="text-sm font-semibold text-text">No Simulation Active</h3>
        <p className="text-xs text-text-subtle mt-1 max-w-xs">
          Select or place pickup and drop coordinates, choose a vehicle, and click &ldquo;Simulate Quote&rdquo; to test real backend classification and pricing.
        </p>
      </div>
    );
  }

  // 3. Success Quote View
  const handleCopyToken = () => {
    if (quote.quoteToken && typeof navigator !== 'undefined') {
      void navigator.clipboard.writeText(quote.quoteToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  };

  const serviceTone =
    quote.serviceType === 'IN_CITY'
      ? 'accent'
      : quote.serviceType === 'INTERSTATE'
        ? 'warning'
        : 'neutral';

  return (
    <div className="flex flex-col gap-4 p-4 bg-surface rounded-lg border border-border">
      {/* Header Result */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-success" />
          <div>
            <h3 className="text-sm font-semibold text-text">Server Quote Computed</h3>
            <p className="text-[11px] text-text-subtle">
              Quote ID: <span className="font-mono">{quote.quoteId.slice(0, 14)}...</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone={serviceTone} className="font-semibold text-xs">
            {quote.serviceType}
          </Badge>
          {quote.routeScope && (
            <Badge tone="info" className="text-xs font-semibold">
              {quote.routeScope === 'INTERSTATE' && quote.originStateCode && quote.destinationStateCode
                ? `INTERSTATE (${quote.originStateCode} → ${quote.destinationStateCode})`
                : quote.routeScope}
            </Badge>
          )}
        </div>
      </div>

      {/* Primary Fare Box */}
      <div className="p-3.5 bg-surface-sunken rounded-lg border border-border flex items-center justify-between">
        <div>
          <span className="text-[11px] text-text-subtle uppercase tracking-wider block font-medium">
            Suggested Fare
          </span>
          <span className="text-2xl font-bold text-text">
            {formatPaise(quote.suggestedFarePaise)}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[11px] text-text-subtle uppercase tracking-wider block font-medium">
            Negotiation Window
          </span>
          <span className="text-xs font-semibold text-text">
            {formatPaise(quote.negotiation.floorPaise)} – {formatPaise(quote.negotiation.ceilingPaise)}
          </span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2.5 text-xs">
        <div className="p-2.5 bg-surface-muted/50 rounded-md border border-border/60">
          <span className="text-[11px] text-text-subtle block font-medium">Distance & Duration</span>
          <span className="text-sm font-semibold text-text">
            {(quote.distanceM / 1000).toFixed(2)} km
          </span>
          <span className="text-[11px] text-text-subtle ml-1">
            (~{Math.round(quote.estimatedDurationSeconds / 60)} mins)
          </span>
        </div>

        <div className="p-2.5 bg-surface-muted/50 rounded-md border border-border/60">
          <span className="text-[11px] text-text-subtle block font-medium">Buffer Applied</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`size-2 rounded-full ${
                quote.bufferApplied ? 'bg-warning' : 'bg-text-subtle'
              }`}
            />
            <span className="font-semibold text-text">
              {quote.bufferApplied ? 'Yes (Buffer Surcharge)' : 'No'}
            </span>
          </div>
        </div>

        <div className="p-2.5 bg-surface-muted/50 rounded-md border border-border/60">
          <span className="text-[11px] text-text-subtle block font-medium">Origin Location</span>
          <span
            className="text-xs font-semibold text-text truncate block"
            title={
              quote.originCityName
                ? `${quote.originCityName} (${quote.originStateCode ?? 'IN'})`
                : quote.cityName ?? 'Pickup Point'
            }
          >
            {quote.originCityName ??
              quote.cityName ??
              (quote.originStateCode
                ? `State: ${quote.originStateCode}`
                : `Pin (${quote.pickup.lat.toFixed(3)}, ${quote.pickup.lng.toFixed(3)})`)}
            {quote.originStateCode && (quote.originCityName || quote.cityName)
              ? `, ${quote.originStateCode}`
              : ''}
          </span>
        </div>

        <div className="p-2.5 bg-surface-muted/50 rounded-md border border-border/60">
          <span className="text-[11px] text-text-subtle block font-medium">Destination Location</span>
          <span
            className="text-xs font-semibold text-text truncate block"
            title={
              quote.destinationCityName
                ? `${quote.destinationCityName} (${quote.destinationStateCode ?? 'IN'})`
                : quote.destinationStateCode
                  ? `State: ${quote.destinationStateCode}`
                  : 'Destination Point'
            }
          >
            {quote.destinationCityName
              ? `${quote.destinationCityName}${quote.destinationStateCode ? `, ${quote.destinationStateCode}` : ''}`
              : quote.destinationStateCode
                ? `State: ${quote.destinationStateCode}`
                : quote.cityName
                  ? `${quote.cityName} (In-City)`
                  : `Pin (${quote.drop.lat.toFixed(3)}, ${quote.drop.lng.toFixed(3)})`}
          </span>
        </div>

        <div className="p-2.5 bg-surface-muted/50 rounded-md border border-border/60">
          <span className="text-[11px] text-text-subtle block font-medium">Resolved City Zone</span>
          <span className="text-xs font-semibold text-text truncate block" title={quote.cityName ?? quote.cityZoneId ?? '—'}>
            {quote.cityName ?? (quote.cityZoneId ? `${quote.cityZoneId.slice(0, 10)}...` : '—')}
          </span>
        </div>

        <div className="p-2.5 bg-surface-muted/50 rounded-md border border-border/60">
          <span className="text-[11px] text-text-subtle block font-medium">Pricing Config</span>
          <span className="text-xs font-semibold text-text font-mono truncate block" title={quote.pricingConfigId}>
            v{quote.pricingConfigVersion} ({quote.pricingConfigId.slice(0, 8)}...)
          </span>
        </div>
      </div>

      {/* State Distance Breakdown */}
      {quote.stateBreakdown && quote.stateBreakdown.length > 0 && (
        <div className="p-3 bg-surface-muted/30 rounded-lg border border-border/70 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text flex items-center gap-1.5">
              <span>🛣️</span>
              <span>State Distance Breakdown</span>
            </span>
            <span className="text-[11px] text-text-subtle font-medium">
              {quote.stateBreakdown.length > 1
                ? `${quote.stateBreakdown.length} States Traversed`
                : 'Single State Route'}
            </span>
          </div>

          {/* Segmented Progress Bar */}
          <div className="w-full h-2.5 bg-surface-sunken rounded-full overflow-hidden flex border border-border/40">
            {quote.stateBreakdown.map((sb, idx) => {
              const bgColors = [
                'bg-accent',
                'bg-warning',
                'bg-success',
                'bg-interactive',
                'bg-danger',
              ];
              const color = bgColors[idx % bgColors.length];
              return (
                <div
                  key={sb.stateCode}
                  style={{ width: `${Math.max(3, sb.percentage)}%` }}
                  className={`${color} h-full transition-all`}
                  title={`${sb.stateName} (${sb.stateCode}): ${sb.distanceKm} km (${sb.percentage}%)`}
                />
              );
            })}
          </div>

          {/* Breakdown Pills */}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {quote.stateBreakdown.map((sb, idx) => {
              const dotColors = [
                'bg-accent',
                'bg-warning',
                'bg-success',
                'bg-interactive',
                'bg-danger',
              ];
              const dot = dotColors[idx % dotColors.length];
              return (
                <div
                  key={sb.stateCode}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-surface rounded-md border border-border/80 text-xs shadow-xs flex-wrap"
                >
                  <span className={`size-2 rounded-full ${dot}`} />
                  <span className="font-semibold text-text">{sb.stateName}</span>
                  <span className="text-[10px] text-text-subtle font-mono font-medium">({sb.stateCode})</span>
                  <span className="font-semibold text-text ml-1">{sb.distanceKm} km</span>
                  <span className="text-[11px] text-text-subtle">({sb.percentage}%)</span>
                  {sb.ratePerKmPaise !== undefined && (
                    <span className="text-[11px] font-mono text-primary font-medium ml-1">
                      @ ₹{(sb.ratePerKmPaise / 100).toFixed(0)}/km
                    </span>
                  )}
                  {sb.distanceFarePaise !== undefined && (
                    <span className="text-[11px] font-mono text-text font-semibold ml-0.5">
                      = ₹{(sb.distanceFarePaise / 100).toFixed(0)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live Ride Creation & Negotiation Simulator */}
      <LiveRideSimulator quote={quote} />

      {/* Quote Token & Expiry */}
      <div className="pt-2 border-t border-border flex items-center justify-between text-[11px] text-text-subtle">
        <span>
          Expires at: {new Date(quote.expiresAt).toLocaleTimeString()}
        </span>
        <button
          type="button"
          onClick={handleCopyToken}
          className="flex items-center gap-1 text-interactive hover:text-interactive-hover font-medium"
        >
          {tokenCopied ? (
            <>
              <Check className="size-3 text-success" />
              <span>Token Copied!</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>Copy Quote Token</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
