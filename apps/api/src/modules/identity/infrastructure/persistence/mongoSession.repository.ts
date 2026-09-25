import type { SessionEntity, SessionRepositoryPort } from '../../domain/index.js';
import { SessionModel, type SessionDocument } from './session.model.js';

export class MongoSessionRepository implements SessionRepositoryPort {
  async findById(sessionId: string): Promise<SessionEntity | null> {
    const doc = await SessionModel.findById(sessionId).lean<SessionDocument | null>().exec();
    if (!doc) return null;
    return this.toEntity(doc);
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
