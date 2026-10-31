import { randomBytes } from 'node:crypto';
import {
  RIDE_CALL_JOIN_TIMEOUT_MS,
  RIDE_CALL_RETENTION_MS,
  RIDE_CALL_RING_TIMEOUT_MS,
  RIDE_CALL_TOKEN_TTL_S,
  type AuthContext,
  type RideCallDto,
  type RideCallTokenDto,
} from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import { logger } from '../../../../shared/logging/logger.js';
import { emitOperationalAlert } from '../../../../shared/monitoring/alerting.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import type { RideEntity } from '../../domain/ride.entity.js';
import type { RideRepositoryPort } from '../../domain/ride.port.js';
import type { RideCommunicationAccessUseCase } from './rideCommunicationAccess.usecase.js';
import type {
  RideCallEntity,
  RideCallPushPort,
  RideCallRepositoryPort,
  RideVoiceProviderPort,
} from '../../domain/rideCall.port.js';

export interface RideCallsDeps {
  access: RideCommunicationAccessUseCase;
  rideRepo: RideRepositoryPort;
  calls: RideCallRepositoryPort;
  unitOfWork: UnitOfWorkPort;
  provider: RideVoiceProviderPort;
  enabled: boolean;
  providerUrl: string;
  getUserIdForRider: (riderId: string) => Promise<string | null>;
  getUserIdForDriver: (driverId: string) => Promise<string | null>;
  getCallerDisplayName?: ((ride: RideEntity, callerRole: 'RIDER' | 'DRIVER') => Promise<string>) | undefined;
  isInstallationRegistered?: ((userId: string, installationId: string) => Promise<boolean>) | undefined;
  requireRegisteredInstallation?: boolean | undefined;
  push: RideCallPushPort;
  now?: (() => Date) | undefined;
}

function callDto(call: RideCallEntity): RideCallDto {
  return {
    id: call.id,
    rideId: call.rideId,
    state: call.state,
    callerRole: call.callerRole,
    createdAt: call.createdAt,
    ringingUntil: call.ringingUntil,
    joinUntil: call.joinUntil,
    connectedAt: call.connectedAt,
  };
}

function duplicateKey(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export class RideCallsUseCase {
  constructor(private readonly deps: RideCallsDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private isRetained(call: RideCallEntity | null): call is RideCallEntity {
    return Boolean(call && call.expiresAt > this.now());
  }

  requireEnabled(): void {
    if (!this.deps.enabled) {
      throw new AppError({
        statusCode: 503,
        code: 'INTERNAL',
        message: 'Private calling is not enabled.',
      });
    }
  }

  private requireParticipant(call: RideCallEntity, actor: AuthContext): 'caller' | 'callee' {
    if (actor.userId === call.callerUserId) return 'caller';
    if (actor.userId === call.calleeUserId) return 'callee';
    throw AppError.notFound('CALL_UNAVAILABLE: Call not found.');
  }

  private async verifyInstallation(actor: AuthContext, installationId: string): Promise<string> {
    const trimmed = installationId.trim();
    if (!trimmed) {
      throw AppError.badRequest('CALL_INSTALLATION_REQUIRED: installationId is required.');
    }
    if (actor.deviceId && actor.deviceId !== trimmed) {
      throw AppError.forbidden(
        'CALL_INSTALLATION_MISMATCH: Installation does not match active session.',
      );
    }
    if (
      this.deps.requireRegisteredInstallation &&
      !(await this.deps.isInstallationRegistered?.(actor.userId, trimmed))
    ) {
      throw AppError.forbidden(
        'CALL_INSTALLATION_REQUIRED: Register this installation before calling.',
      );
    }
    return actor.deviceId ?? trimmed;
  }

  private async serializeRide(rideId: string, actor: AuthContext): Promise<RideEntity> {
    const { ride } = await this.deps.access.execute(rideId, actor);
    if (
      !ride.driverId ||
      !this.deps.rideRepo.allocateChatSequence ||
      (await this.deps.rideRepo.allocateChatSequence(rideId, ride.driverId)) === null
    ) {
      throw AppError.conflict('COMMUNICATION_CLOSED: Ride communication is unavailable.');
    }
    return ride;
  }

  private async probeBothParticipantsJoined(call: RideCallEntity): Promise<boolean> {
    if (!this.deps.provider.listParticipantIds) return false;
    try {
      const ids = await this.deps.provider.listParticipantIds(call.roomName);
      return (
        ids.includes(call.callerParticipantId) && ids.includes(call.calleeParticipantId)
      );
    } catch {
      return false;
    }
  }

  private async promoteConnected(call: RideCallEntity, joinedIds: string[]): Promise<RideCallEntity | null> {
    const now = this.now();
    const updated = await this.deps.calls.update(
      {
        ...call,
        joinedParticipantIds: joinedIds,
        state: 'CONNECTED',
        connectedAt: call.connectedAt ?? now.toISOString(),
        expiresAt: new Date(now.getTime() + RIDE_CALL_RETENTION_MS),
        updatedAt: now,
        version: call.version + 1,
      },
      call.version,
    );
    if (updated) {
      await Promise.all([
        this.notify(updated, updated.callerUserId, 'changed'),
        this.notify(updated, updated.calleeUserId, 'changed'),
      ]);
    }
    return updated;
  }

  private async resolveActiveCall(call: RideCallEntity | null): Promise<RideCallEntity | null> {
    if (!this.isRetained(call) || !call.activeUserIds) return null;
    const now = this.now();
    if (call.state === 'RINGING' && new Date(call.ringingUntil) <= now) {
      await this.finish(call, 'MISSED', 'ring_timeout');
      return null;
    }
    if (call.state === 'ACCEPTED' && call.joinUntil && new Date(call.joinUntil) <= now) {
      if (await this.probeBothParticipantsJoined(call)) {
        return (
          (await this.promoteConnected(call, [
            call.callerParticipantId,
            call.calleeParticipantId,
          ])) ?? call
        );
      }
      await this.finish(call, 'FAILED', 'join_timeout');
      return null;
    }
    return call;
  }

  async current(rideId: string, actor: AuthContext): Promise<RideCallDto | null> {
    this.requireEnabled();
    await this.deps.calls.ensureReady();
    await this.deps.access.execute(rideId, actor);
    const active = await this.resolveActiveCall(await this.deps.calls.findActiveByRide(rideId));
    if (!active) return null;
    this.requireParticipant(active, actor);
    return callDto(active);
  }

  async start(
    rideId: string,
    actor: AuthContext,
    installationId: string,
    clientRequestId: string,
  ): Promise<RideCallDto> {
    this.requireEnabled();
    await this.deps.access.execute(rideId, actor);
    const boundInstallationId = await this.verifyInstallation(actor, installationId);
    await this.deps.calls.ensureReady();

    // Clear any overdue deadline before entering the reservation transaction.
    await this.resolveActiveCall(await this.deps.calls.findActiveByRide(rideId));
    await this.resolveActiveCall(await this.deps.calls.findActiveByUser(actor.userId));

    const now = this.now();
    let result: { call: RideCallEntity; ride: RideEntity; created: boolean };
    try {
      result = await this.deps.unitOfWork.run(async () => {
        const prior = await this.deps.calls.findByRequest(actor.userId, clientRequestId);
        if (this.isRetained(prior)) {
          if (prior.rideId !== rideId) throw AppError.notFound('CALL_UNAVAILABLE: Call not found.');
          const { ride } = await this.deps.access.execute(rideId, actor);
          return { call: prior, ride, created: false };
        }
        const { ride, participantRole } = await this.deps.access.execute(rideId, actor);
        await this.serializeRide(rideId, actor);
        if (!ride.driverId) {
          throw AppError.conflict('CALL_UNAVAILABLE: This ride has no assigned driver.');
        }
        const callerIsRider = participantRole === 'RIDER';
        const calleeUserId = callerIsRider
          ? await this.deps.getUserIdForDriver(ride.driverId)
          : await this.deps.getUserIdForRider(ride.bookerRiderId);
        if (!calleeUserId || calleeUserId === actor.userId) {
          throw AppError.conflict('CALL_UNAVAILABLE: Call participant is unavailable.');
        }
        const active = await this.deps.calls.findActiveByRide(rideId);
        if (this.isRetained(active)) {
          if (
            [active.callerUserId, active.calleeUserId].includes(actor.userId) &&
            [active.callerUserId, active.calleeUserId].includes(calleeUserId)
          ) {
            return { call: active, ride, created: false };
          }
          throw AppError.conflict('CALL_BUSY: A ride call is already active.');
        }
        const ownActive = await this.deps.calls.findActiveByUser(actor.userId);
        if (this.isRetained(ownActive)) {
          throw AppError.conflict('CALL_BUSY: You are already on another ride call.');
        }
        const calleeActive = await this.deps.calls.findActiveByUser(calleeUserId);
        if (this.isRetained(calleeActive)) {
          throw AppError.conflict('CALL_BUSY: The other participant is already on a call.');
        }
        const ringingUntil = new Date(now.getTime() + RIDE_CALL_RING_TIMEOUT_MS);
        const call: RideCallEntity = {
          id: newUuid(),
          rideId,
          callerUserId: actor.userId,
          calleeUserId,
          callerInstallationId: boundInstallationId,
          calleeInstallationId: null,
          clientRequestId,
          roomName: `rc_${randomBytes(16).toString('hex')}`,
          callerParticipantId: `p_${randomBytes(12).toString('hex')}`,
          calleeParticipantId: `p_${randomBytes(12).toString('hex')}`,
          joinedParticipantIds: [],
          state: 'RINGING',
          callerRole: participantRole,
          createdAt: now.toISOString(),
          ringingUntil: ringingUntil.toISOString(),
          joinUntil: null,
          connectedAt: null,
          endedAt: null,
          endReason: null,
          cleanupPending: false,
          expiresAt: new Date(now.getTime() + RIDE_CALL_RETENTION_MS),
          activeUserIds: [actor.userId, calleeUserId],
          updatedAt: now,
          version: 1,
        };
        await this.deps.calls.create(call);
        return { call, ride, created: true };
      });
    } catch (error) {
      if (!duplicateKey(error)) throw error;
      const prior =
        (await this.deps.calls.findByRequest(actor.userId, clientRequestId)) ??
        (await this.deps.calls.findActiveByRide(rideId));
      if (
        this.isRetained(prior) &&
        prior.rideId === rideId &&
        (prior.callerUserId === actor.userId || prior.calleeUserId === actor.userId)
      ) {
        return callDto(prior);
      }
      throw AppError.conflict('CALL_BUSY: A participant is already on another ride call.');
    }
    if (result.created) {
      const callerName =
        (await this.deps.getCallerDisplayName
          ?.(result.ride, result.call.callerRole)
          .catch(() => null)) ??
        (result.call.callerRole === 'DRIVER' ? 'Your driver' : 'Your rider');
      await this.notify(result.call, result.call.calleeUserId, 'incoming', callerName);
    }
    return callDto(result.call);
  }

  async answer(
    rideId: string,
    callId: string,
    actor: AuthContext,
    installationId: string,
  ): Promise<RideCallDto> {
    this.requireEnabled();
    const call = await this.requireCall(rideId, callId, actor);
    if (this.requireParticipant(call, actor) !== 'callee') {
      throw AppError.notFound('CALL_UNAVAILABLE: Call not found.');
    }
    const boundInstallationId = await this.verifyInstallation(actor, installationId);
    const now = this.now();
    const updated = await this.deps.unitOfWork.run(async () => {
      await this.serializeRide(rideId, actor);
      const fresh = await this.deps.calls.findById(callId);
      if (!this.isRetained(fresh)) {
        throw AppError.notFound('CALL_UNAVAILABLE: Call not found.');
      }
      if (fresh.state === 'ACCEPTED' && fresh.calleeInstallationId === boundInstallationId) {
        return fresh;
      }
      if (fresh.state !== 'RINGING') {
        throw AppError.conflict('CALL_ALREADY_ANSWERED: This call is no longer ringing.');
      }
      if (new Date(fresh.ringingUntil) <= now) {
        throw AppError.conflict('CALL_EXPIRED: This call has expired.');
      }
      const next: RideCallEntity = {
        ...fresh,
        state: 'ACCEPTED',
        calleeInstallationId: boundInstallationId,
        joinUntil: new Date(now.getTime() + RIDE_CALL_JOIN_TIMEOUT_MS).toISOString(),
        expiresAt: new Date(now.getTime() + RIDE_CALL_RETENTION_MS),
        updatedAt: now,
        version: fresh.version + 1,
      };
      const saved = await this.deps.calls.update(next, fresh.version);
      if (!saved) {
        throw AppError.conflict('CALL_ALREADY_ANSWERED: This call is no longer ringing.');
      }
      return saved;
    });
    await this.notify(updated, updated.callerUserId, 'changed');
    return callDto(updated);
  }

  async decline(rideId: string, callId: string, actor: AuthContext): Promise<RideCallDto> {
    const call = await this.requireCall(rideId, callId, actor);
    if (this.requireParticipant(call, actor) !== 'callee') {
      throw AppError.notFound('CALL_UNAVAILABLE: Call not found.');
    }
    if (call.state !== 'RINGING') {
      if (call.state === 'DECLINED') return callDto(call);
      throw AppError.conflict('CALL_UNAVAILABLE: Call is no longer ringing.');
    }
    return this.finish(call, 'DECLINED', 'declined');
  }

  async end(rideId: string, callId: string, actor: AuthContext): Promise<RideCallDto> {
    const call = await this.requireCall(rideId, callId, actor, false);
    this.requireParticipant(call, actor);
    return this.finish(call, call.state === 'RINGING' ? 'CANCELLED' : 'ENDED', 'ended');
  }

  async endCurrent(actor: AuthContext): Promise<{ ended: boolean }> {
    await this.deps.calls.ensureReady();
    const call = await this.deps.calls.findActiveByUser(actor.userId);
    if (!this.isRetained(call)) return { ended: false };
    this.requireParticipant(call, actor);
    await this.finish(call, call.state === 'RINGING' ? 'CANCELLED' : 'ENDED', 'logout');
    return { ended: true };
  }

  async endForUser(userId: string, reason: 'logout' | 'access_revoked'): Promise<void> {
    await this.deps.calls.ensureReady();
    const call = await this.deps.calls.findActiveByUser(userId);
    if (!this.isRetained(call)) return;
    await this.finish(call, call.state === 'RINGING' ? 'CANCELLED' : 'ENDED', reason);
  }

  async endForInstallation(
    userId: string,
    installationId: string,
    reason: 'logout',
  ): Promise<void> {
    await this.deps.calls.ensureReady();
    const call = await this.deps.calls.findActiveByUser(userId);
    if (!this.isRetained(call)) return;
    const isCallerMatch =
      call.callerUserId === userId && call.callerInstallationId === installationId;
    const isCalleeMatch =
      call.calleeUserId === userId &&
      (!call.calleeInstallationId || call.calleeInstallationId === installationId);
    if (isCallerMatch || isCalleeMatch) {
      await this.finish(call, call.state === 'RINGING' ? 'CANCELLED' : 'ENDED', reason);
    }
  }

  async token(
    rideId: string,
    callId: string,
    actor: AuthContext,
    installationId: string,
  ): Promise<RideCallTokenDto> {
    this.requireEnabled();
    await this.deps.access.execute(rideId, actor);
    const boundInstallationId = await this.verifyInstallation(actor, installationId);
    const now = this.now();
    const expiry = new Date(now.getTime() + RIDE_CALL_TOKEN_TTL_S * 1000);

    // Serialize token issuance against finish()/ride closure via version increment inside UoW.
    const authorized = await this.deps.unitOfWork.run(async () => {
      const call = await this.requireCall(rideId, callId, actor);
      await this.serializeRide(rideId, actor);
      const side = this.requireParticipant(call, actor);
      if (call.state !== 'ACCEPTED' && call.state !== 'CONNECTED') {
        throw AppError.conflict('CALL_UNAVAILABLE: Call is not accepted.');
      }
      if (
        call.state === 'ACCEPTED' &&
        (!call.joinUntil || new Date(call.joinUntil) <= this.now())
      ) {
        throw AppError.conflict('CALL_EXPIRED: Call join window expired.');
      }
      if (
        (side === 'caller' && call.callerInstallationId !== boundInstallationId) ||
        (side === 'callee' && call.calleeInstallationId !== boundInstallationId)
      ) {
        throw AppError.forbidden(
          'CALL_INSTALLATION_MISMATCH: This call belongs to another installation.',
        );
      }
      const saved = await this.deps.calls.update(
        { ...call, updatedAt: this.now(), version: call.version + 1 },
        call.version,
      );
      if (!saved || !saved.activeUserIds) {
        throw AppError.conflict('CALL_UNAVAILABLE: Call is no longer active.');
      }
      return {
        roomName: saved.roomName,
        participantId:
          side === 'caller' ? saved.callerParticipantId : saved.calleeParticipantId,
      };
    });

    const token = await this.deps.provider.issueToken(authorized);

    // Re-check after async provider call in case finish() ran while createRoom/issueToken awaited.
    const after = await this.deps.calls.findById(callId);
    if (!after || !after.activeUserIds) {
      if (after) await this.cleanup(after);
      throw AppError.conflict('CALL_UNAVAILABLE: Call ended before media token could be issued.');
    }

    return { url: this.deps.providerUrl, token, expiresAt: expiry.toISOString() };
  }

  async confirmConnected(rideId: string, callId: string, actor: AuthContext): Promise<RideCallDto> {
    this.requireEnabled();
    const call = await this.requireCall(rideId, callId, actor);
    this.requireParticipant(call, actor);
    if (call.state === 'CONNECTED') return callDto(call);
    if (call.state !== 'ACCEPTED') {
      throw AppError.conflict('CALL_UNAVAILABLE: Call is not connecting.');
    }
    if (await this.probeBothParticipantsJoined(call)) {
      const updated = await this.promoteConnected(call, [
        call.callerParticipantId,
        call.calleeParticipantId,
      ]);
      if (updated) return callDto(updated);
    }
    const latest = await this.deps.calls.findById(callId);
    return callDto(latest ?? call);
  }

  async endForRide(
    rideId: string,
    reason: 'ride_completed' | 'ride_cancelled' | 'access_revoked',
  ): Promise<void> {
    await this.deps.calls.ensureReady();
    const call = await this.deps.calls.findActiveByRide(rideId);
    if (call) await this.finish(call, call.state === 'RINGING' ? 'CANCELLED' : 'ENDED', reason);
  }

  async handleWebhook(body: string, authorization: string | undefined): Promise<void> {
    let event: Awaited<ReturnType<RideVoiceProviderPort['verifyWebhook']>>;
    try {
      event = await this.deps.provider.verifyWebhook(body, authorization);
    } catch {
      throw AppError.badRequest('Invalid voice callback signature.');
    }
    if (!event.id || !event.roomName) throw AppError.badRequest('Invalid voice callback.');
    await this.deps.calls.ensureReady();
    const call = await this.deps.calls.findActiveByRoom(event.roomName);
    if (!call) return;

    const isKnownParticipant =
      event.participantId === call.callerParticipantId ||
      event.participantId === call.calleeParticipantId;

    if (event.event === 'participant_joined' && isKnownParticipant && event.participantId) {
      const joined = [...new Set([...(call.joinedParticipantIds ?? []), event.participantId])];
      const bothJoined =
        joined.includes(call.callerParticipantId) && joined.includes(call.calleeParticipantId);
      if (bothJoined && call.state === 'ACCEPTED') {
        await this.promoteConnected(call, joined);
      } else if (joined.length !== (call.joinedParticipantIds?.length ?? 0)) {
        await this.deps.calls.update(
          {
            ...call,
            joinedParticipantIds: joined,
            updatedAt: this.now(),
            version: call.version + 1,
          },
          call.version,
        );
      }
    } else if (
      event.event === 'room_finished' ||
      (event.event === 'participant_left' && isKnownParticipant && call.state === 'CONNECTED')
    ) {
      await this.finish(call, 'ENDED', 'provider_closed');
    }
  }

  async maintain(): Promise<void> {
    if (!this.deps.enabled) return;
    await this.deps.calls.ensureReady();
    const now = this.now();
    for (const call of await this.deps.calls.findExpiredRinging(now, 50)) {
      await this.finish(call, 'MISSED', 'ring_timeout');
    }
    for (const call of await this.deps.calls.findJoinExpired(now, 50)) {
      if (await this.probeBothParticipantsJoined(call)) {
        await this.promoteConnected(call, [
          call.callerParticipantId,
          call.calleeParticipantId,
        ]);
      } else {
        await this.finish(call, 'FAILED', 'join_timeout');
      }
    }
    for (const call of await this.deps.calls.listActive(100)) {
      if (!call.activeUserIds) continue;
      if (call.state === 'ACCEPTED' && (await this.probeBothParticipantsJoined(call))) {
        await this.promoteConnected(call, [
          call.callerParticipantId,
          call.calleeParticipantId,
        ]);
        continue;
      }
      try {
        await this.deps.access.execute(call.rideId, {
          userId: call.callerUserId,
          role: call.callerRole,
        });
        await this.deps.access.execute(call.rideId, {
          userId: call.calleeUserId,
          role: call.callerRole === 'RIDER' ? 'DRIVER' : 'RIDER',
        });
      } catch (error) {
        if (error instanceof AppError && [403, 404, 409].includes(error.statusCode)) {
          await this.finish(call, call.state === 'RINGING' ? 'CANCELLED' : 'ENDED', 'access_revoked');
        } else {
          throw error;
        }
      }
    }
    for (const call of await this.deps.calls.listCleanupPending(50)) {
      await this.cleanup(call);
    }
  }

  private async requireCall(
    rideId: string,
    callId: string,
    actor: AuthContext,
    checkAccess = true,
  ): Promise<RideCallEntity> {
    await this.deps.calls.ensureReady();
    const call = await this.deps.calls.findById(callId);
    if (!this.isRetained(call) || call.rideId !== rideId) {
      throw AppError.notFound('CALL_UNAVAILABLE: Call not found.');
    }
    this.requireParticipant(call, actor);
    if (checkAccess) await this.deps.access.execute(rideId, actor);
    return call;
  }

  private async finish(
    call: RideCallEntity,
    state: RideCallEntity['state'],
    reason: string,
  ): Promise<RideCallDto> {
    if (!call.activeUserIds) return callDto(call);
    const now = this.now();
    const transition = await this.deps.unitOfWork.run(async () => {
      const fresh = await this.deps.calls.findById(call.id);
      if (!fresh || !fresh.activeUserIds) {
        return { saved: fresh ?? call, didFinish: false };
      }
      const next: RideCallEntity = {
        ...fresh,
        state,
        endedAt: now,
        endReason: reason,
        cleanupPending: true,
        expiresAt: new Date(now.getTime() + RIDE_CALL_RETENTION_MS),
        updatedAt: now,
        version: fresh.version + 1,
      };
      delete next.activeUserIds;
      const result = await this.deps.calls.update(next, fresh.version);
      if (!result) {
        return {
          saved: (await this.deps.calls.findById(call.id)) ?? fresh,
          didFinish: false,
        };
      }
      return { saved: result, didFinish: true };
    });
    if (!transition.didFinish) return callDto(transition.saved);
    await Promise.all([
      this.notify(transition.saved, transition.saved.callerUserId, 'changed'),
      this.notify(transition.saved, transition.saved.calleeUserId, 'changed'),
    ]);
    await this.cleanup(transition.saved);
    return callDto((await this.deps.calls.findById(call.id)) ?? transition.saved);
  }

  private async cleanup(call: RideCallEntity): Promise<void> {
    try {
      await this.deps.provider.revokeAndClose(call);
      await this.deps.calls.update(
        {
          ...call,
          cleanupPending: false,
          updatedAt: this.now(),
          version: call.version + 1,
        },
        call.version,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'provider cleanup failed';
      logger.warn({ callId: call.id, error: message }, 'ride call cleanup pending');
      if (this.now().getTime() - call.updatedAt.getTime() >= 60_000) {
        void emitOperationalAlert({
          category: 'QUEUE_HEALTH',
          severity: 'warning',
          dedupeKey: `CALL_CLEANUP:${call.id}`,
          summary: 'LiveKit ride call cleanup failed repeatedly.',
          metadata: { callId: call.id, rideId: call.rideId },
        });
      }
    }
  }

  private async notify(
    call: RideCallEntity,
    userId: string,
    event: 'incoming' | 'changed',
    callerName?: string,
  ): Promise<void> {
    try {
      await this.deps.push.notify(userId, event, callDto(call), callerName);
    } catch (error) {
      logger.warn({ callId: call.id, error: String(error) }, 'ride call notification failed');
    }
  }
}
