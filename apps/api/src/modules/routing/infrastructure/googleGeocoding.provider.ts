import type { GeoPoint } from '@cabzone/geo';
import type { ResolvedLocationDetails } from '@cabzone/contracts';
import { logger } from '@/shared/logging/logger.js';
import type { DestinationStateResolverPort } from '../domain/stateResolver.port.js';
import { getStateNameFromCode, normalizeIndiaStateName } from './indiaStateCodes.js';
import { OfflineIndiaGeoResolver } from './offlineGeoResolver.js';

export interface GoogleGeocodingProviderOptions {
  apiKey: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
  fetchFn?: typeof fetch;
}

interface GeocodeComponent {
  long_name?: string;
  short_name?: string;
  types?: string[];
}

interface GeocodeResult {
  formatted_address?: string;
  address_components?: GeocodeComponent[];
}

interface GeocodeResponse {
  results?: GeocodeResult[];
  status?: string;
}

/** Resolves point location details (country, state, city) via reverse geocoding with instant offline fallback. */
export class GoogleGeocodingProvider implements DestinationStateResolverPort {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly cache = new Map<string, { data: ResolvedLocationDetails; expiresAt: number }>();
  private readonly offlineResolver = new OfflineIndiaGeoResolver();

  constructor(opts: GoogleGeocodingProviderOptions) {
    if (!opts.apiKey || opts.apiKey.trim() === '') {
      throw new Error('GoogleGeocodingProvider requires a non-empty apiKey.');
    }
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 4000;
    this.cacheTtlMs = opts.cacheTtlMs ?? 3_600_000; // 1 hour cache
    this.fetchFn = opts.fetchFn ?? globalThis.fetch;
  }

  async resolve(point: GeoPoint): Promise<string | null> {
    const loc = await this.resolveLocation(point);
    return loc.stateCode;
  }

  async resolveLocation(point: GeoPoint): Promise<ResolvedLocationDetails> {
    const cacheKey = `${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.data, point };
    }

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${point.lat},${point.lng}`);
    url.searchParams.set('key', this.apiKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const start = Date.now();

    try {
      const response = await this.fetchFn(url.toString(), { signal: controller.signal });
      const latencyMs = Date.now() - start;

      if (!response.ok) {
        logger.warn(
          { provider: 'GOOGLE_GEOCODING', status: response.status, latencyMs },
          'Google Geocoding request failed HTTP check, falling back to offline resolver',
        );
        return await this.offlineResolver.resolveLocation(point);
      }

      const data = (await response.json()) as GeocodeResponse;
      const results = data.results ?? [];

      if (data.status !== 'OK' || results.length === 0) {
        logger.warn(
          { provider: 'GOOGLE_GEOCODING', status: data.status, latencyMs, resultCount: results.length },
          'Google Geocoding returned non-OK status or empty results, seamlessly falling back to offline resolver',
        );
        return await this.offlineResolver.resolveLocation(point);
      }

      logger.info(
        { provider: 'GOOGLE_GEOCODING', status: data.status, latencyMs, resultCount: results.length },
        'Google Geocoding reverse lookup succeeded',
      );

      // Aggregate address components across results for full coverage
      const allComponents: GeocodeComponent[] = [];
      for (const res of results) {
        if (res.address_components) {
          allComponents.push(...res.address_components);
        }
      }

      const countryComp = allComponents.find((c) => c.types?.includes('country'));
      const stateComp = allComponents.find((c) => c.types?.includes('administrative_area_level_1'));
      const districtComp = allComponents.find((c) => c.types?.includes('administrative_area_level_2'));
      const localityComp = allComponents.find((c) => c.types?.includes('locality'));
      const sublocalityComp = allComponents.find(
        (c) => c.types?.includes('sublocality_level_1') || c.types?.includes('sublocality'),
      );
      const postalComp = allComponents.find((c) => c.types?.includes('postal_code'));

      const countryName = countryComp?.long_name ?? 'India';
      const countryCode = countryComp?.short_name ?? 'IN';

      let stateName = stateComp?.long_name ?? null;
      let stateCode = stateComp
        ? normalizeIndiaStateName(stateComp.long_name ?? '') ??
          normalizeIndiaStateName(stateComp.short_name ?? '') ??
          stateComp.short_name ??
          null
        : null;

      if (stateCode && !stateName) {
        stateName = getStateNameFromCode(stateCode);
      }

      let cityName =
        localityComp?.long_name ?? sublocalityComp?.long_name ?? districtComp?.long_name ?? null;
      const districtName = districtComp?.long_name ?? null;
      const postalCode = postalComp?.long_name ?? null;
      const formattedAddress = results[0]?.formatted_address ?? null;

      // If Google failed to parse state or city from components, enrich with offline resolver
      if (!stateCode || !cityName) {
        const offlineData = await this.offlineResolver.resolveLocation(point);
        if (!stateCode) {
          stateCode = offlineData.stateCode;
          stateName = offlineData.state;
        }
        if (!cityName) {
          cityName = offlineData.city;
        }
      }

      const resolved: ResolvedLocationDetails = {
        point,
        country: countryName,
        countryCode,
        state: stateName,
        stateCode,
        city: cityName,
        district: districtName,
        postalCode,
        formattedAddress,
      };

      this.cache.set(cacheKey, { data: resolved, expiresAt: Date.now() + this.cacheTtlMs });
      return resolved;
    } catch (err) {
      logger.warn(
        { provider: 'GOOGLE_GEOCODING', err },
        'Google Geocoding request error, falling back to offline resolver',
      );
      return await this.offlineResolver.resolveLocation(point);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Offline destination state and location resolver — zero-cost, instant, reliable. */
export class NullDestinationStateResolver implements DestinationStateResolverPort {
  private readonly offlineResolver = new OfflineIndiaGeoResolver();

  async resolve(point: GeoPoint): Promise<string | null> {
    return this.offlineResolver.resolve(point);
  }

  async resolveLocation(point: GeoPoint): Promise<ResolvedLocationDetails> {
    return this.offlineResolver.resolveLocation(point);
  }
}

