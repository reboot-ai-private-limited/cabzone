import type { SessionEntity } from './session.entity.js';

export interface SessionRepositoryPort {
  findById(sessionId: string): Promise<SessionEntity | null>;
  findByTokenHash(tokenHash: string): Promise<SessionEntity | null>;
  findByUserIdAndDeviceId(userId: string, deviceId: string): Promise<SessionEntity | null>;
  save(session: SessionEntity): Promise<void>;
  revoke(sessionId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

