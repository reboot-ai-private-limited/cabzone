import type { GeoPoint } from '@cabzone/geo';
import type {
  StateBoundaryEntity,
  StateBoundaryHistoryEntry,
  StateBoundaryRepositoryPort,
} from '../../domain/index.js';
import {
  StateBoundaryHistoryModel,
  StateBoundaryModel,
  type StateBoundaryDocument,
  type StateBoundaryHistoryDocument,
} from './stateBoundary.model.js';

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

  async listAll(): Promise<StateBoundaryEntity[]> {
    const docs = await StateBoundaryModel.find({})
      .sort({ state_code: 1 })
      .lean<StateBoundaryDocument[]>()
      .exec();
    return docs.map((d) => this.toEntity(d));
  }

  async getByCode(stateCode: string): Promise<StateBoundaryEntity | null> {
    const doc = await StateBoundaryModel.findOne({ state_code: stateCode.trim().toUpperCase() })
      .lean<StateBoundaryDocument | null>()
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async appendHistory(e: StateBoundaryHistoryEntry): Promise<void> {
    await StateBoundaryHistoryModel.create({
      _id: e.id,
      state_code: e.stateCode,
      action: e.action,
      version: e.version,
      config_version: e.configVersion,
      source: e.source,
      source_version: e.sourceVersion,
      previous_geometry: e.previousGeometry,
      actor_id: e.actorId ?? null,
      at: e.at,
    });
  }

  async listHistory(stateCode: string): Promise<StateBoundaryHistoryEntry[]> {
    const docs = await StateBoundaryHistoryModel.find({
      state_code: stateCode.trim().toUpperCase(),
    })
      .sort({ at: -1 })
      .lean<StateBoundaryHistoryDocument[]>()
      .exec();
    return docs.map((d) => ({
      id: d._id,
      stateCode: d.state_code,
      action: d.action,
      version: d.version,
      configVersion: d.config_version,
      source: d.source,
      sourceVersion: d.source_version,
      previousGeometry: d.previous_geometry,
      actorId: d.actor_id ?? null,
      at: d.at,
    }));
  }

  async updateConfigIfVersion(
    next: StateBoundaryEntity,
    expectedConfigVersion: number,
  ): Promise<StateBoundaryEntity | null> {
    // Documents written before configVersion existed have no field; treat that as version 1.
    const versionMatch =
      expectedConfigVersion === 1
        ? { $or: [{ config_version: 1 }, { config_version: { $exists: false } }] }
        : { config_version: expectedConfigVersion };
    const doc = await StateBoundaryModel.findOneAndUpdate(
      { state_code: next.stateCode, ...versionMatch },
      {
        $set: {
          state_name: next.stateName,
          status: next.status,
          intrastate_enabled: next.intrastateEnabled,
          interstate_drop_off_enabled: next.interstateDropOffEnabled,
          config_version: expectedConfigVersion + 1,
        },
      },
      { new: true },
    )
      .lean<StateBoundaryDocument | null>()
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async upsertByCode(b: StateBoundaryEntity): Promise<StateBoundaryEntity> {
    const doc = await StateBoundaryModel.findOneAndUpdate(
      { state_code: b.stateCode },
      {
        $set: {
          state_name: b.stateName,
          geometry: b.geometry,
          version: b.version,
          config_version: b.configVersion,
          status: b.status,
          intrastate_enabled: b.intrastateEnabled,
          interstate_drop_off_enabled: b.interstateDropOffEnabled,
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
      configVersion: doc.config_version ?? 1,
      status: doc.status,
      intrastateEnabled: doc.intrastate_enabled ?? true,
      interstateDropOffEnabled: doc.interstate_drop_off_enabled ?? true,
      source: doc.source,
      sourceVersion: doc.source_version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
