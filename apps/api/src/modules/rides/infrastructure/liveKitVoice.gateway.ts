import { AccessToken, RoomServiceClient, TrackSource, WebhookReceiver } from 'livekit-server-sdk';
import { RIDE_CALL_TOKEN_TTL_S } from '@cabzone/contracts';
import type { RideVoiceProviderPort } from '../domain/rideCall.port.js';

function isNotFoundError(error: unknown, needle: string): boolean {
  const status = (error as { status?: number })?.status;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return status === 404 || message.includes('not_found') || message.includes(needle);
}

export class LiveKitVoiceGateway implements RideVoiceProviderPort {
  private readonly rooms: RoomServiceClient;
  private readonly receiver: WebhookReceiver;

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {
    const httpUrl = url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
    this.rooms = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    this.receiver = new WebhookReceiver(apiKey, apiSecret);
  }

  async issueToken(input: { roomName: string; participantId: string }): Promise<string> {
    if (this.url) {
      try {
        await this.rooms.createRoom({
          name: input.roomName,
          maxParticipants: 2,
          emptyTimeout: RIDE_CALL_TOKEN_TTL_S,
          departureTimeout: 20,
        });
      } catch (error) {
        const status = (error as { status?: number })?.status;
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (status !== 409 && !message.includes('already exists')) throw error;
      }
    }
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: input.participantId,
      ttl: RIDE_CALL_TOKEN_TTL_S,
    });
    token.addGrant({
      roomJoin: true,
      room: input.roomName,
      roomCreate: false,
      roomAdmin: false,
      roomRecord: false,
      canPublish: true,
      canPublishSources: [TrackSource.MICROPHONE],
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });
    return token.toJwt();
  }

  async revokeAndClose(call: {
    roomName: string;
    callerParticipantId: string;
    calleeParticipantId: string;
  }): Promise<void> {
    // LiveKit Cloud requires revokeTokenTs to be within ~60s of current server time;
    // compute at cleanup execution time so delayed worker retries succeed.
    const revokeTokenTs = BigInt(Math.floor(Date.now() / 1000) + 5);
    for (const identity of [call.callerParticipantId, call.calleeParticipantId]) {
      try {
        await this.rooms.removeParticipant(call.roomName, identity, { revokeTokenTs });
      } catch (error) {
        if (!isNotFoundError(error, 'participant does not exist')) throw error;
      }
    }
    try {
      await this.rooms.deleteRoom(call.roomName);
    } catch (error) {
      if (!isNotFoundError(error, 'room does not exist')) throw error;
    }
  }

  async listParticipantIds(roomName: string): Promise<string[]> {
    if (!this.url) return [];
    try {
      const participants = await this.rooms.listParticipants(roomName);
      return participants
        .filter((p) => p.state === 1 || p.state === 2)
        .map((p) => p.identity)
        .filter(Boolean);
    } catch (error) {
      if (isNotFoundError(error, 'room does not exist')) return [];
      throw error;
    }
  }

  async verifyWebhook(body: string, authorization: string | undefined) {
    const event = await this.receiver.receive(body, authorization);
    return {
      id: event.id,
      event: event.event,
      roomName: event.room?.name ?? '',
      participantId: event.participant?.identity ?? null,
    };
  }
}
