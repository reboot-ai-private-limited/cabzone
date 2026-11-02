import type { PipelineStage } from 'mongoose';
import type {
  AdminUserEntity,
  AdminUserListFilter,
  AdminUserRepositoryPort,
  AdminUserWithUser,
} from '../../domain/index.js';
import { AdminUserModel, type AdminUserDocument } from './adminUser.model.js';

export class MongoAdminUserRepository implements AdminUserRepositoryPort {
  async findByUserId(userId: string): Promise<AdminUserEntity | null> {
    const doc = await AdminUserModel.findOne({ user_id: userId })
      .lean<AdminUserDocument | null>()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async findById(id: string): Promise<AdminUserEntity | null> {
    const doc = await AdminUserModel.findById(id)
      .lean<AdminUserDocument | null>()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async save(admin: AdminUserEntity): Promise<AdminUserEntity> {
    const doc = await AdminUserModel.findOneAndUpdate(
      { _id: admin.id },
      {
        $set: {
          user_id: admin.userId,
          name: admin.name,
          email: admin.email,
          password_hash: admin.passwordHash ?? null,
          role: admin.role,
          city_zone_ids: admin.cityZoneIds,
          status: admin.status,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
      .lean<AdminUserDocument>()
      .exec();
    return this.toEntity(doc);
  }

  async update(
    id: string,
    updates: Partial<
      Pick<AdminUserEntity, 'name' | 'email' | 'role' | 'cityZoneIds' | 'status' | 'passwordHash'>
    >,
  ): Promise<AdminUserEntity | null> {
    const setFields: Record<string, unknown> = {};
    if (updates.name !== undefined) setFields.name = updates.name;
    if (updates.email !== undefined) setFields.email = updates.email;
    if (updates.passwordHash !== undefined) setFields.password_hash = updates.passwordHash;
    if (updates.role !== undefined) setFields.role = updates.role;
    if (updates.cityZoneIds !== undefined) setFields.city_zone_ids = updates.cityZoneIds;
    if (updates.status !== undefined) setFields.status = updates.status;

    if (Object.keys(setFields).length === 0) {
      return this.findById(id);
    }

    const doc = await AdminUserModel.findByIdAndUpdate(id, { $set: setFields }, { new: true })
      .lean<AdminUserDocument | null>()
      .exec();

    if (!doc) return null;
    return this.toEntity(doc);
  }

  async list(
    filter: AdminUserListFilter = {},
  ): Promise<{ admins: AdminUserWithUser[]; total: number }> {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const offset = Math.max(filter.offset ?? 0, 0);

    const pipeline: PipelineStage[] = [
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    ];
    const matchConditions: Record<string, unknown>[] = [];

    if (filter.status) {
      matchConditions.push({ status: filter.status });
    }

    if (filter.role) {
      matchConditions.push({ role: filter.role });
    }

    if (filter.zoneId) {
      matchConditions.push({ city_zone_ids: filter.zoneId });
    }

    if (filter.search && filter.search.trim()) {
      const s = filter.search.trim();
      const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      matchConditions.push({
        $or: [
          { name: { $regex: regex } },
          { email: { $regex: regex } },
          { 'user.phone_e164': { $regex: regex } },
          { _id: { $regex: regex } },
          { user_id: { $regex: regex } },
        ],
      });
    }

    if (matchConditions.length === 1 && matchConditions[0]) {
      pipeline.push({ $match: matchConditions[0] });
    } else if (matchConditions.length > 1) {
      pipeline.push({ $match: { $and: matchConditions } });
    }

    pipeline.push({
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $sort: { created_at: -1 } }, { $skip: offset }, { $limit: limit }],
      },
    });

    const [facetResult] = (await AdminUserModel.aggregate(pipeline).exec()) as [
      | { metadata: { total: number }[]; data: (AdminUserDocument & { user?: { phone_e164?: string } })[] }
      | undefined,
    ];

    const total = facetResult?.metadata?.[0]?.total ?? 0;
    const data = facetResult?.data ?? [];

    const admins: AdminUserWithUser[] = data.map((doc) => ({
      ...this.toEntity(doc),
      phoneE164: doc.user?.phone_e164 ?? '',
    }));

    return { admins, total };
  }

  private toEntity(doc: AdminUserDocument): AdminUserEntity {
    return {
      id: doc._id,
      userId: doc.user_id,
      name: doc.name ?? null,
      email: doc.email ?? null,
      passwordHash: doc.password_hash ?? null,
      role: doc.role,
      cityZoneIds: doc.city_zone_ids ?? [],
      status: doc.status,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
