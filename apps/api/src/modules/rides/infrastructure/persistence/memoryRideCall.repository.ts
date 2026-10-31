import type { RideCallEntity, RideCallRepositoryPort } from '../../domain/rideCall.port.js';

function clone(call: RideCallEntity): RideCallEntity {
  return {
    ...call,
    updatedAt: new Date(call.updatedAt),
    expiresAt: new Date(call.expiresAt),
    joinedParticipantIds: [...(call.joinedParticipantIds ?? [])],
    ...(call.endedAt ? { endedAt: new Date(call.endedAt) } : {}),
    ...(call.activeUserIds ? { activeUserIds: [...call.activeUserIds] } : {}),
  };
}

export class MemoryRideCallRepository implements RideCallRepositoryPort {
  private readonly rows = new Map<string, RideCallEntity>();

  async ensureReady(): Promise<void> {}

  async findById(id: string): Promise<RideCallEntity | null> {
    const row = this.rows.get(id);
    return row ? clone(row) : null;
  }

  async findByRequest(userId: string, requestId: string): Promise<RideCallEntity | null> {
    const row = [...this.rows.values()].find(
      (item) => item.callerUserId === userId && item.clientRequestId === requestId,
    );
    return row ? clone(row) : null;
  }

  async findActiveByRide(rideId: string): Promise<RideCallEntity | null> {
    const row = [...this.rows.values()].find((item) => item.rideId === rideId && item.activeUserIds);
    return row ? clone(row) : null;
  }

  async findActiveByRoom(roomName: string): Promise<RideCallEntity | null> {
    const row = [...this.rows.values()].find(
      (item) => item.roomName === roomName && item.activeUserIds,
    );
    return row ? clone(row) : null;
  }

  async findActiveByUser(userId: string): Promise<RideCallEntity | null> {
    const row = [...this.rows.values()].find((item) => item.activeUserIds?.includes(userId));
    return row ? clone(row) : null;
  }

  async create(call: RideCallEntity): Promise<void> {
    const existing = [...this.rows.values()];
    if (
      existing.some(
        (row) =>
          row.callerUserId === call.callerUserId && row.clientRequestId === call.clientRequestId,
      ) ||
      existing.some((row) => row.rideId === call.rideId && row.activeUserIds) ||
      call.activeUserIds?.some((id) => existing.some((row) => row.activeUserIds?.includes(id)))
    ) {
      const error = new Error('duplicate call reservation') as Error & { code: number };
      error.code = 11000;
      throw error;
    }
    this.rows.set(call.id, clone(call));
  }

  async update(call: RideCallEntity, expectedVersion: number): Promise<RideCallEntity | null> {
    const prior = this.rows.get(call.id);
    if (!prior || prior.version !== expectedVersion) return null;
    const saved = clone(call);
    if (!call.activeUserIds) delete saved.activeUserIds;
    this.rows.set(call.id, saved);
    return clone(saved);
  }

  async findExpiredRinging(now: Date, limit: number): Promise<RideCallEntity[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.activeUserIds && row.state === 'RINGING' && new Date(row.ringingUntil) <= now,
      )
      .slice(0, limit)
      .map(clone);
  }

  async findJoinExpired(now: Date, limit: number): Promise<RideCallEntity[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.activeUserIds &&
          row.state === 'ACCEPTED' &&
          row.joinUntil &&
          new Date(row.joinUntil) <= now,
      )
      .slice(0, limit)
      .map(clone);
  }

  async listCleanupPending(limit: number): Promise<RideCallEntity[]> {
    return [...this.rows.values()]
      .filter((row) => row.cleanupPending)
      .slice(0, limit)
      .map(clone);
  }

  async listActive(limit: number): Promise<RideCallEntity[]> {
    return [...this.rows.values()]
      .filter((row) => row.activeUserIds)
      .slice(0, limit)
      .map(clone);
  }
}
