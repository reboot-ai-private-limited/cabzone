import { AppError } from '../../../../shared/errors/AppError.js';
import type { PricingConfigRepositoryPort } from '../../domain/index.js';

export class DeletePricingConfigUseCase {
  constructor(private readonly pricingConfigRepo: PricingConfigRepositoryPort) {}

  async execute(id: string): Promise<void> {
    const config = await this.pricingConfigRepo.findById(id);
    if (!config) {
      throw AppError.notFound(`Pricing config ${id} not found`);
    }

    await this.pricingConfigRepo.delete(id);
  }
}
