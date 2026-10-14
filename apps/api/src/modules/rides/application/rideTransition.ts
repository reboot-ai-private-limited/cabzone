import { AppError } from '../../../shared/errors/AppError.js';
import type { RideEntity, RideRepositoryPort } from '../domain/index.js';

export async function saveRideTransition(
  repo: RideRepositoryPort,
  ride: RideEntity,
  expectedVersion: number,
): Promise<RideEntity> {
  const saved = await repo.update(ride, expectedVersion);
  if (!saved) {
    throw AppError.conflict(
      'RIDE_STATE_CONFLICT: Ride changed. Fetch its current state and retry.',
    );
  }
  return saved;
}
