import type { GeoPoint } from '@cabzone/contracts';
import type { ZoneEntity, ZoneFilter, ZoneRepositoryPort } from '../../domain/index.js';
import { ZoneModel, type ZoneDocument } from './zone.model.js';

export class MongoZoneRepository implements ZoneRepositoryPort {
  async findActiveExclusionsContainingPoint(point: GeoPoint): Promise<ZoneEntity[]> {
    const docs = await ZoneModel.find({
      zone_type: 'EXCLUSION',
      status: 'ACTIVE',
      boundary: {
        $geoIntersects: {
          $geometry: {
            type: 'Point',
            coordinates: [point.lng, point.lat],
          },
        },
      },
    })
      .lean<ZoneDocument[]>()
      .exec();

    return docs.map((doc) => this.toEntity(doc));
  }

  async findActiveCitiesContainingPoint(point: GeoPoint): Promise<ZoneEntity[]> {
    const docs = await ZoneModel.find({
      zone_type: 'CITY',
      status: 'ACTIVE',
      boundary: {
        $geoIntersects: {
          $geometry: {
            type: 'Point',
            coordinates: [point.lng, point.lat],
          },
        },
      },
    })
      .lean<ZoneDocument[]>()
      .exec();

    return docs.map((doc) => this.toEntity(doc));
  }

  async findActivePickupsContainingPoint(point: GeoPoint): Promise<ZoneEntity[]> {
    const docs = await ZoneModel.find({
      zone_type: 'PICKUP',
      status: 'ACTIVE',
      boundary: {
        $geoIntersects: {
          $geometry: {
            type: 'Point',
            coordinates: [point.lng, point.lat],
          },
        },
      },
    })
      .lean<ZoneDocument[]>()
      .exec();

    return docs.map((doc) => this.toEntity(doc));
  }

  async findNearestActiveCity(point: GeoPoint): Promise<ZoneEntity | null> {
    const docs = await ZoneModel.find({
      zone_type: 'CITY',
      status: 'ACTIVE',
      boundary: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [point.lng, point.lat],
          },
        },
      },
    })
      .limit(1)
      .lean<ZoneDocument[]>()
      .exec();

    const doc = docs[0];
    return doc ? this.toEntity(doc) : null;
  }

  async findById(id: string): Promise<ZoneEntity | null> {
    const doc = await ZoneModel.findById(id).lean<ZoneDocument | null>().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async save(zone: ZoneEntity): Promise<ZoneEntity> {
    const doc = await ZoneModel.findByIdAndUpdate(
      zone.id,
      {
        _id: zone.id,
        name: zone.name,
        zone_type: zone.zoneType,
        parent_city_zone_id: zone.parentCityZoneId,
        state_code: zone.stateCode,
        boundary: zone.boundary,
        buffer_distance_m: zone.bufferDistanceM,
        status: zone.status,
        current_pricing_config_id: zone.currentPricingConfigId,
        version: zone.version,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
      .lean<ZoneDocument>()
      .exec();

    return this.toEntity(doc);
  }

  async list(filter?: ZoneFilter): Promise<ZoneEntity[]> {
    const query: Record<string, unknown> = {};
    if (filter?.status) query['status'] = filter.status;
    if (filter?.zoneType) query['zone_type'] = filter.zoneType;
    if (filter?.parentCityZoneId !== undefined) {
      query['parent_city_zone_id'] = filter.parentCityZoneId;
    }

    const docs = await ZoneModel.find(query).lean<ZoneDocument[]>().exec();
    return docs.map((doc) => this.toEntity(doc));
  }

  private toEntity(doc: ZoneDocument): ZoneEntity {
    return {
      id: doc._id,
      name: doc.name,
      zoneType: doc.zone_type,
      parentCityZoneId: doc.parent_city_zone_id,
      stateCode: doc.state_code,
      boundary: doc.boundary,
      bufferDistanceM: doc.buffer_distance_m,
      status: doc.status,
      currentPricingConfigId: doc.current_pricing_config_id,
      version: doc.version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
