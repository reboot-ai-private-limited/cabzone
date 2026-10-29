import type { Router } from 'express';
import { isProdLike } from '@/config/env.js';
import { GetHealthUseCase } from './application/useCases/getHealth.usecase.js';
import type { HealthProbePort } from './domain/healthProbe.port.js';
import { MongoHealthProbe } from './infrastructure/mongoHealthProbe.adapter.js';
import { QueueHealthProbe } from './infrastructure/queueHealthProbe.adapter.js';
import { RedisHealthProbe } from './infrastructure/redisHealthProbe.adapter.js';
import { makeGetHealthController } from './interface/health.controller.js';
import { buildHealthRouter } from './interface/health.routes.js';
import { registerHealthSwaggerPaths } from './interface/health.swagger.js';
import type { HealthPublicContract } from './health.public.js';

export interface HealthContainer {
  contract: HealthPublicContract;
  buildRouter: () => Router;
}

export function buildHealthContainer(deps?: {
  probes?: HealthProbePort[];
  alertOnDegraded?: boolean;
}): HealthContainer {
  registerHealthSwaggerPaths();
  const probes: HealthProbePort[] = deps?.probes ?? [
    new MongoHealthProbe(),
    new RedisHealthProbe(),
    new QueueHealthProbe(),
  ];

  const getHealth = new GetHealthUseCase(
    probes,
    () => process.uptime(),
    deps?.alertOnDegraded ?? isProdLike,
  );

  return {
    contract: {
      report: () => getHealth.execute(),
    },
    buildRouter: () => buildHealthRouter(makeGetHealthController(getHealth)),
  };
}
