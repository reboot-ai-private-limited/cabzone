import type { RequestHandler, Router } from 'express';
import { env, isProduction } from '@/config/env.js';
import type { RouteCachePort, RouteProviderPort } from './domain/index.js';
import { GetRouteUseCase } from './application/getRoute.usecase.js';
import { GoogleRoutesProvider } from './infrastructure/googleRoutes.provider.js';
import { HaversineRouteProvider } from './infrastructure/haversine.provider.js';
import { TtlRouteCache } from './infrastructure/ttlRouteCache.js';
import {
  makeGetRoutingHealthController,
  makeGetRoutingMetricsController,
} from './interface/routing.controller.js';
import { buildAdminRoutingRouter } from './interface/routing.routes.js';
import { registerRoutingSwaggerPaths } from './interface/routing.swagger.js';

export interface RoutingContainerOptions {
  routeProvider?: RouteProviderPort;
  routeCache?: RouteCachePort;
}

export interface RoutingContainer {
  getRouteUseCase: GetRouteUseCase;
  routeProvider: RouteProviderPort;
  routeCache: RouteCachePort;
  buildAdminRoutingRouter: (auth?: {
    authenticate?: RequestHandler | undefined;
    requireSuperAdmin?: RequestHandler | undefined;
  }) => Router;
}

export function buildRoutingContainer(opts?: RoutingContainerOptions): RoutingContainer {
  registerRoutingSwaggerPaths();
  let provider: RouteProviderPort;

  if (opts?.routeProvider) {
    provider = opts.routeProvider;
  } else if (env.ROUTING_PROVIDER === 'haversine') {
    if (isProduction) {
      throw new Error('Haversine route provider is strictly forbidden in production.');
    }
    provider = new HaversineRouteProvider();
  } else {
    if (!env.GOOGLE_ROUTES_API_KEY) {
      throw new Error('GOOGLE_ROUTES_API_KEY is required for GoogleRoutesProvider.');
    }
    provider = new GoogleRoutesProvider({
      apiKey: env.GOOGLE_ROUTES_API_KEY,
      trafficAware: env.ROUTING_TRAFFIC_AWARE,
      timeoutMs: env.ROUTING_TIMEOUT_MS,
    });
  }

  const cache = opts?.routeCache ?? new TtlRouteCache(env.ROUTING_CACHE_TTL_S);
  const getRouteUseCase = new GetRouteUseCase(provider, cache);

  return {
    getRouteUseCase,
    routeProvider: provider,
    routeCache: cache,
    buildAdminRoutingRouter: (auth) =>
      buildAdminRoutingRouter({
        authenticate: auth?.authenticate,
        requireSuperAdmin: auth?.requireSuperAdmin,
        getHealth: makeGetRoutingHealthController(provider),
        getMetrics: makeGetRoutingMetricsController(getRouteUseCase, provider),
      }),
  };
}
