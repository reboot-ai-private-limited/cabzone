import { describe, expect, it } from 'vitest';
import { RedisPresenceRepository } from '../src/modules/dispatch/infrastructure/redisPresence.repository.js';

describe('Redis driver presence failure policy', () => {
  const unavailableRedis = () => { throw new Error('Redis unavailable'); };

  it('rejects online and dispatch reads in production mode', async () => {
    const presence = new RedisPresenceRepository(unavailableRedis, 120, true);
    await expect(presence.findNearby({
      vehicleCategory: 'CAB', lat: 26.7, lng: 88.4, radiusM: 1000,
      maxAgeMs: 60_000, limit: 10,
    })).rejects.toMatchObject({ statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
    await expect(presence.set({
      driverId: 'driver', userId: 'user', vehicleCategory: 'CAB', lat: 26.7, lng: 88.4,
      heading: null, speedMps: null, locationUpdatedAt: new Date(),
    })).rejects.toMatchObject({ statusCode: 503 });
  });

  it('keeps local development usable until Redis is configured', async () => {
    const presence = new RedisPresenceRepository(unavailableRedis);
    await presence.set({
      driverId: 'driver', userId: 'user', vehicleCategory: 'CAB', lat: 26.7, lng: 88.4,
      heading: null, speedMps: null, locationUpdatedAt: new Date(),
    });
    expect(await presence.get('driver')).toMatchObject({ userId: 'user' });
  });
});
