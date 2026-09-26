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
}
