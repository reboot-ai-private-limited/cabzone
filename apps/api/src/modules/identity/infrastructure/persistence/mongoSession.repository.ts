import type { SessionEntity, SessionRepositoryPort } from '../../domain/index.js';
import { SessionModel, type SessionDocument } from './session.model.js';

export class MongoSessionRepository implements SessionRepositoryPort {
  async findById(sessionId: string): Promise<SessionEntity | null> {
    const doc = await SessionModel.findById(sessionId).lean<SessionDocument | null>().exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async findByTokenHash(tokenHash: string): Promise<SessionEntity | null> {
    const doc = await SessionModel.findOne({ refresh_token_hash: tokenHash })
      .lean<SessionDocument | null>()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async findByUserIdAndDeviceId(userId: string, deviceId: string): Promise<SessionEntity | null> {
    const doc = await SessionModel.findOne({ user_id: userId, device_id: deviceId })
      .lean<SessionDocument | null>()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async save(session: SessionEntity): Promise<void> {
    await SessionModel.findByIdAndUpdate(
      session.id,
      {
        _id: session.id,
        user_id: session.userId,
        device_id: session.deviceId,
        refresh_token_hash: session.refreshTokenHash,
        expires_at: session.expiresAt,
        revoked_at: session.revokedAt,
        last_used_at: session.lastUsedAt,
        created_at: session.createdAt,
      },
      { upsert: true },
    ).exec();
  }

  async revoke(sessionId: string): Promise<void> {
    await SessionModel.findByIdAndUpdate(sessionId, { revoked_at: new Date() }).exec();
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await SessionModel.updateMany({ user_id: userId, revoked_at: null }, { revoked_at: new Date() }).exec();
  }

  private toEntity(doc: SessionDocument): SessionEntity {
    return {
      id: doc._id,
      userId: doc.user_id,
      deviceId: doc.device_id,
      refreshTokenHash: doc.refresh_token_hash,
      expiresAt: doc.expires_at,
      revokedAt: doc.revoked_at,
      lastUsedAt: doc.last_used_at,
      createdAt: doc.created_at,
    };
  }
}
