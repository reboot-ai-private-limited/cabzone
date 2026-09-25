import type { AdminUserEntity, AdminUserRepositoryPort } from '../../domain/index.js';
import { AdminUserModel, type AdminUserDocument } from './adminUser.model.js';

export class MongoAdminUserRepository implements AdminUserRepositoryPort {
  async findByUserId(userId: string): Promise<AdminUserEntity | null> {
    const doc = await AdminUserModel.findOne({ user_id: userId })
      .lean<AdminUserDocument | null>()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  private toEntity(doc: AdminUserDocument): AdminUserEntity {
    return {
      id: doc._id,
      userId: doc.user_id,
      role: doc.role,
      cityZoneIds: doc.city_zone_ids,
      status: doc.status,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
