import type { RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '@/shared/logging/logger.js';
import { getRequestId } from './request-context.js';

const SILENT_PATHS = new Set(['/api/health']);

function isSilent(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return SILENT_PATHS.has(path);
}

export function accessLogMiddleware(): RequestHandler {
  return pinoHttp({
    logger,
    customProps: (req) => {
      const route = (req as { route?: { path?: string } }).route?.path;
      const baseUrl = (req as { baseUrl?: string }).baseUrl ?? '';
      return {
        route: route === undefined ? (req.url?.split('?')[0] ?? '') : `${baseUrl}${route}`,
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
        path: req.url?.split('?')[0],
      }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
  }) as unknown as RequestHandler;
}
