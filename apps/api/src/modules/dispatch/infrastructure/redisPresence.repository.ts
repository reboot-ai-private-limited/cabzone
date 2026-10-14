import type { Redis } from 'ioredis';
import { VEHICLE_CATEGORIES, type VehicleCategory } from '@cabzone/contracts';
import type {
  DriverPresence,
  DriverPresencePort,
  FindNearbyQuery,
  NearbyDriver,
} from '../domain/presence.port.js';
import { MemoryPresenceRepository } from './memoryPresence.repository.js';
import { AppError } from '../../../shared/errors/AppError.js';

const hashKey = (driverId: string) => `presence:driver:${driverId}`;
const geoKey = (category: VehicleCategory) => `presence:geo:${category}`;

/**
 * Presence in Redis: one hash per driver (with a TTL so crashed clients vanish) plus one GEO set per
 * vehicle category for proximity queries. Falls back to in-memory presence when Redis is unavailable.
 */
export class RedisPresenceRepository implements DriverPresencePort {
  private readonly fallback: MemoryPresenceRepository;

  constructor(
    /** Lazy so that merely building the app never opens a Redis connection. */
    private readonly getRedis: () => Redis,
    private readonly ttlSeconds = 120,
    private readonly failClosed = false,
  ) {
    this.fallback = new MemoryPresenceRepository(
      !this.failClosed && process.env['NODE_ENV'] !== 'test',
    );
  }

  private unavailable(): never {
    throw new AppError({ statusCode: 503, code: 'SERVICE_UNAVAILABLE', message: 'Driver dispatch is temporarily unavailable.' });
  }

  private get redis(): Redis | null {
    try {
      const client = this.getRedis();
      return client.status === 'ready' ? client : null;
    } catch {
      return null;
    }
  }

  async set(p: DriverPresence): Promise<void> {
    if (!this.failClosed) await this.fallback.set(p);
    const client = this.redis;
    if (!client) { if (this.failClosed) this.unavailable(); return; }
    try {
      await client
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
    } catch {
      if (this.failClosed) this.unavailable();
    }
  }

  async get(driverId: string): Promise<DriverPresence | null> {
    const client = this.redis;
    if (!client) return this.failClosed ? this.unavailable() : this.fallback.get(driverId);
    try {
      const presence = this.parse(driverId, await client.hgetall(hashKey(driverId)));
      return presence ?? (this.failClosed ? null : await this.fallback.get(driverId));
    } catch {
      return this.failClosed ? this.unavailable() : this.fallback.get(driverId);
    }
  }

  async remove(driverId: string): Promise<void> {
    if (!this.failClosed) await this.fallback.remove(driverId);
    const client = this.redis;
    if (!client) { if (this.failClosed) this.unavailable(); return; }
    try {
      const multi = client.multi().del(hashKey(driverId));
      for (const category of VEHICLE_CATEGORIES) multi.zrem(geoKey(category), driverId);
      await multi.exec();
    } catch {
      if (this.failClosed) this.unavailable();
    }
  }

  async findNearby(q: FindNearbyQuery): Promise<NearbyDriver[]> {
    const client = this.redis;
    if (!client) return this.failClosed ? this.unavailable() : this.fallback.findNearby(q);
    try {
      const raw = (await client.geosearch(
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
          await client.zrem(geoKey(q.vehicleCategory), driverId);
          continue;
        }
        if (presence.locationUpdatedAt.getTime() < cutoff) continue;
        result.push({ ...presence, distanceM: Number(dist) });
      }
      return result;
    } catch {
      return this.failClosed ? this.unavailable() : this.fallback.findNearby(q);
    }
  }

  async listAll(options?: {
    vehicleCategory?: VehicleCategory;
    maxAgeMs?: number;
  }): Promise<DriverPresence[]> {
    const client = this.redis;
    if (!client) return this.failClosed ? this.unavailable() : this.fallback.listAll(options);
    try {
      const cutoff = options?.maxAgeMs ? Date.now() - options.maxAgeMs : 0;
      const categories: readonly VehicleCategory[] = options?.vehicleCategory
        ? [options.vehicleCategory]
        : VEHICLE_CATEGORIES;

      const driverIds = new Set<string>();
      for (const cat of categories) {
        const ids = (await client.zrange(geoKey(cat), 0, -1)) as string[];
        for (const id of ids) {
          driverIds.add(id);
        }
      }

      const result: DriverPresence[] = [];
      for (const driverId of driverIds) {
        const presence = await this.get(driverId);
        if (!presence) {
          for (const cat of VEHICLE_CATEGORIES) {
            await client.zrem(geoKey(cat), driverId);
          }
          continue;
        }
        if (presence.locationUpdatedAt.getTime() >= cutoff) {
          result.push(presence);
        }
      }
      return result;
    } catch {
      return this.failClosed ? this.unavailable() : this.fallback.listAll(options);
    }
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
