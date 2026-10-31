import type { RideCallDto, RideCallState } from '@cabzone/contracts';

export interface RideCallEntity extends RideCallDto {
  callerUserId: string;
  calleeUserId: string;
  callerInstallationId: string;
  calleeInstallationId: string | null;
  clientRequestId: string;
  roomName: string;
  callerParticipantId: string;
  calleeParticipantId: string;
  joinedParticipantIds?: string[] | undefined;
  connectedAt: string | null;
  endedAt: Date | null;
  endReason: string | null;
  cleanupPending: boolean;
  updatedAt: Date;
  expiresAt: Date;
  activeUserIds?: string[] | undefined;
  version: number;
}

export interface RideCallRepositoryPort {
  ensureReady(): Promise<void>;
  findById(id: string): Promise<RideCallEntity | null>;
  findByRequest(callerUserId: string, clientRequestId: string): Promise<RideCallEntity | null>;
  findActiveByRide(rideId: string): Promise<RideCallEntity | null>;
  findActiveByRoom(roomName: string): Promise<RideCallEntity | null>;
  findActiveByUser(userId: string): Promise<RideCallEntity | null>;
  create(call: RideCallEntity): Promise<void>;
  update(call: RideCallEntity, expectedVersion: number): Promise<RideCallEntity | null>;
  findExpiredRinging(now: Date, limit: number): Promise<RideCallEntity[]>;
  findJoinExpired(now: Date, limit: number): Promise<RideCallEntity[]>;
  listCleanupPending(limit: number): Promise<RideCallEntity[]>;
  listActive(limit: number): Promise<RideCallEntity[]>;
}

export interface RideVoiceProviderPort {
  issueToken(input: { roomName: string; participantId: string }): Promise<string>;
  revokeAndClose(call: RideCallEntity): Promise<void>;
  verifyWebhook(
    body: string,
    authorization: string | undefined,
  ): Promise<{
    id: string;
    event: string;
    roomName: string;
    participantId: string | null;
  }>;
  listParticipantIds?(roomName: string): Promise<string[]>;
}

export interface RideCallPushPort {
  notify(
    userId: string,
    event: 'incoming' | 'changed',
    call: RideCallDto,
    callerName?: string,
  ): Promise<void>;
}

export function isActiveCallState(state: RideCallState): boolean {
  return state === 'RINGING' || state === 'ACCEPTED' || state === 'CONNECTED';
}
