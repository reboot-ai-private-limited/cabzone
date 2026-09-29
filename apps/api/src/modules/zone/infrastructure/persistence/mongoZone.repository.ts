import type { GeoJsonPolygon, GeoPoint } from '@cabzone/contracts';
import type { ZoneEntity, ZoneFilter, ZoneRepositoryPort } from '../../domain/index.js';
import { ZoneModel, type ZoneDocument } from './zone.model.js';

export class MongoZoneRepository implements ZoneRepositoryPort {
  async findActiveCitiesContainingPoint(point: GeoPoint): Promise<ZoneEntity[]> {
    const geoPoint = {
      type: 'Point',
      coordinates: [point.lng, point.lat],
    };

    const docs = await ZoneModel.find({
      zone_type: 'CITY',
      status: 'ACTIVE',
      $or: [
        { geometry: { $geoIntersects: { $geometry: geoPoint } } },
        { boundary: { $geoIntersects: { $geometry: geoPoint } } },
      ],
    })
      .lean<ZoneDocument[]>()
      .exec();

    return docs.map((doc) => this.toEntity(doc));
  }

  async findActivePickupsContainingPoint(point: GeoPoint): Promise<ZoneEntity[]> {
    const geoPoint = {
      type: 'Point',
      coordinates: [point.lng, point.lat],
    };

    const docs = await ZoneModel.find({
      zone_type: 'PICKUP',
      status: 'ACTIVE',
      $or: [
        { geometry: { $geoIntersects: { $geometry: geoPoint } } },
        { boundary: { $geoIntersects: { $geometry: geoPoint } } },
      ],
    })
      .lean<ZoneDocument[]>()
      .exec();

    return docs.map((doc) => this.toEntity(doc));
  }

  async findActiveHillsContainingPoint(point: GeoPoint): Promise<ZoneEntity[]> {
    const geoPoint = {
      type: 'Point',
      coordinates: [point.lng, point.lat],
    };

    const docs = await ZoneModel.find({
      zone_type: 'HILL',
      status: 'ACTIVE',
      $or: [
        { geometry: { $geoIntersects: { $geometry: geoPoint } } },
        { boundary: { $geoIntersects: { $geometry: geoPoint } } },
      ],
    })
      .lean<ZoneDocument[]>()
      .exec();

    return docs.map((doc) => this.toEntity(doc));
  }

  async findNearestActiveCity(point: GeoPoint): Promise<ZoneEntity | null> {
    const geoPoint = {
      type: 'Point',
      coordinates: [point.lng, point.lat],
    };

    // Try near query on geometry first, then boundary if needed
    try {
      const doc = await ZoneModel.findOne({
        zone_type: 'CITY',
        status: 'ACTIVE',
        geometry: {
          $near: {
            $geometry: geoPoint,
          },
        },
      })
        .lean<ZoneDocument | null>()
        .exec();

      if (doc) return this.toEntity(doc);
    } catch {
      // Fallback to boundary index if geometry index not yet built
      const doc = await ZoneModel.findOne({
        zone_type: 'CITY',
        status: 'ACTIVE',
        boundary: {
          $near: {
            $geometry: geoPoint,
          },
        },
      })
        .lean<ZoneDocument | null>()
        .exec();

      if (doc) return this.toEntity(doc);
    }

    return null;
  }

  async findById(id: string): Promise<ZoneEntity | null> {
    const doc = await ZoneModel.findById(id).lean<ZoneDocument | null>().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByCode(code: string): Promise<ZoneEntity | null> {
    const doc = await ZoneModel.findOne({ code: code.trim().toUpperCase() })
      .sort({ version: -1 })
      .lean<ZoneDocument | null>()
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async save(zone: ZoneEntity): Promise<ZoneEntity> {
    const doc = await ZoneModel.findByIdAndUpdate(
      zone.id,
      {
        _id: zone.id,
        name: zone.name,
        code: zone.code,
        zone_type: zone.zoneType,
        parent_city_zone_id: zone.parentCityZoneId,
        state_code: zone.stateCode,
        geometry: zone.geometry,
        boundary: zone.boundary,
        buffer_distance_m: zone.bufferDistanceM,
        pickup_charge_type: zone.pickupChargeType ?? null,
        pickup_charge_paise: zone.pickupChargePaise ?? null,
        status: zone.status,
        current_pricing_config_id: zone.currentPricingConfigId,
        version: zone.version,
        supersedes_zone_id: zone.supersedesZoneId,
        superseded_by_zone_id: zone.supersededByZoneId,
        created_by: zone.createdBy,
        updated_by: zone.updatedBy,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
      .lean<ZoneDocument>()
      .exec();

    return this.toEntity(doc);
  }

  async deleteById(id: string): Promise<boolean> {
    const res = await ZoneModel.deleteOne({ _id: id }).exec();
    return res.deletedCount > 0;
  }

  async list(filter?: ZoneFilter): Promise<ZoneEntity[]> {
    const query = this.buildFilterQuery(filter);
    const docs = await ZoneModel.find(query).sort({ created_at: -1 }).lean<ZoneDocument[]>().exec();
    return docs.map((doc) => this.toEntity(doc));
  }

  async listPaginated(filter?: ZoneFilter): Promise<{ items: ZoneEntity[]; total: number }> {
    const query = this.buildFilterQuery(filter);
    const total = await ZoneModel.countDocuments(query).exec();

    const page = Math.max(1, filter?.page ?? 1);
    const limit = Math.max(1, Math.min(100, filter?.limit ?? 20));
    const skip = (page - 1) * limit;

    const docs = await ZoneModel.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean<ZoneDocument[]>()
      .exec();

    return {
      items: docs.map((doc) => this.toEntity(doc)),
      total,
    };
  }

  async findHistoryByZoneId(zoneId: string): Promise<ZoneEntity[]> {
    const target = await ZoneModel.findById(zoneId).lean<ZoneDocument | null>().exec();
    if (!target) return [];

    const docs = await ZoneModel.find({
      $or: [{ code: target.code }, { _id: zoneId }],
    })
      .sort({ version: -1 })
      .lean<ZoneDocument[]>()
      .exec();

    return docs.map((doc) => this.toEntity(doc));
  }

  private buildFilterQuery(filter?: ZoneFilter): Record<string, unknown> {
    const query: Record<string, unknown> = {};
    if (filter?.status) query['status'] = filter.status;
    const targetType = filter?.type ?? filter?.zoneType;
    if (targetType) query['zone_type'] = targetType;
    if (filter?.parentCityZoneId !== undefined) {
      query['parent_city_zone_id'] = filter.parentCityZoneId;
    }
    if (filter?.search) {
      const escaped = filter.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query['$or'] = [
        { name: { $regex: escaped, $options: 'i' } },
        { code: { $regex: escaped, $options: 'i' } },
      ];
    }
    return query;
  }

  private toEntity(doc: ZoneDocument): ZoneEntity {
    const geometry = doc.geometry || doc.boundary;
    const boundary: GeoJsonPolygon =
      geometry.type === 'Polygon'
        ? (geometry as GeoJsonPolygon)
        : {
            type: 'Polygon',
            coordinates: (geometry.coordinates[0] as GeoJsonPolygon['coordinates']) ?? [],
          };

    return {
      id: doc._id,
      name: doc.name,
      code: doc.code ?? doc._id.substring(0, 8).toUpperCase(),
      zoneType: doc.zone_type,
      parentCityZoneId: doc.parent_city_zone_id,
      stateCode: doc.state_code,
      geometry,
      boundary,
      bufferDistanceM: doc.buffer_distance_m,
      pickupChargeType: doc.pickup_charge_type ?? null,
      pickupChargePaise: doc.pickup_charge_paise ?? null,
      status: doc.status,
      currentPricingConfigId: doc.current_pricing_config_id,
      version: doc.version ?? 1,
      supersedesZoneId: doc.supersedes_zone_id ?? null,
      supersededByZoneId: doc.superseded_by_zone_id ?? null,
      createdBy: doc.created_by ?? null,
      updatedBy: doc.updated_by ?? null,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
