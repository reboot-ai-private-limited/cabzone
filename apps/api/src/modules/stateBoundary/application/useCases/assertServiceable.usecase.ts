import type { GeoPoint } from '@cabzone/geo';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { ResolvedState, ResolveStateForPointUseCase } from './resolveStateForPoint.usecase.js';

export interface ServiceableStates {
  pickup: ResolvedState;
  drop: ResolvedState;
}

/** Both ends of a trip must be inside an ACTIVE state; otherwise the trip is not serviceable. */
export class AssertServiceableUseCase {
  constructor(private readonly resolveState: ResolveStateForPointUseCase) {}

  async execute(pickup: GeoPoint, drop: GeoPoint): Promise<ServiceableStates> {
    const [pickupState, dropState] = await Promise.all([
      this.resolveState.execute(pickup),
      this.resolveState.execute(drop),
    ]);
    if (!pickupState) {
      throw AppError.badRequest('PICKUP_NOT_SERVICEABLE: Pickup location is outside our service area.');
    }
    if (!dropState) {
      throw AppError.badRequest('DESTINATION_NOT_SERVICEABLE: Drop location is outside our service area.');
    }
    return { pickup: pickupState, drop: dropState };
  }
}
