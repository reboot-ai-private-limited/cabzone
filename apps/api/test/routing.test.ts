import { describe, expect, it, vi } from 'vitest';
import {
  GoogleRoutesProvider,
  HaversineRouteProvider,
  TtlRouteCache,
  GetRouteUseCase,
  buildRoutingContainer,
} from '../src/modules/routing/index.js';
import { AppError } from '../src/shared/errors/AppError.js';

describe('Routing Module', () => {
  const origin = { lat: 26.7271, lng: 88.3953 };
  const destination = { lat: 26.85, lng: 88.39 };
  const req = { origin, destination, vehicleCategory: 'CAB' as const };

  describe('HaversineRouteProvider', () => {
    it('estimates distance with road curvature factor and calculates duration', async () => {
      const provider = new HaversineRouteProvider();
      const res = await provider.calculateRoute(req);

      expect(res.provider).toBe('HAVERSINE_ESTIMATE');
      expect(res.distanceM).toBeGreaterThan(13000); // ~13.7 km straight line * 1.3
      expect(res.durationS).toBeGreaterThan(1500);
      expect(res.polyline).toBeNull();
    });
  });

  describe('GoogleRoutesProvider', () => {
    it('throws if constructed with empty API key', () => {
      expect(() => new GoogleRoutesProvider({ apiKey: '' })).toThrow();
    });

    it('successfully computes route and parses duration and polyline', async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          routes: [
            {
              distanceMeters: 15420,
              duration: '1840s',
              polyline: { encodedPolyline: 'a~l~Fjk_uO_seK_seK' },
            },
          ],
        }),
      });

      const provider = new GoogleRoutesProvider({
        apiKey: 'test-key',
        fetchFn: fakeFetch as unknown as typeof fetch,
      });

      const res = await provider.calculateRoute(req);
      expect(res.provider).toBe('GOOGLE_ROUTES');
      expect(res.distanceM).toBe(15420);
      expect(res.durationS).toBe(1840);
      expect(res.polyline).toBe('a~l~Fjk_uO_seK_seK');
      expect(fakeFetch).toHaveBeenCalledTimes(1);

      // Verify request payload headers and structure
      const [url, init] = fakeFetch.mock.calls[0];
      expect(url).toContain('routes.googleapis.com');
      expect(init.headers['X-Goog-Api-Key']).toBe('test-key');
      expect(init.headers['X-Goog-FieldMask']).toBe(
        'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      );
      const body = JSON.parse(init.body);
      expect(body.travelMode).toBe('DRIVE');
      expect(body.origin.location.latLng.latitude).toBe(origin.lat);
    });

    it('does not retry 4xx errors and maps to 503 ROUTE_UNAVAILABLE', async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        status: 400,
        json: async () => ({ error: { message: 'Invalid field mask' } }),
      });

      const provider = new GoogleRoutesProvider({
        apiKey: 'test-key',
        fetchFn: fakeFetch as unknown as typeof fetch,
      });

      await expect(provider.calculateRoute(req)).rejects.toThrow(
        /ROUTE_UNAVAILABLE: Routing provider rejected request \(400\)/,
      );
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });

    it('retries once on 5xx errors from Google before throwing 503', async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        status: 503,
        json: async () => ({ error: { message: 'Overloaded' } }),
      });

      const provider = new GoogleRoutesProvider({
        apiKey: 'test-key',
        fetchFn: fakeFetch as unknown as typeof fetch,
      });

      await expect(provider.calculateRoute(req)).rejects.toThrow(
        /ROUTE_UNAVAILABLE: Routing service error/,
      );
      expect(fakeFetch).toHaveBeenCalledTimes(2);
    });

    it('retries once on network failure / abort and succeeds on second attempt', async () => {
      const fakeFetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            routes: [
              {
                distanceMeters: 10000,
                duration: '1200s',
                polyline: { encodedPolyline: 'sample' },
              },
            ],
          }),
        });

      const provider = new GoogleRoutesProvider({
        apiKey: 'test-key',
        fetchFn: fakeFetch as unknown as typeof fetch,
      });

      const res = await provider.calculateRoute(req);
      expect(res.distanceM).toBe(10000);
      expect(fakeFetch).toHaveBeenCalledTimes(2);
    });

    it('throws 503 when no routes found', async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ routes: [] }),
      });

      const provider = new GoogleRoutesProvider({
        apiKey: 'test-key',
        fetchFn: fakeFetch as unknown as typeof fetch,
      });

      await expect(provider.calculateRoute(req)).rejects.toThrow(
        /ROUTE_UNAVAILABLE: No driving route could be found/,
      );
    });

    it('throws 503 on malformed duration format', async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          routes: [{ distanceMeters: 5000, duration: 'not-a-number' }],
        }),
      });

      const provider = new GoogleRoutesProvider({
        apiKey: 'test-key',
        fetchFn: fakeFetch as unknown as typeof fetch,
      });

      await expect(provider.calculateRoute(req)).rejects.toThrow(
        /ROUTE_UNAVAILABLE: Malformed route duration/,
      );
    });
  });

  describe('TtlRouteCache', () => {
    it('stores and retrieves cached items', () => {
      const cache = new TtlRouteCache(60);
      const result = {
        provider: 'GOOGLE_ROUTES',
        distanceM: 5000,
        durationS: 600,
        polyline: 'xyz',
      };

      cache.set('key1', result);
      expect(cache.get('key1')).toEqual(result);
      expect(cache.get('key2')).toBeNull();
    });

    it('expires items after ttl', () => {
      const cache = new TtlRouteCache(-1); // immediately expired
      cache.set('key1', {
        provider: 'GOOGLE_ROUTES',
        distanceM: 1000,
        durationS: 100,
        polyline: null,
      });

      expect(cache.get('key1')).toBeNull();
    });

    it('evicts oldest items when max size reached', () => {
      const cache = new TtlRouteCache(60, 2);
      const r = (d: number) => ({
        provider: 'TEST',
        distanceM: d,
        durationS: 100,
        polyline: null,
      });

      cache.set('a', r(1));
      cache.set('b', r(2));
      cache.set('c', r(3));

      expect(cache.size()).toBe(2);
      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).not.toBeNull();
      expect(cache.get('c')).not.toBeNull();
    });
  });

  describe('GetRouteUseCase', () => {
    it('uses cache and records metrics', async () => {
      const provider = new HaversineRouteProvider();
      const cache = new TtlRouteCache(60);
      const useCase = new GetRouteUseCase(provider, cache);

      const r1 = await useCase.execute(req);
      const m1 = useCase.getMetrics();
      expect(m1.requests).toBe(1);
      expect(m1.cacheHits).toBe(0);

      // Second call should hit cache
      const r2 = await useCase.execute(req);
      expect(r2).toEqual(r1);
      const m2 = useCase.getMetrics();
      expect(m2.requests).toBe(2);
      expect(m2.cacheHits).toBe(1);
    });

    it('tracks failure metric on error', async () => {
      const failingProvider = {
        calculateRoute: vi.fn().mockRejectedValue(new Error('Down')),
      };
      const cache = new TtlRouteCache(60);
      const useCase = new GetRouteUseCase(failingProvider, cache);

      await expect(useCase.execute(req)).rejects.toThrow('Down');
      const m = useCase.getMetrics();
      expect(m.requests).toBe(1);
      expect(m.failures).toBe(1);
      expect(m.cacheHits).toBe(0);
    });
  });

  describe('buildRoutingContainer', () => {
    it('builds with default haversine in non-production', () => {
      const container = buildRoutingContainer();
      expect(container.getRouteUseCase).toBeDefined();
      expect(container.routeProvider).toBeInstanceOf(HaversineRouteProvider);
    });

    it('refuses to construct haversine provider when in production', async () => {
      const envModule = await import('../src/config/env.js');
      const originalIsProduction = envModule.isProduction;
      try {
        Object.defineProperty(envModule, 'isProduction', { value: true, configurable: true });
        expect(() => buildRoutingContainer()).toThrow(
          /Haversine route provider is strictly forbidden in production/,
        );
      } finally {
        Object.defineProperty(envModule, 'isProduction', { value: originalIsProduction, configurable: true });
      }
    });
  });
});
