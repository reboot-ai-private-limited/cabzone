import type { RideChatMessage, RideChatQuery, RideChatRepositoryPort } from '../../domain/rideChat.port.js';
import { RideChatModel } from './rideChat.model.js';

export class MongoRideChatRepository implements RideChatRepositoryPort {
  async ensureReady(): Promise<void> { await RideChatModel.init(); }

  async findRetry(rideId: string, senderUserId: string, clientMessageId: string) {
    return RideChatModel.findOne({ rideId, senderUserId, clientMessageId }).lean<RideChatMessage>().exec();
  }

  async create(message: RideChatMessage): Promise<void> {
    await RideChatModel.create([message]);
  }

  async list(rideId: string, query: RideChatQuery, now: Date) {
    const sequence = query.after !== undefined ? { $gt: query.after }
      : query.before !== undefined ? { $lt: query.before } : undefined;
    const messages = await RideChatModel.find({ rideId, expiresAt: { $gt: now },
      ...(sequence ? { sequence } : {}) })
      .sort({ sequence: query.after !== undefined ? 1 : -1 })
      .limit(query.limit).lean<RideChatMessage[]>().exec();
    return query.after !== undefined ? messages : messages.reverse();
  }
}
