import { Router } from 'express';
import type { AppContainers } from './container.js';

export function buildApiRouter(c: AppContainers): Router {
  const router = Router();
  router.use('/health', c.health.buildRouter());
  return router;
}
