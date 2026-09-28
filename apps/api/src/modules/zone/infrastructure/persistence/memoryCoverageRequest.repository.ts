import type {
  CoverageRequestInput,
  CoverageRequestRepositoryPort,
} from '../../domain/coverageRequest.port.js';

export class MemoryCoverageRequestRepository implements CoverageRequestRepositoryPort {
  public readonly requests: Array<CoverageRequestInput & { id: string; createdAt: Date }> = [];

  async recordCoverageRequest(input: CoverageRequestInput): Promise<void> {
    this.requests.push({
      id: `cov-${this.requests.length + 1}`,
      ...input,
      createdAt: new Date(),
    });
  }
}
