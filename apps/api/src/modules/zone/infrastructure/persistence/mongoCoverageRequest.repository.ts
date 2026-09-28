import { newUuid } from '../../../../shared/ids.js';
import type {
  CoverageRequestInput,
  CoverageRequestRepositoryPort,
} from '../../domain/coverageRequest.port.js';
import { CoverageRequestModel } from './coverageRequest.model.js';

export class MongoCoverageRequestRepository implements CoverageRequestRepositoryPort {
  async recordCoverageRequest(input: CoverageRequestInput): Promise<void> {
    try {
      await CoverageRequestModel.create({
        _id: newUuid(),
        point: {
          type: 'Point',
          coordinates: [input.lng, input.lat],
        },
        rider_id: input.riderId ?? null,
        created_at: new Date(),
      });
    } catch {
      // Telemetry demand logging should never interrupt or fail the caller flow
    }
  }
}
