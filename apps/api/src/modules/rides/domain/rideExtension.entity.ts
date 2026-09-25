import type { ExtensionStatus } from '@cabzone/contracts';

export interface LocationCoordinates {
  lat: number;
  lng: number;
}

export interface RideExtensionEntity {
  id: string;
  rideId: string;
  requestedBy: string;
  originalDrop: LocationCoordinates;
  newDrop: LocationCoordinates;
  additionalDistanceM: number;
  additionalFarePaise: number;
  status: ExtensionStatus;
  requestedAt: Date;
  respondedAt: Date | null;
}
