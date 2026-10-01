import type { StatePricingStatus } from '@cabzone/contracts';
import type { StatePricingEntity, StatePricingRepositoryPort } from '../../domain/index.js';
import { isStatePricingEffective } from '../../domain/index.js';

export class MemoryStatePricingRepository implements StatePricingRepositoryPort {
  private readonly statePricing = new Map<string, StatePricingEntity>();

  async findByStateCode(
    stateCode: string,
    now: Date = new Date(),
  ): Promise<StatePricingEntity | null> {
    for (const sp of this.statePricing.values()) {
      if (sp.stateCode === stateCode.toUpperCase() && isStatePricingEffective(sp, now)) {
        return { ...sp };
      }
    }
    return null;
  }

  async findById(id: string): Promise<StatePricingEntity | null> {
    const sp = this.statePricing.get(id);
    return sp ? { ...sp } : null;
  }

  async save(statePricing: StatePricingEntity): Promise<StatePricingEntity> {
    this.statePricing.set(statePricing.id, { ...statePricing });
    return { ...statePricing };
  }

  async findAll(status?: StatePricingStatus): Promise<StatePricingEntity[]> {
    const list = Array.from(this.statePricing.values());
    return list
      .filter((sp) => !status || sp.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findLatestVersion(stateCode: string): Promise<number> {
    let max = 0;
    for (const sp of this.statePricing.values()) {
      if (sp.stateCode === stateCode.toUpperCase() && sp.version > max) {
        max = sp.version;
      }
    }
    return max;
  }

  async createNewVersionAtomically(next: StatePricingEntity): Promise<StatePricingEntity> {
    const code = next.stateCode.toUpperCase();
    let currentActive: StatePricingEntity | null = null;
    let maxVersion = 0;

    for (const sp of this.statePricing.values()) {
      if (sp.stateCode === code) {
        if (sp.version > maxVersion) maxVersion = sp.version;
        if (sp.status === 'ACTIVE') currentActive = sp;
      }
    }

    if (currentActive) {
      currentActive.status = 'RETIRED';
      currentActive.effectiveTo = next.effectiveFrom;
      this.statePricing.set(currentActive.id, { ...currentActive });
    }

    const version = maxVersion + 1;
    const toSave: StatePricingEntity = {
      ...next,
      stateCode: code,
      version,
      status: 'ACTIVE',
    };
    this.statePricing.set(toSave.id, { ...toSave });
    return { ...toSave };
  }

  async retire(id: string, expectedVersion: number): Promise<StatePricingEntity | null> {
    const existing = this.statePricing.get(id);
    if (!existing || existing.version !== expectedVersion) {
      return null;
    }
    const updated: StatePricingEntity = {
      ...existing,
      status: 'RETIRED',
      effectiveTo: new Date(),
    };
    this.statePricing.set(id, updated);
    return { ...updated };
  }
}

