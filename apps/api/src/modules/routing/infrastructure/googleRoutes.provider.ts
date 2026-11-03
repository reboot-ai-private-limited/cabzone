import type { TollInfoDto } from '@cabzone/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/logging/logger.js';
import type { RouteProviderPort, RouteRequest, RouteResult } from '../domain/index.js';

export interface GoogleRoutesProviderOptions {
  apiKey: string;
  trafficAware?: boolean;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

interface GoogleTollInfo {
  estimatedPrice?: Array<{ currencyCode?: string; units?: string; nanos?: number }>;
}

interface ComputeRoutesResponse {
  routes?: Array<{
    travelAdvisory?: { tollInfo?: GoogleTollInfo };
    distanceMeters?: number;
    duration?: string;
    polyline?: {
      encodedPolyline?: string;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export class GoogleRoutesProvider implements RouteProviderPort {
  readonly name = 'GOOGLE_ROUTES' as const;
  private readonly apiKey: string;
  private readonly trafficAware: boolean;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(opts: GoogleRoutesProviderOptions) {
    if (!opts.apiKey || opts.apiKey.trim() === '') {
      throw new Error('GoogleRoutesProvider requires a non-empty apiKey.');
    }
    this.apiKey = opts.apiKey;
    this.trafficAware = opts.trafficAware ?? false;
    this.timeoutMs = opts.timeoutMs ?? 4000;
    this.fetchFn = opts.fetchFn ?? globalThis.fetch;
  }

  async calculateRoute(req: RouteRequest): Promise<RouteResult> {
    const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';
    const body = {
      origin: {
        location: {
          latLng: {
            latitude: req.origin.lat,
            longitude: req.origin.lng,
          },
        },
      },
      destination: {
        location: {
          latLng: {
            latitude: req.destination.lat,
            longitude: req.destination.lng,
          },
        },
      },
      ...(req.waypoints?.length
        ? {
            intermediates: req.waypoints.map((w) => ({
              location: { latLng: { latitude: w.lat, longitude: w.lng } },
            })),
          }
        : {}),
      travelMode: 'DRIVE',
      routingPreference: this.trafficAware ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE',
      units: 'METRIC',
      extraComputations: ['TOLLS'],
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': this.apiKey,
      'X-Goog-FieldMask':
        'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.travelAdvisory.tollInfo',
    };

    let attempt = 0;
    let lastError: unknown;

    while (attempt < 2) {
      attempt++;
      const start = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchFn(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timer);
        const latencyMs = Date.now() - start;

        logger.info(
          {
            provider: 'GOOGLE_ROUTES',
            status: response.status,
            latencyMs,
            attempt,
          },
          'Google Routes computeRoutes executed',
        );

        // 4xx errors are client errors or configuration issues — do not retry
        if (response.status >= 400 && response.status < 500) {
          const errBody = (await response.json().catch(() => null)) as ComputeRoutesResponse | null;
          throw new AppError({
            statusCode: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: `ROUTE_UNAVAILABLE: Routing provider rejected request (${response.status})`,
            cause: errBody,
          });
        }

        // 5xx errors from Google can be retried once
        if (response.status >= 500) {
          lastError = new Error(`Google Routes returned 5xx status: ${response.status}`);
          if (attempt < 2) {
            continue;
          }
          throw new AppError({
            statusCode: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: 'ROUTE_UNAVAILABLE: Routing service error from external provider.',
            cause: lastError,
          });
        }

        const data = (await response.json()) as ComputeRoutesResponse;
        const firstRoute = data.routes?.[0];

        if (!firstRoute) {
          throw new AppError({
            statusCode: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: 'ROUTE_UNAVAILABLE: No driving route could be found between the locations.',
          });
        }

        const distanceM = firstRoute.distanceMeters;
        const durationRaw = firstRoute.duration;

        if (
          typeof distanceM !== 'number' ||
          !Number.isFinite(distanceM) ||
          distanceM <= 0 ||
          typeof durationRaw !== 'string'
        ) {
          throw new AppError({
            statusCode: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: 'ROUTE_UNAVAILABLE: Malformed route calculation response.',
          });
        }

        const durationSeconds = Math.round(Number(durationRaw.replace('s', '')));
        if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
          throw new AppError({
            statusCode: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: 'ROUTE_UNAVAILABLE: Malformed route duration.',
          });
        }

        return {
          tollInfo: parseTollInfo(firstRoute.travelAdvisory?.tollInfo),
          provider: 'GOOGLE_ROUTES',
          distanceM: Math.round(distanceM),
          durationS: durationSeconds,
          polyline: firstRoute.polyline?.encodedPolyline ?? null,
        };
      } catch (err) {
        clearTimeout(timer);
        lastError = err;

        // If it's already an AppError (e.g. 4xx or invalid data), rethrow immediately
        if (err instanceof AppError) {
          throw err;
        }

        // For abort/timeout or network error, retry once if attempt == 1
        if (attempt < 2) {
          continue;
        }

        throw new AppError({
          statusCode: 503,
          code: 'SERVICE_UNAVAILABLE',
          message: 'ROUTE_UNAVAILABLE: Failed to calculate route via Google Routes.',
          cause: lastError,
        });
      }
    }

    throw new AppError({
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'ROUTE_UNAVAILABLE: Routing provider is unreachable.',
      cause: lastError,
    });
  }
}

function parseTollInfo(info: GoogleTollInfo | undefined): TollInfoDto {
  if (!info) return { exists: false, estimatedAmountPaise: 0, currency: 'INR' };
  const prices = info.estimatedPrice;
  let amount: number | null = null;
  if (prices?.length === 1 && prices[0]?.currencyCode === 'INR') {
    const price = prices[0];
    const units = price.units ?? '0';
    const nanos = price.nanos ?? 0;
    if (/^\d+$/.test(units) && Number.isInteger(nanos) && nanos >= 0 && nanos < 1e9) {
      const paise = Number(units) * 100 + Math.round(nanos / 1e7);
      if (Number.isSafeInteger(paise)) amount = paise;
    }
  }
  return { exists: true, estimatedAmountPaise: amount, currency: 'INR' };
}
