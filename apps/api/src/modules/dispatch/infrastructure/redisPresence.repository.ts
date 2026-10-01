import type { Redis } from 'ioredis';
import { VEHICLE_CATEGORIES, type VehicleCategory } from '@cabzone/contracts';
import type {
  DriverPresence,
  DriverPresencePort,
  FindNearbyQuery,
  NearbyDriver,
} from '../domain/presence.port.js';

const hashKey = (driverId: string) => `presence:driver:${driverId}`;
const geoKey = (category: VehicleCategory) => `presence:geo:${category}`;

/**
 * Presence in Redis: one hash per driver (with a TTL so crashed clients vanish) plus one GEO set per
 * vehicle category for proximity queries.
 */
export class RedisPresenceRepository implements DriverPresencePort {
  constructor(
    /** Lazy so that merely building the app never opens a Redis connection. */
    private readonly getRedis: () => Redis,
    private readonly ttlSeconds = 120,
  ) {}

  private get redis(): Redis {
    return this.getRedis();
  }

  async set(p: DriverPresence): Promise<void> {
    await this.redis
      .multi()
      .hset(hashKey(p.driverId), {
        userId: p.userId,
        vehicleCategory: p.vehicleCategory,
        lat: String(p.lat),
        lng: String(p.lng),
        heading: p.heading === null ? '' : String(p.heading),
        speedMps: p.speedMps === null ? '' : String(p.speedMps),
        locationUpdatedAt: String(p.locationUpdatedAt.getTime()),
      })
      .expire(hashKey(p.driverId), this.ttlSeconds)
      .geoadd(geoKey(p.vehicleCategory), p.lng, p.lat, p.driverId)
      .exec();
  }

  async get(driverId: string): Promise<DriverPresence | null> {
    return this.parse(driverId, await this.redis.hgetall(hashKey(driverId)));
  }

  async remove(driverId: string): Promise<void> {
    const multi = this.redis.multi().del(hashKey(driverId));
    for (const category of VEHICLE_CATEGORIES) multi.zrem(geoKey(category), driverId);
    await multi.exec();
  }

  async findNearby(q: FindNearbyQuery): Promise<NearbyDriver[]> {
    const raw = (await this.redis.geosearch(
      geoKey(q.vehicleCategory),
      'FROMLONLAT',
      q.lng,
      q.lat,
      'BYRADIUS',
      q.radiusM,
      'm',
      'ASC',
      'COUNT',
      q.limit,
      'WITHDIST',
    )) as Array<[string, string]>;

    const cutoff = Date.now() - q.maxAgeMs;
    const result: NearbyDriver[] = [];
    for (const [driverId, dist] of raw) {
      const presence = await this.get(driverId);
      if (!presence) {
        // Hash expired (client vanished): drop the stale geo member.
        await this.redis.zrem(geoKey(q.vehicleCategory), driverId);
        continue;
      }
      if (presence.locationUpdatedAt.getTime() < cutoff) continue;
      result.push({ ...presence, distanceM: Number(dist) });
    }
    return result;
  }

  private parse(driverId: string, h: Record<string, string>): DriverPresence | null {
    if (!h['userId'] || !h['vehicleCategory']) return null;
    return {
      driverId,
      userId: h['userId'],
      vehicleCategory: h['vehicleCategory'] as VehicleCategory,
      lat: Number(h['lat']),
      lng: Number(h['lng']),
      heading: h['heading'] ? Number(h['heading']) : null,
      speedMps: h['speedMps'] ? Number(h['speedMps']) : null,
      locationUpdatedAt: new Date(Number(h['locationUpdatedAt'])),
    };
  }
}
