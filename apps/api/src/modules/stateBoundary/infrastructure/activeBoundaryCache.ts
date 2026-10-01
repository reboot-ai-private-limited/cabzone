import type {
  ActiveStateBoundaryProviderPort,
  StateBoundaryEntity,
  StateBoundaryRepositoryPort,
} from '../domain/index.js';

export class ActiveBoundaryCache implements ActiveStateBoundaryProviderPort {
  private cached: StateBoundaryEntity[] | null = null;
  private expiresAt = 0;
  private readonly ttlMs: number;

  constructor(
    private readonly repo: StateBoundaryRepositoryPort,
    ttlSeconds = 60,
  ) {
    this.ttlMs = ttlSeconds * 1000;
  }

  async getActive(): Promise<StateBoundaryEntity[]> {
    if (this.cached && Date.now() < this.expiresAt) {
      return this.cached;
    }
    const fresh = await this.repo.listActive();
    this.cached = fresh;
    this.expiresAt = Date.now() + this.ttlMs;
    return fresh;
  }

  invalidate(): void {
    this.cached = null;
    this.expiresAt = 0;
  }
}

