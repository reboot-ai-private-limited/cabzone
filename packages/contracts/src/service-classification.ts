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
/** Display-only label — every state is serviceable and pricing does not vary by this value. */
export type RouteScope = 'INTRA_STATE' | 'INTERSTATE';

export interface ServiceClassificationDto {
  type: ServiceClassificationType;
  cityZoneId: string | null;
  cityName: string | null;
  bufferApplied: boolean;
  requestedService?: ServiceClassificationType | null | undefined;
  recommendedService?: ServiceClassificationType | null | undefined;
  discrepancyNotice?: string | null | undefined;
  /** CITY or OUTSTATION, from the final service. Separate from `routeScope`. */
  serviceType: ClassifiedServiceType;
  /** Null for city trips or when either state is unknown. Display-only, not used for pricing. */
  routeScope?: RouteScope | null | undefined;
  originStateCode?: string | null | undefined;
  destinationStateCode?: string | null | undefined;
  originCountryCode?: string | null | undefined;
  destinationCountryCode?: string | null | undefined;
  originCityName?: string | null | undefined;
  destinationCityName?: string | null | undefined;
}
