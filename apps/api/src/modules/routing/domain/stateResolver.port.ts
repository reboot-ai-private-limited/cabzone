import type { GeoPoint } from '@cabzone/geo';
import type { ResolvedLocationDetails } from '@cabzone/contracts';

/**
 * Resolves location details (country, state, city) for a point location.
 * Never throws for a resolution failure — timeout, quota, or no match all resolve to null/fallback values,
 * and callers must treat null as "unknown", never as grounds to block a ride.
 */
export interface DestinationStateResolverPort {
  /** Resolves the state code for a point (e.g. 'WB', 'BR'). Backwards-compatible. */
  resolve(point: GeoPoint): Promise<string | null>;

  /** Resolves comprehensive country, state, and city details for a point. */
  resolveLocation(point: GeoPoint): Promise<ResolvedLocationDetails>;
}
