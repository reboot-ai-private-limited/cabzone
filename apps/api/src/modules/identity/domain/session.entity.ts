export interface SessionEntity {
  id: string;
  userId: string;
  deviceId: string;
  refreshTokenHash: string;
  previousRefreshTokenHash?: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date;
  createdAt: Date;
}

export function isSessionActive(session: SessionEntity, now: Date = new Date()): boolean {
  if (session.revokedAt !== null) {
    return false;
  }
  return session.expiresAt > now;
}
