import type { RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { emitOperationalAlert } from '@/shared/monitoring/alerting.js';
import { getRequestId } from './request-context.js';

const SILENT_PATHS = new Set(['/api/health']);

function stripQuery(url: string): string {
  return url.split('?')[0] ?? url;
}

function isSilent(url: string): boolean {
  return SILENT_PATHS.has(stripQuery(url));
}

export function accessLogMiddleware(): RequestHandler {
  const httpLogger = pinoHttp({
    logger,
    customProps: (req) => {
      const route = (req as { route?: { path?: string } }).route?.path;
      const baseUrl = (req as { baseUrl?: string }).baseUrl ?? '';
      return {
        route: route === undefined ? stripQuery(req.url ?? '') : `${baseUrl}${route}`,
        requestId: getRequestId(),
      };
    },
    autoLogging: {
      ignore: (req) => isSilent(req.url ?? ''),
    },
    customLogLevel: (_req, res, err) => {
      if (err !== undefined && err !== null) return 'error';
      if (res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: () => 'request',
    customErrorMessage: () => 'request failed',
    serializers: {
      req: (req: { method?: string; url?: string }) => ({
        method: req.method,
        path: req.url ? stripQuery(req.url) : undefined,
      }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
  }) as unknown as RequestHandler;

  return (req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const safePath = stripQuery(req.originalUrl || req.url || '');
      if (isSilent(safePath)) return;
      const durationMs = Date.now() - startedAt;
      if (durationMs >= env.API_LATENCY_ALERT_MS) {
        void emitOperationalAlert({
          category: 'API_LATENCY',
          severity: 'warning',
          dedupeKey: `API_LATENCY:${req.method}:${safePath}`,
          summary: `Slow API response (${durationMs}ms) on ${req.method} ${safePath}`,
          metadata: {
            method: req.method,
            path: safePath,
            statusCode: res.statusCode,
            durationMs,
            thresholdMs: env.API_LATENCY_ALERT_MS,
          },
        });
      }
    });
    httpLogger(req, res, next);
  };
}
