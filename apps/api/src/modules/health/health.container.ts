import type { Router } from 'express';
import { GetHealthUseCase } from './application/useCases/getHealth.usecase.js';
import type { HealthProbePort } from './domain/healthProbe.port.js';
import { MongoHealthProbe } from './infrastructure/mongoHealthProbe.adapter.js';
import { RedisHealthProbe } from './infrastructure/redisHealthProbe.adapter.js';
import { makeGetHealthController } from './interface/health.controller.js';
import { buildHealthRouter } from './interface/health.routes.js';
import type { HealthPublicContract } from './health.public.js';

export interface HealthContainer {
  contract: HealthPublicContract;
  buildRouter: () => Router;
}

export function buildHealthContainer(): HealthContainer {
  const probes: HealthProbePort[] = [new MongoHealthProbe(), new RedisHealthProbe()];

  const getHealth = new GetHealthUseCase(probes);

  return {
    contract: {
      report: () => getHealth.execute(),
    },
    buildRouter: () => buildHealthRouter(makeGetHealthController(getHealth)),
  };
}
