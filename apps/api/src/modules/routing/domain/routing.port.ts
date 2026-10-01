import type { RouteRequest, RouteResult } from './route.entity.js';

export interface RouteProviderPort {
  readonly name: 'GOOGLE_ROUTES' | 'HAVERSINE_ESTIMATE' | string;
  calculateRoute(req: RouteRequest): Promise<RouteResult>;
}

export interface RouteCachePort {
  get(key: string): RouteResult | null;
  set(key: string, v: RouteResult): void;
}

export interface RouteMetrics {
  requests: number;
  failures: number;
  cacheHits: number;
  totalLatencyMs: number;
}

