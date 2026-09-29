import { env } from '@/config/env.js';
import { buildHealthContainer } from '@/modules/health/health.container.js';
import { buildIdentityContainer, type IdentityContainer } from '@/modules/identity/identity.container.js';
import {
  buildPricingContainer,
  MongoPricingConfigRepository,
  MongoStatePricingRepository,
  type PricingContainer,
} from '@/modules/pricing/index.js';
import { buildStateBoundaryContainer, type StateBoundaryContainer } from '@/modules/stateBoundary/index.js';
import { buildZoneContainer, type ZoneContainer } from '@/modules/zone/zone.container.js';

export interface AppContainers {
  health: ReturnType<typeof buildHealthContainer>;
  identity: IdentityContainer;
  stateBoundary: StateBoundaryContainer;
  zone: ZoneContainer;
  pricing: PricingContainer;
}

export function buildContainers(overrides?: Partial<AppContainers>): AppContainers {
  const health = overrides?.health ?? buildHealthContainer();
  const identity = overrides?.identity ?? buildIdentityContainer();
  const stateBoundary = overrides?.stateBoundary ?? buildStateBoundaryContainer();
  const zone =
    overrides?.zone ??
    buildZoneContainer({ serviceabilityGuard: stateBoundary.assertServiceableUseCase });
  const pricing =
    overrides?.pricing ??
    buildPricingContainer({
      pricingConfigRepo: new MongoPricingConfigRepository(),
      statePricingRepo: new MongoStatePricingRepository(),
      serviceClassificationUseCase: zone.serviceClassificationUseCase,
      tokenSecret: env.JWT_ACCESS_SECRET,
    });

  return {
    health,
    identity,
    stateBoundary,
    zone,
    pricing,
  };
}
