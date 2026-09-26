import { buildHealthContainer } from '@/modules/health/health.container.js';
import { buildIdentityContainer, type IdentityContainer } from '@/modules/identity/identity.container.js';
import { buildZoneContainer, type ZoneContainer } from '@/modules/zone/zone.container.js';

export interface AppContainers {
  health: ReturnType<typeof buildHealthContainer>;
  identity: IdentityContainer;
  zone: ZoneContainer;
}

export function buildContainers(overrides?: Partial<AppContainers>): AppContainers {
  const health = overrides?.health ?? buildHealthContainer();
  const identity = overrides?.identity ?? buildIdentityContainer();
  const zone = overrides?.zone ?? buildZoneContainer();
  return {
    health,
    identity,
    zone,
  };
}
