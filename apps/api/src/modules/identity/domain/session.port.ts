import type { SessionEntity } from './session.entity.js';

export interface SessionRepositoryPort {
  findById(sessionId: string): Promise<SessionEntity | null>;
}
