import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { env } from '@/config/env.js';
import { errorHandler, notFoundHandler } from '@/shared/http/error-handler.js';
import { accessLogMiddleware } from '@/shared/http/access-log.middleware.js';
import { requestIdMiddleware } from '@/shared/http/request-id.middleware.js';
import { shouldCaptureRawBody } from '@/shared/http/rawBody.js';
import { buildContainers, type AppContainers } from './container.js';
import { buildApiRouter } from './routes.js';

export function createApp(containerOverrides?: Partial<AppContainers>): Express {
  const app = express();
  const containers = buildContainers(containerOverrides);

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestIdMiddleware());
  app.use(accessLogMiddleware());

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(
    express.json({
      limit: '1mb',
      // State boundary uploads are large GeoJSON files; that route parses its own body after
      // authentication (see stateBoundary.routes.ts).
      type: (req) =>
        !(req.url ?? '').startsWith('/api/v1/admin/reference/states/import') &&
        String(req.headers['content-type'] ?? '').includes('application/json'),
      verify: (req, _res, buf) => {
        if (shouldCaptureRawBody(req.url)) {
          (req as express.Request).rawBody = buf.toString('utf8');
        }
      },
    }),
  );
  app.use(cookieParser());

  app.use('/api', buildApiRouter(containers));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
