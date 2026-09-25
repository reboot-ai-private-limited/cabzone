import { buildHealthContainer } from '@/modules/health/health.container.js';
import { buildIdentityContainer, type IdentityContainer } from '@/modules/identity/identity.container.js';

export interface AppContainers {
  health: ReturnType<typeof buildHealthContainer>;
  identity: IdentityContainer;
}

export function buildContainers(overrides?: Partial<AppContainers>): AppContainers {
  const health = overrides?.health ?? buildHealthContainer();
  const identity = overrides?.identity ?? buildIdentityContainer();
  return {
    health,
    identity,
  };
}
