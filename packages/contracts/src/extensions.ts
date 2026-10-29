import type { RideDto, ZoneClassificationType } from './rides.js';

export interface RideExtensionProposalDto {
  id: string;
  requestId: string;
  originalDrop: RideDto['drop'];
  newDrop: RideDto['drop'];
  additionalDistanceM: number;
  additionalFarePaise: number;
  status: 'REQUESTED' | 'ACCEPTED' | 'REJECTED';
  requestedAt: string;
  expiresAt: string;
  respondedAt: string | null;
  baselineRideVersion: number;
  /** Full updated route geometry for maps; extra fare uses two routes from the same GPS fix. */
  route: { provider: string; distanceM: number; durationSeconds: number; polyline: string };
  zone: {
    classification: ZoneClassificationType;
    cityZoneId: string | null;
    destinationStateCode: string | null;
    routeScope: 'INTRA_STATE' | 'INTERSTATE' | null;
  };
}

export interface ProposeRideExtensionRequestDto {
  requestId: string;
  newDrop: RideDto['drop'];
}
