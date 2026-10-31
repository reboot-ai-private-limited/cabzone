import type { RideCallEntity, RideCallRepositoryPort } from '../../domain/rideCall.port.js';
import { RideCallModel, type RideCallDocument } from './rideCall.model.js';

function toEntity(doc: RideCallDocument): RideCallEntity {
  return {
    id: doc._id,
    rideId: doc.ride_id,
    callerUserId: doc.caller_user_id,
    calleeUserId: doc.callee_user_id,
    callerInstallationId: doc.caller_installation_id,
    calleeInstallationId: doc.callee_installation_id,
    clientRequestId: doc.client_request_id,
    roomName: doc.room_name,
    callerParticipantId: doc.caller_participant_id,
    calleeParticipantId: doc.callee_participant_id,
    joinedParticipantIds: doc.joined_participant_ids ?? [],
    state: doc.state,
    callerRole: doc.caller_role,
    createdAt: doc.created_at.toISOString(),
    ringingUntil: doc.ringing_until.toISOString(),
    joinUntil: doc.join_until?.toISOString() ?? null,
    connectedAt: doc.connected_at?.toISOString() ?? null,
    endedAt: doc.ended_at,
    endReason: doc.end_reason,
    cleanupPending: doc.cleanup_pending,
    updatedAt: doc.updated_at,
    expiresAt: doc.expires_at,
    ...(doc.active_user_ids ? { activeUserIds: doc.active_user_ids } : {}),
    version: doc.version,
  };
}

function toDocument(call: RideCallEntity): RideCallDocument {
  return {
    _id: call.id,
    ride_id: call.rideId,
    caller_user_id: call.callerUserId,
    callee_user_id: call.calleeUserId,
    caller_installation_id: call.callerInstallationId,
    callee_installation_id: call.calleeInstallationId,
    client_request_id: call.clientRequestId,
    room_name: call.roomName,
    caller_participant_id: call.callerParticipantId,
    callee_participant_id: call.calleeParticipantId,
    joined_participant_ids: call.joinedParticipantIds ?? [],
    state: call.state,
    caller_role: call.callerRole,
    ringing_until: new Date(call.ringingUntil),
    join_until: call.joinUntil ? new Date(call.joinUntil) : null,
    connected_at: call.connectedAt ? new Date(call.connectedAt) : null,
    ended_at: call.endedAt,
    end_reason: call.endReason,
    cleanup_pending: call.cleanupPending,
    ...(call.activeUserIds ? { active_user_ids: call.activeUserIds } : {}),
    version: call.version,
    created_at: new Date(call.createdAt),
    updated_at: call.updatedAt,
    expires_at: call.expiresAt,
  };
}

export class MongoRideCallRepository implements RideCallRepositoryPort {
  async ensureReady(): Promise<void> {
    await RideCallModel.init();
  }

  async findById(id: string): Promise<RideCallEntity | null> {
    const doc = await RideCallModel.findById(id).lean<RideCallDocument>().exec();
    return doc ? toEntity(doc) : null;
  }

  async findByRequest(
    callerUserId: string,
    clientRequestId: string,
  ): Promise<RideCallEntity | null> {
    const doc = await RideCallModel.findOne({
      caller_user_id: callerUserId,
      client_request_id: clientRequestId,
    })
      .lean<RideCallDocument>()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async findActiveByRide(rideId: string): Promise<RideCallEntity | null> {
    const doc = await RideCallModel.findOne({
      ride_id: rideId,
      active_user_ids: { $exists: true },
    })
      .lean<RideCallDocument>()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async findActiveByRoom(roomName: string): Promise<RideCallEntity | null> {
    const doc = await RideCallModel.findOne({
      room_name: roomName,
      active_user_ids: { $exists: true },
    })
      .lean<RideCallDocument>()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async findActiveByUser(userId: string): Promise<RideCallEntity | null> {
    const doc = await RideCallModel.findOne({ active_user_ids: userId })
      .lean<RideCallDocument>()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async create(call: RideCallEntity): Promise<void> {
    await RideCallModel.create([toDocument(call)]);
  }

  async update(call: RideCallEntity, expectedVersion: number): Promise<RideCallEntity | null> {
    const doc = toDocument(call);
    const activeUserIds = doc.active_user_ids;
    const fields: Partial<RideCallDocument> = { ...doc };
    delete fields._id;
    delete fields.active_user_ids;
    const result = await RideCallModel.findOneAndUpdate(
      { _id: call.id, version: expectedVersion },
      {
        $set: activeUserIds ? { ...fields, active_user_ids: activeUserIds } : fields,
        ...(activeUserIds ? {} : { $unset: { active_user_ids: 1 } }),
      },
      { new: true },
    )
      .lean<RideCallDocument>()
      .exec();
    return result ? toEntity(result) : null;
  }

  async findExpiredRinging(now: Date, limit: number): Promise<RideCallEntity[]> {
    const rows = await RideCallModel.find({
      state: 'RINGING',
      ringing_until: { $lte: now },
      active_user_ids: { $exists: true },
    })
      .sort({ ringing_until: 1 })
      .limit(limit)
      .lean<RideCallDocument[]>()
      .exec();
    return rows.map(toEntity);
  }

  async findJoinExpired(now: Date, limit: number): Promise<RideCallEntity[]> {
    const rows = await RideCallModel.find({
      state: 'ACCEPTED',
      join_until: { $lte: now },
      active_user_ids: { $exists: true },
    })
      .sort({ join_until: 1 })
      .limit(limit)
      .lean<RideCallDocument[]>()
      .exec();
    return rows.map(toEntity);
  }

  async listCleanupPending(limit: number): Promise<RideCallEntity[]> {
    const rows = await RideCallModel.find({ cleanup_pending: true })
      .sort({ updated_at: 1 })
      .limit(limit)
      .lean<RideCallDocument[]>()
      .exec();
    return rows.map(toEntity);
  }

  async listActive(limit: number): Promise<RideCallEntity[]> {
    const rows = await RideCallModel.find({ active_user_ids: { $exists: true } })
      .sort({ updated_at: 1 })
      .limit(limit)
      .lean<RideCallDocument[]>()
      .exec();
    return rows.map(toEntity);
  }
}
