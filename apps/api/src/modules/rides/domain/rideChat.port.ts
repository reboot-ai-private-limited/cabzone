import type { RideChatMessageDto } from '@cabzone/contracts';

export interface RideChatMessage extends RideChatMessageDto {
  senderUserId: string;
  expiresAt: Date;
}

export interface RideChatQuery {
  before?: number | undefined;
  after?: number | undefined;
  limit: number;
}

export interface RideChatRepositoryPort {
  ensureReady(): Promise<void>;
  findRetry(rideId: string, userId: string, clientMessageId: string): Promise<RideChatMessage | null>;
  create(message: RideChatMessage): Promise<void>;
  list(rideId: string, query: RideChatQuery, now: Date): Promise<RideChatMessage[]>;
}
