import {
  haversineDistanceM,
  type DriverPresence,
  type DriverPresencePort,
  type FindNearbyQuery,
  type NearbyDriver,
} from '../domain/presence.port.js';

export class MemoryPresenceRepository implements DriverPresencePort {
  private readonly byDriver = new Map<string, DriverPresence>();

  async set(presence: DriverPresence): Promise<void> {
    this.byDriver.set(presence.driverId, { ...presence });
  }

  async get(driverId: string): Promise<DriverPresence | null> {
    const p = this.byDriver.get(driverId);
    return p ? { ...p } : null;
  }

  async remove(driverId: string): Promise<void> {
    this.byDriver.delete(driverId);
  }

  async findNearby(query: FindNearbyQuery): Promise<NearbyDriver[]> {
    const cutoff = Date.now() - query.maxAgeMs;
    return [...this.byDriver.values()]
      .filter(
        (p) =>
          p.vehicleCategory === query.vehicleCategory && p.locationUpdatedAt.getTime() >= cutoff,
      )
      .map((p) => ({ ...p, distanceM: haversineDistanceM(query, p) }))
      .filter((p) => p.distanceM <= query.radiusM)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, query.limit);
  }
}
