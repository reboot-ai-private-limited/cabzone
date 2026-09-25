import { buildHealthContainer } from '@/modules/health/health.container.js';

export interface AppContainers {
  health: ReturnType<typeof buildHealthContainer>;
}

export function buildContainers(): AppContainers {
  const health = buildHealthContainer();
  return {
    health,
  };
}
