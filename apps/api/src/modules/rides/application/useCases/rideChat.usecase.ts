import {
  RIDE_CHAT_MAX_LENGTH,
  RIDE_CHAT_RETENTION_MS,
  type AuthRole,
  type RideChatMessageDto,
  type RideChatPageDto,
} from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import { logger } from '../../../../shared/logging/logger.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import type { RideEntity, RideRepositoryPort } from '../../domain/index.js';
import type { RideChatMessage, RideChatQuery, RideChatRepositoryPort } from '../../domain/rideChat.port.js';
import type { RideCommunicationAccessUseCase } from './rideCommunicationAccess.usecase.js';

export interface ChatDeps {
  access: RideCommunicationAccessUseCase;
  rideRepo: RideRepositoryPort;
  messages: RideChatRepositoryPort;
  unitOfWork: UnitOfWorkPort;
  chatEnabled?: boolean | undefined;
  notify?: ((ride: RideEntity, message: RideChatMessageDto) => Promise<void>) | undefined;
  now?: () => Date;
}

function publicMessage(m: RideChatMessage): RideChatMessageDto {
  return {
    id: m.id,
    rideId: m.rideId,
    clientMessageId: m.clientMessageId,
    senderRole: m.senderRole,
    sequence: m.sequence,
    text: m.text,
    createdAt: m.createdAt,
  };
}

function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: unknown }).code === 11000);
}

export class RideChatUseCase {
  constructor(private readonly deps: ChatDeps) {}

  assertEnabled(): void {
    if (this.deps.chatEnabled === false) {
      throw new AppError({
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'COMMUNICATION_CLOSED: Ride chat is currently unavailable.',
      });
    }
  }

  async list(rideId: string, actor: { userId: string; role: AuthRole }, query: RideChatQuery): Promise<RideChatPageDto> {
    this.assertEnabled();
    await this.deps.access.execute(rideId, actor);
    const rows = await this.deps.messages.list(rideId, { ...query, limit: query.limit + 1 }, this.now());
    const hasMore = rows.length > query.limit;
    const page = query.after !== undefined ? rows.slice(0, query.limit) : rows.slice(-query.limit);
    return { messages: page.map(publicMessage), hasMore };
  }

  async send(rideId: string, actor: { userId: string; role: AuthRole }, clientMessageId: string, rawText: string) {
    this.assertEnabled();
    const text = rawText.trim();
    if (!text || [...text].length > RIDE_CHAT_MAX_LENGTH) {
      throw AppError.badRequest('MESSAGE_TOO_LONG: Send 1-300 characters.');
    }
    await Promise.all([this.deps.rideRepo.ensureReady?.(), this.deps.messages.ensureReady()]);

    let result: { ride: RideEntity; message: RideChatMessageDto; created: boolean };
    try {
      result = await this.deps.unitOfWork.run(async () => {
        const { ride, participantRole } = await this.deps.access.execute(rideId, actor);
        const now = this.now();
        const existing = await this.deps.messages.findRetry(rideId, actor.userId, clientMessageId);
        if (existing) {
          if (existing.text !== text || existing.expiresAt <= now) {
            throw AppError.conflict('MESSAGE_RETRY_CONFLICT: This message key cannot be reused.');
          }
          return { ride, message: publicMessage(existing), created: false };
        }
        if (!this.deps.rideRepo.allocateChatSequence || !ride.driverId) {
          throw AppError.internal('INTERNAL', 'Chat sequence allocator is not configured');
        }
        // Conditional write on the ride document serializes chat against completion/cancellation/reassignment
        // without touching ride.version or clobbering concurrent pricing/extension fields.
        const sequence = await this.deps.rideRepo.allocateChatSequence(rideId, ride.driverId);
        if (!sequence) {
          throw AppError.conflict('COMMUNICATION_CLOSED: Ride communication is unavailable.');
        }
        const message: RideChatMessage = {
          id: newUuid(),
          rideId,
          clientMessageId,
          senderRole: participantRole,
          senderUserId: actor.userId,
          sequence,
          text,
          createdAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + RIDE_CHAT_RETENTION_MS),
        };
        await this.deps.messages.create(message);
        return { ride, message: publicMessage(message), created: true };
      });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const { ride } = await this.deps.access.execute(rideId, actor);
      const existing = await this.deps.messages.findRetry(rideId, actor.userId, clientMessageId);
      if (!existing || existing.text !== text || existing.expiresAt <= this.now()) {
        throw AppError.conflict('MESSAGE_RETRY_CONFLICT: This message key cannot be reused.');
      }
      result = { ride, message: publicMessage(existing), created: false };
    }

    if (result.created) {
      try {
        await this.deps.notify?.(result.ride, result.message);
      } catch {
        logger.warn({ rideId }, 'chat notification failed; REST recovery remains available');
      }
    }
    return result.message;
  }

  private now() {
    return this.deps.now?.() ?? new Date();
  }
}
