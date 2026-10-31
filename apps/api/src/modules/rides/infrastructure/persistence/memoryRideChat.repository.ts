import type { RideChatMessage, RideChatQuery, RideChatRepositoryPort } from '../../domain/rideChat.port.js';

export class MemoryRideChatRepository implements RideChatRepositoryPort {
  private readonly messages: RideChatMessage[] = [];
  async ensureReady(): Promise<void> {}
  async findRetry(rideId: string, userId: string, clientMessageId: string) {
    const match = this.messages.find(
      (m) => m.rideId === rideId && m.senderUserId === userId && m.clientMessageId === clientMessageId,
    );
    return match ? structuredClone(match) : null;
  }
  async create(message: RideChatMessage): Promise<void> {
    const duplicate = this.messages.some(
      (m) =>
        m.id === message.id ||
        (m.rideId === message.rideId && m.sequence === message.sequence) ||
        (m.rideId === message.rideId &&
          m.senderUserId === message.senderUserId &&
          m.clientMessageId === message.clientMessageId),
    );
    if (duplicate) {
      throw Object.assign(new Error('E11000 duplicate key error collection: ride_messages'), { code: 11000 });
    }
    this.messages.push(structuredClone(message));
  }
  async list(rideId: string, query: RideChatQuery, now: Date) {
    const messages = this.messages
      .filter(
        (m) =>
          m.rideId === rideId &&
          m.expiresAt > now &&
          (query.after === undefined || m.sequence > query.after) &&
          (query.before === undefined || m.sequence < query.before),
      )
      .sort((a, b) => a.sequence - b.sequence);
    return structuredClone(
      query.after !== undefined ? messages.slice(0, query.limit) : messages.slice(-query.limit),
    );
  }
}
