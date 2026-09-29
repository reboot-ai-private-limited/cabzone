import type { StatePricingStatus } from '@cabzone/contracts';
import type { StatePricingEntity } from './statePricing.entity.js';

export interface StatePricingRepositoryPort {
  findByStateCode(stateCode: string, now?: Date): Promise<StatePricingEntity | null>;
  findById(id: string): Promise<StatePricingEntity | null>;
  save(statePricing: StatePricingEntity): Promise<StatePricingEntity>;
  findAll(status?: StatePricingStatus): Promise<StatePricingEntity[]>;
  findLatestVersion(stateCode: string): Promise<number>;
}
