import type { GeoPoint } from '@cabzone/geo';
import type { StateBoundaryEntity, StateBoundaryRepositoryPort } from '../../domain/index.js';
import { StateBoundaryModel, type StateBoundaryDocument } from './stateBoundary.model.js';

export class MongoStateBoundaryRepository implements StateBoundaryRepositoryPort {
  async findContainingPoint(point: GeoPoint): Promise<StateBoundaryEntity | null> {
    const doc = await StateBoundaryModel.findOne({
      status: 'ACTIVE',
      geometry: {
        $geoIntersects: {
          $geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
        },
      },
    })
      .lean<StateBoundaryDocument | null>()
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async getActiveByCode(stateCode: string): Promise<StateBoundaryEntity | null> {
    const doc = await StateBoundaryModel.findOne({
      state_code: stateCode.trim().toUpperCase(),
      status: 'ACTIVE',
    })
      .lean<StateBoundaryDocument | null>()
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async listActive(): Promise<StateBoundaryEntity[]> {
    const docs = await StateBoundaryModel.find({ status: 'ACTIVE' })
      .sort({ state_code: 1 })
      .lean<StateBoundaryDocument[]>()
      .exec();
    return docs.map((d) => this.toEntity(d));
  }

  async upsertByCode(b: StateBoundaryEntity): Promise<StateBoundaryEntity> {
    const doc = await StateBoundaryModel.findOneAndUpdate(
      { state_code: b.stateCode },
      {
        $set: {
          state_name: b.stateName,
          geometry: b.geometry,
          version: b.version,
          status: b.status,
          source: b.source,
          source_version: b.sourceVersion,
        },
        $setOnInsert: { _id: b.id },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
      .lean<StateBoundaryDocument>()
      .exec();
    return this.toEntity(doc);
  }

  private toEntity(doc: StateBoundaryDocument): StateBoundaryEntity {
    return {
      id: doc._id,
      stateCode: doc.state_code,
      stateName: doc.state_name,
      geometry: doc.geometry,
      version: doc.version,
      status: doc.status,
      source: doc.source,
      sourceVersion: doc.source_version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
