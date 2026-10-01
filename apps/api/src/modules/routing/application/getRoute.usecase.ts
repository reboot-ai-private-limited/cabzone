import type {
  RouteCachePort,
  RouteMetrics,
  RouteProviderPort,
  RouteRequest,
  RouteResult,
} from '../domain/index.js';

export class GetRouteUseCase {
  private requests = 0;
  private failures = 0;
  private cacheHits = 0;
  private totalLatencyMs = 0;

  constructor(
    private readonly provider: RouteProviderPort,
    private readonly cache: RouteCachePort,
  ) {}

  async execute(req: RouteRequest): Promise<RouteResult> {
    this.requests++;
    const key = this.buildCacheKey(req);
    const cached = this.cache.get(key);

    if (cached) {
      this.cacheHits++;
      return cached;
    }

    const start = Date.now();
    try {
      const result = await this.provider.calculateRoute(req);
      this.totalLatencyMs += Date.now() - start;
      this.cache.set(key, result);
      return result;
    } catch (err) {
      this.failures++;
      this.totalLatencyMs += Date.now() - start;
      throw err;
    }
  }

  getMetrics(): RouteMetrics {
    return {
      requests: this.requests,
      failures: this.failures,
      cacheHits: this.cacheHits,
      totalLatencyMs: this.totalLatencyMs,
    };
  }

  private buildCacheKey(req: RouteRequest): string {
    const oLat = req.origin.lat.toFixed(5);
    const oLng = req.origin.lng.toFixed(5);
    const dLat = req.destination.lat.toFixed(5);
    const dLng = req.destination.lng.toFixed(5);
    return `${oLat},${oLng}->${dLat},${dLng}:${req.vehicleCategory}`;
  }
}

