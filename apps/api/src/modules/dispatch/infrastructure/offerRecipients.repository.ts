import type { Redis } from 'ioredis';
import type { OfferRecipientsPort } from '../application/offerRecipients.port.js';

const key = (rideId: string) => `dispatch:offer-recipients:${rideId}`;

export class MemoryOfferRecipientsRepository implements OfferRecipientsPort {
  private readonly offers = new Map<string, { userIds: string[]; expiresAt: number }>();

  async save(rideId: string, userIds: string[], expiresAt: Date): Promise<void> {
    this.offers.set(rideId, { userIds, expiresAt: expiresAt.getTime() + 60_000 });
  }

  async take(rideId: string): Promise<string[]> {
    const offer = this.offers.get(rideId);
    this.offers.delete(rideId);
    return offer && offer.expiresAt > Date.now() ? offer.userIds : [];
  }
}

export class RedisOfferRecipientsRepository implements OfferRecipientsPort {
  private readonly fallback = new MemoryOfferRecipientsRepository();

  constructor(private readonly getRedis: () => Redis) {}

  private get redis(): Redis | null {
    try {
      const client = this.getRedis();
      return client.status === 'ready' ? client : null;
    } catch {
      return null;
    }
  }

  async save(rideId: string, userIds: string[], expiresAt: Date): Promise<void> {
    await this.fallback.save(rideId, userIds, expiresAt);
    const client = this.redis;
    if (!client) return;
    try {
      const ttlSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000) + 60);
      await client.set(key(rideId), JSON.stringify(userIds), 'EX', ttlSeconds);
    } catch {
      // fallback already holds the recipients
    }
  }

  async take(rideId: string): Promise<string[]> {
    const client = this.redis;
    if (!client) return this.fallback.take(rideId);
    try {
      const value = await client.getdel(key(rideId));
      if (value) {
        await this.fallback.take(rideId);
        return JSON.parse(value) as string[];
      }
      return this.fallback.take(rideId);
    } catch {
      return this.fallback.take(rideId);
    }
  }
}
