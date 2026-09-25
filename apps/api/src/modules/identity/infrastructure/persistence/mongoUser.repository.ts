import type { UserEntity, UserRepositoryPort } from '../../domain/index.js';
import { UserModel, type UserDocument } from './user.model.js';

export class MongoUserRepository implements UserRepositoryPort {
  async findById(userId: string): Promise<UserEntity | null> {
    const doc = await UserModel.findById(userId).lean<UserDocument | null>().exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async findByPhone(phoneE164: string): Promise<UserEntity | null> {
    const doc = await UserModel.findOne({ phone_e164: phoneE164 }).lean<UserDocument | null>().exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async create(user: UserEntity): Promise<UserEntity> {
    const created = await UserModel.create({
      _id: user.id,
      phone_e164: user.phoneE164,
      phone_verified_at: user.phoneVerifiedAt,
      status: user.status,
      version: user.version,
    });
    return this.toEntity(created.toObject() as UserDocument);
  }

  async update(user: UserEntity): Promise<UserEntity> {
    const updated = await UserModel.findByIdAndUpdate(
      user.id,
      {
        phone_verified_at: user.phoneVerifiedAt,
        status: user.status,
        version: user.version + 1,
      },
      { new: true },
    )
      .lean<UserDocument | null>()
      .exec();

    if (!updated) {
      throw new Error(`User not found: ${user.id}`);
    }
    return this.toEntity(updated);
  }

  private toEntity(doc: UserDocument): UserEntity {
    return {
      id: doc._id,
      phoneE164: doc.phone_e164,
      phoneVerifiedAt: doc.phone_verified_at,
      status: doc.status,
      version: doc.version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
