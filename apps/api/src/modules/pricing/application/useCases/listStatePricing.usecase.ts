import type { StatePricingDto, StatePricingStatus } from '@cabzone/contracts';
import type { StatePricingRepositoryPort } from '../../domain/index.js';
import { toStatePricingDto } from './createStatePricing.usecase.js';

export class ListStatePricingUseCase {
  constructor(private readonly statePricingRepo: StatePricingRepositoryPort) {}

  async execute(status?: StatePricingStatus): Promise<StatePricingDto[]> {
    const list = await this.statePricingRepo.findAll(status);
    return list.map(toStatePricingDto);
  }
}
