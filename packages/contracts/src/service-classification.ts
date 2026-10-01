/**
 * Service Classification Contracts
 */

export const SERVICE_CLASSIFICATION_TYPES = [
  'IN_CITY',
  'OUTSTATION',
  'INTERSTATE',
] as const;

export type ServiceClassificationType =
  (typeof SERVICE_CLASSIFICATION_TYPES)[number];

/** Independent of route scope: a trip is either inside one city or an outstation trip. */
export type ClassifiedServiceType = 'CITY' | 'OUTSTATION';
export type RouteScope = 'INTRA_STATE' | 'INTERSTATE';

export interface RouteStateSegmentDto {
  stateCode: string;
  distanceM: number;
}

export interface ServiceClassificationDto {
  type: ServiceClassificationType;
  cityZoneId: string | null;
  cityName: string | null;
  bufferApplied: boolean;
  stateSegments: RouteStateSegmentDto[];
  requestedService?: ServiceClassificationType | null | undefined;
  recommendedService?: ServiceClassificationType | null | undefined;
  discrepancyNotice?: string | null | undefined;
  /** CITY or OUTSTATION, from the final service. Separate from `routeScope`. */
  serviceType?: ClassifiedServiceType | undefined;
  /** Null for city trips; INTRA_STATE / INTERSTATE from the resolved states and route segments. */
  routeScope?: RouteScope | null | undefined;
  originStateCode?: string | null | undefined;
  destinationStateCode?: string | null | undefined;
  /** State data versions used, so a quote can be traced to what it was priced against. */
  stateBoundaryVersion?: number | null | undefined;
  stateConfigVersion?: number | null | undefined;
}
