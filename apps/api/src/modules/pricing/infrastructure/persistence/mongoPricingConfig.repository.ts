import {
  DEFAULT_CANCELLATION_FEE_PAISE,
  DEFAULT_DRIVER_COMPENSATION_PAISE,
  DEFAULT_DRIVER_NO_SHOW_WAIT_SECONDS,
  DEFAULT_PLATFORM_CANCELLATION_FEE_PAISE,
  DEFAULT_RIDER_CANCELLATION_GRACE_SECONDS,
  type PricingConfigLevel,
  type VehicleCategory,
} from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import {
  resolveCancellationPolicy,
  type EffectivePricingTarget,
  type PricingConfigEntity,
  type PricingConfigFilter,
  type PricingConfigRepositoryPort,
} from '../../domain/index.js';
import {
  type PricingConfigDocument,
  PricingConfigModel,
} from './pricingConfig.model.js';

function toPricingConfigEntity(doc: PricingConfigDocument): PricingConfigEntity {
  return {
    id: doc._id,
    level: doc.level ?? (doc.city_zone_id ? 'CITY' : doc.state_code ? 'STATE' : 'GLOBAL'),
    cityZoneId: doc.city_zone_id ?? null,
    stateCode: doc.state_code ?? null,
    stateName: doc.state_name ?? null,
    version: doc.version,
    vehicleType: doc.vehicle_type,
    baseFarePaise: doc.base_fare_paise,
    ratePerKmPaise: doc.rate_per_km_paise,
    minimumFarePaise: doc.minimum_fare_paise,
    outstationBaseFarePaise: doc.outstation_base_fare_paise,
    outstationRatePerKmPaise: doc.outstation_rate_per_km_paise,
    outstationMinimumFarePaise: doc.outstation_minimum_fare_paise,
    bufferSurchargePaise: doc.buffer_surcharge_paise,
    negotiationFloorPercent: doc.negotiation_floor_percent,
    negotiationCeilingPercent: doc.negotiation_ceiling_percent,
    negotiationWindowSeconds: doc.negotiation_window_seconds,
    commissionPercent: doc.commission_percent,
    cancellationFeePaise: doc.cancellation_fee_paise ?? DEFAULT_CANCELLATION_FEE_PAISE,
    driverCompensationPaise: doc.driver_compensation_paise ?? DEFAULT_DRIVER_COMPENSATION_PAISE,
    platformCancellationFeePaise:
      doc.platform_cancellation_fee_paise ?? DEFAULT_PLATFORM_CANCELLATION_FEE_PAISE,
    riderCancellationGraceSeconds:
      doc.rider_cancellation_grace_seconds ?? DEFAULT_RIDER_CANCELLATION_GRACE_SECONDS,
    driverNoShowWaitSeconds:
      doc.driver_no_show_wait_seconds ?? DEFAULT_DRIVER_NO_SHOW_WAIT_SECONDS,
    effectiveFrom: doc.effective_from,
    effectiveTo: doc.effective_to,
    status: doc.status,
    createdByAdminId: doc.created_by_admin_id,
    createdAt: doc.created_at,
  };
}

export class MongoPricingConfigRepository implements PricingConfigRepositoryPort {
  async findEffectiveConfig(
    target: string | EffectivePricingTarget,
    vehicleCategory: VehicleCategory,
    now: Date = new Date(),
  ): Promise<PricingConfigEntity | null> {
    const cityZoneId = typeof target === 'string' ? target : target.cityZoneId;
    const stateCode = typeof target === 'object' ? target.stateCode : undefined;

    const effectiveFilter = {
      status: 'ACTIVE',
      effective_from: { $lte: now },
      $or: [{ effective_to: null }, { effective_to: { $gt: now } }],
    };

    // 1. City Zone level
    if (cityZoneId) {
      const doc = await PricingConfigModel.findOne({
        city_zone_id: cityZoneId,
        vehicle_type: vehicleCategory,
        ...effectiveFilter,
      }).sort({ version: -1 });

      if (doc) return toPricingConfigEntity(doc);
    }

    // 2. State level
    if (stateCode) {
      const doc = await PricingConfigModel.findOne({
        level: 'STATE',
        state_code: stateCode.toUpperCase(),
        vehicle_type: vehicleCategory,
        ...effectiveFilter,
      }).sort({ version: -1 });

      if (doc) return toPricingConfigEntity(doc);
    }

    // 3. Global baseline
    const globalDoc = await PricingConfigModel.findOne({
      level: 'GLOBAL',
      vehicle_type: vehicleCategory,
      ...effectiveFilter,
    }).sort({ version: -1 });

    return globalDoc ? toPricingConfigEntity(globalDoc) : null;
  }

  async findEffectiveConfigByState(
    stateCode: string,
    vehicleCategory: VehicleCategory,
    now: Date = new Date(),
  ): Promise<PricingConfigEntity | null> {
    const effectiveFilter = {
      status: 'ACTIVE',
      effective_from: { $lte: now },
      $or: [{ effective_to: null }, { effective_to: { $gt: now } }],
    };

    // 1. State level
    const doc = await PricingConfigModel.findOne({
      level: 'STATE',
      state_code: stateCode.toUpperCase(),
      vehicle_type: vehicleCategory,
      ...effectiveFilter,
    }).sort({ version: -1 });

    if (doc) return toPricingConfigEntity(doc);

    // 2. Global fallback
    const globalDoc = await PricingConfigModel.findOne({
      level: 'GLOBAL',
      vehicle_type: vehicleCategory,
      ...effectiveFilter,
    }).sort({ version: -1 });

    return globalDoc ? toPricingConfigEntity(globalDoc) : null;
  }

  async findById(id: string): Promise<PricingConfigEntity | null> {
    const doc = await PricingConfigModel.findById(id);
    return doc ? toPricingConfigEntity(doc) : null;
  }

  async save(config: PricingConfigEntity, expectedVersion?: number): Promise<PricingConfigEntity> {
    const policy = resolveCancellationPolicy(config);
    const doc = await PricingConfigModel.findOneAndUpdate(
      { _id: config.id, ...(expectedVersion === undefined ? {} : { version: expectedVersion }) },
      {
        level: config.level,
        city_zone_id: config.cityZoneId,
        state_code: config.stateCode ? config.stateCode.toUpperCase() : null,
        state_name: config.stateName ?? null,
        version: config.version,
        vehicle_type: config.vehicleType,
        base_fare_paise: config.baseFarePaise,
        rate_per_km_paise: config.ratePerKmPaise,
        minimum_fare_paise: config.minimumFarePaise,
        outstation_base_fare_paise: config.outstationBaseFarePaise,
        outstation_rate_per_km_paise: config.outstationRatePerKmPaise,
        outstation_minimum_fare_paise: config.outstationMinimumFarePaise,
        buffer_surcharge_paise: config.bufferSurchargePaise,
        negotiation_floor_percent: config.negotiationFloorPercent,
        negotiation_ceiling_percent: config.negotiationCeilingPercent,
        negotiation_window_seconds: config.negotiationWindowSeconds,
        commission_percent: config.commissionPercent,
        cancellation_fee_paise: policy.cancellationFeePaise,
        driver_compensation_paise: policy.driverCompensationPaise,
        platform_cancellation_fee_paise: policy.platformCancellationFeePaise,
        rider_cancellation_grace_seconds: policy.riderCancellationGraceSeconds,
        driver_no_show_wait_seconds: policy.driverNoShowWaitSeconds,
        effective_from: config.effectiveFrom,
        effective_to: config.effectiveTo,
        status: config.status,
        created_by_admin_id: config.createdByAdminId,
        created_at: config.createdAt,
      },
      { upsert: expectedVersion === undefined, new: true, setDefaultsOnInsert: true, runValidators: true },
    );
    if (!doc) throw AppError.conflict('PRICING_CHANGED: Refresh pricing before retrying.');
    return toPricingConfigEntity(doc);
  }

  async findConfigs(filter?: PricingConfigFilter): Promise<PricingConfigEntity[]> {
    const query: Record<string, unknown> = {};
    if (filter?.allowedCityZoneIds) query.$and = [{ level: 'CITY', city_zone_id: { $in: filter.allowedCityZoneIds } }];
    if (filter?.level) query.level = filter.level;
    if (filter?.cityZoneId) query.city_zone_id = filter.cityZoneId;
    if (filter?.stateCode) query.state_code = filter.stateCode.toUpperCase();
    if (filter?.vehicleType) query.vehicle_type = filter.vehicleType;
    if (filter?.status) query.status = filter.status;

    const docs = await PricingConfigModel.find(query).sort({ created_at: -1 });
    return docs.map(toPricingConfigEntity);
  }

  async findLatestVersion(
    target: string | { cityZoneId?: string | null; stateCode?: string | null; level?: PricingConfigLevel },
    vehicleCategory: VehicleCategory,
  ): Promise<number> {
    const cityZoneId = typeof target === 'string' ? target : target.cityZoneId;
    const stateCode = typeof target === 'object' ? target.stateCode : undefined;
    const level = typeof target === 'object' ? target.level : undefined;

    const query: Record<string, unknown> = {
      vehicle_type: vehicleCategory,
    };

    if (level === 'GLOBAL') {
      query.level = 'GLOBAL';
    } else if (stateCode || level === 'STATE') {
      query.level = 'STATE';
      query.state_code = stateCode?.toUpperCase();
    } else if (cityZoneId) {
      query.city_zone_id = cityZoneId;
    }

    const doc = await PricingConfigModel.findOne(query).sort({ version: -1 });
    return doc ? doc.version : 0;
  }

  async delete(id: string): Promise<void> {
    await PricingConfigModel.findByIdAndDelete(id);
  }
}
