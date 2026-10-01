import mongoose from 'mongoose';
import type { StatePricingStatus, VehicleCategory } from '@cabzone/contracts';
import type {
  PricingConfigEntity,
  PricingConfigFilter,
  PricingConfigRepositoryPort,
  StatePricingEntity,
  StatePricingRepositoryPort,
} from '../../domain/index.js';
import {
  type PricingConfigDocument,
  PricingConfigModel,
} from './pricingConfig.model.js';
import {
  type StatePricingDocument,
  StatePricingModel,
} from './statePricing.model.js';

function toPricingConfigEntity(doc: PricingConfigDocument): PricingConfigEntity {
  return {
    id: doc._id,
    cityZoneId: doc.city_zone_id,
    version: doc.version,
    vehicleType: doc.vehicle_type,
    baseFarePaise: doc.base_fare_paise,
    ratePerKmPaise: doc.rate_per_km_paise,
    minimumFarePaise: doc.minimum_fare_paise,
    includedDistanceM: doc.included_distance_m,
    bufferSurchargePaise: doc.buffer_surcharge_paise,
    negotiationFloorPercent: doc.negotiation_floor_percent,
    negotiationCeilingPercent: doc.negotiation_ceiling_percent,
    negotiationWindowSeconds: doc.negotiation_window_seconds,
    commissionPercent: doc.commission_percent,
    effectiveFrom: doc.effective_from,
    effectiveTo: doc.effective_to,
    status: doc.status,
    createdByAdminId: doc.created_by_admin_id,
    createdAt: doc.created_at,
  };
}

function toStatePricingEntity(doc: StatePricingDocument): StatePricingEntity {
  return {
    id: doc._id,
    stateCode: doc.state_code,
    ratePerKmPaise: doc.rate_per_km_paise,
    baseFarePaise: doc.base_fare_paise,
    minimumFarePaise: doc.minimum_fare_paise,
    version: doc.version,
    status: doc.status,
    effectiveFrom: doc.effective_from,
    effectiveTo: doc.effective_to,
    createdByAdminId: doc.created_by_admin_id ?? undefined,
    createdAt: doc.created_at,
  };
}

export class MongoPricingConfigRepository implements PricingConfigRepositoryPort {
  async findEffectiveConfig(
    cityZoneId: string,
    vehicleCategory: VehicleCategory,
    now: Date = new Date(),
  ): Promise<PricingConfigEntity | null> {
    const doc = await PricingConfigModel.findOne({
      city_zone_id: cityZoneId,
      vehicle_type: vehicleCategory,
      status: 'ACTIVE',
      effective_from: { $lte: now },
      $or: [{ effective_to: null }, { effective_to: { $gt: now } }],
    }).sort({ version: -1 });

    return doc ? toPricingConfigEntity(doc) : null;
  }

  async findById(id: string): Promise<PricingConfigEntity | null> {
    const doc = await PricingConfigModel.findById(id);
    return doc ? toPricingConfigEntity(doc) : null;
  }

  async save(config: PricingConfigEntity): Promise<PricingConfigEntity> {
    const doc = await PricingConfigModel.findByIdAndUpdate(
      config.id,
      {
        city_zone_id: config.cityZoneId,
        version: config.version,
        vehicle_type: config.vehicleType,
        base_fare_paise: config.baseFarePaise,
        rate_per_km_paise: config.ratePerKmPaise,
        minimum_fare_paise: config.minimumFarePaise,
        included_distance_m: config.includedDistanceM,
        buffer_surcharge_paise: config.bufferSurchargePaise,
        negotiation_floor_percent: config.negotiationFloorPercent,
        negotiation_ceiling_percent: config.negotiationCeilingPercent,
        negotiation_window_seconds: config.negotiationWindowSeconds,
        commission_percent: config.commissionPercent,
        effective_from: config.effectiveFrom,
        effective_to: config.effectiveTo,
        status: config.status,
        created_by_admin_id: config.createdByAdminId,
        created_at: config.createdAt,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return toPricingConfigEntity(doc);
  }

  async findConfigs(filter?: PricingConfigFilter): Promise<PricingConfigEntity[]> {
    const query: Record<string, unknown> = {};
    if (filter?.cityZoneId) query.city_zone_id = filter.cityZoneId;
    if (filter?.vehicleType) query.vehicle_type = filter.vehicleType;
    if (filter?.status) query.status = filter.status;

    const docs = await PricingConfigModel.find(query).sort({ created_at: -1 });
    return docs.map(toPricingConfigEntity);
  }

  async findLatestVersion(cityZoneId: string, vehicleCategory: VehicleCategory): Promise<number> {
    const doc = await PricingConfigModel.findOne({
      city_zone_id: cityZoneId,
      vehicle_type: vehicleCategory,
    }).sort({ version: -1 });
    return doc ? doc.version : 0;
  }

  async delete(id: string): Promise<void> {
    await PricingConfigModel.findByIdAndDelete(id);
  }
}

export class MongoStatePricingRepository implements StatePricingRepositoryPort {
  async findByStateCode(
    stateCode: string,
    now: Date = new Date(),
  ): Promise<StatePricingEntity | null> {
    const doc = await StatePricingModel.findOne({
      state_code: stateCode.toUpperCase(),
      status: 'ACTIVE',
      effective_from: { $lte: now },
      $or: [{ effective_to: null }, { effective_to: { $gt: now } }],
    }).sort({ version: -1 });

    return doc ? toStatePricingEntity(doc) : null;
  }

  async findById(id: string): Promise<StatePricingEntity | null> {
    const doc = await StatePricingModel.findById(id);
    return doc ? toStatePricingEntity(doc) : null;
  }

  async save(statePricing: StatePricingEntity): Promise<StatePricingEntity> {
    const doc = await StatePricingModel.findByIdAndUpdate(
      statePricing.id,
      {
        state_code: statePricing.stateCode.toUpperCase(),
        rate_per_km_paise: statePricing.ratePerKmPaise,
        base_fare_paise: statePricing.baseFarePaise,
        minimum_fare_paise: statePricing.minimumFarePaise,
        version: statePricing.version,
        status: statePricing.status,
        effective_from: statePricing.effectiveFrom,
        effective_to: statePricing.effectiveTo,
        created_at: statePricing.createdAt,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return toStatePricingEntity(doc);
  }

  async findAll(status?: StatePricingStatus): Promise<StatePricingEntity[]> {
    const query: Record<string, unknown> = {};
    if (status) query.status = status;
    const docs = await StatePricingModel.find(query).sort({ created_at: -1 });
    return docs.map(toStatePricingEntity);
  }

  async findLatestVersion(stateCode: string): Promise<number> {
    const doc = await StatePricingModel.findOne({
      state_code: stateCode.toUpperCase(),
    }).sort({ version: -1 });
    return doc ? doc.version : 0;
  }

  async createNewVersionAtomically(next: StatePricingEntity): Promise<StatePricingEntity> {
    const session = await mongoose.startSession();
    try {
      let result: StatePricingEntity | null = null;
      await session.withTransaction(async () => {
        const code = next.stateCode.toUpperCase();
        // 1. Find current active version for this state, if any, and retire it
        const currentActive = await StatePricingModel.findOne({
          state_code: code,
          status: 'ACTIVE',
        }).session(session);

        if (currentActive) {
          currentActive.status = 'RETIRED';
          currentActive.effective_to = next.effectiveFrom;
          await currentActive.save({ session });
        }

        // 2. Find latest version number
        const latestDoc = await StatePricingModel.findOne({
          state_code: code,
        })
          .sort({ version: -1 })
          .session(session);

        const version = latestDoc ? latestDoc.version + 1 : 1;

        // 3. Insert new active document
        const created = await StatePricingModel.create(
          [
            {
              _id: next.id,
              state_code: code,
              rate_per_km_paise: next.ratePerKmPaise,
              base_fare_paise: next.baseFarePaise,
              minimum_fare_paise: next.minimumFarePaise,
              version,
              status: 'ACTIVE',
              effective_from: next.effectiveFrom,
              effective_to: null,
              created_by_admin_id: next.createdByAdminId ?? 'SYSTEM',
              created_at: next.createdAt ?? new Date(),
            },
          ],
          { session },
        );

        result = toStatePricingEntity(created[0]!);
      });

      return result!;
    } finally {
      await session.endSession();
    }
  }

  async retire(id: string, expectedVersion: number): Promise<StatePricingEntity | null> {
    const doc = await StatePricingModel.findOneAndUpdate(
      {
        _id: id,
        version: expectedVersion,
        status: { $ne: 'RETIRED' },
      },
      {
        $set: {
          status: 'RETIRED',
          effective_to: new Date(),
        },
      },
      { new: true },
    );

    return doc ? toStatePricingEntity(doc) : null;
  }
}
