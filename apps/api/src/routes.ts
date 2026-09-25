import { Router } from 'express';
import type { AppContainers } from './container.js';

export function buildApiRouter(c: AppContainers): Router {
  const router = Router();
  router.use('/health', c.health.buildRouter());
  router.use('/v1/auth', c.identity.buildAuthRouter());
  return router;
}
