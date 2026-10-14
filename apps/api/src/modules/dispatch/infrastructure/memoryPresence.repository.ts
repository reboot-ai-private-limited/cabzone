import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { VehicleCategory } from '@cabzone/contracts';
import {
  haversineDistanceM,
  type DriverPresence,
  type DriverPresencePort,
  type FindNearbyQuery,
  type NearbyDriver,
} from '../domain/presence.port.js';

const DEV_PRESENCE_FILE = path.join(os.tmpdir(), 'cabzone-dev-presence.json');

export class MemoryPresenceRepository implements DriverPresencePort {
  private readonly byDriver = new Map<string, DriverPresence>();

  constructor(private readonly persistDev = false) {
    if (this.persistDev) {
      this.loadFromDisk();
    }
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(DEV_PRESENCE_FILE)) return;
      const raw = JSON.parse(fs.readFileSync(DEV_PRESENCE_FILE, 'utf8')) as Array<
        Omit<DriverPresence, 'locationUpdatedAt'> & { locationUpdatedAt: string | number }
      >;
      const now = Date.now();
      for (const item of raw) {
        if (!item?.driverId || !item?.userId || !item?.vehicleCategory) continue;
        // Refresh timestamp on dev hot-reload so active dev drivers stay online across tsx watch restarts
        const ts = new Date(item.locationUpdatedAt).getTime();
        if (Number.isNaN(ts) || now - ts > 15 * 60_000) continue;
        this.byDriver.set(item.driverId, {
          ...item,
          locationUpdatedAt: new Date(Math.max(ts, now - 5_000)),
        });
      }
    } catch {
      // ignore corrupt dev cache
    }
  }

  private saveToDisk(): void {
    if (!this.persistDev) return;
    try {
      const serialized = [...this.byDriver.values()].map((p) => ({
        ...p,
        locationUpdatedAt: p.locationUpdatedAt.getTime(),
      }));
      fs.writeFileSync(DEV_PRESENCE_FILE, JSON.stringify(serialized), 'utf8');
    } catch {
      // ignore disk write error
    }
  }

  async set(presence: DriverPresence): Promise<void> {
    this.byDriver.set(presence.driverId, { ...presence });
    this.saveToDisk();
  }

  async get(driverId: string): Promise<DriverPresence | null> {
    const p = this.byDriver.get(driverId);
    return p ? { ...p } : null;
  }

  async remove(driverId: string): Promise<void> {
    this.byDriver.delete(driverId);
    this.saveToDisk();
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

  async listAll(options?: {
    vehicleCategory?: VehicleCategory;
    maxAgeMs?: number;
  }): Promise<DriverPresence[]> {
    const cutoff = options?.maxAgeMs ? Date.now() - options.maxAgeMs : 0;
    return [...this.byDriver.values()].filter(
      (p) =>
        (!options?.vehicleCategory || p.vehicleCategory === options.vehicleCategory) &&
        p.locationUpdatedAt.getTime() >= cutoff,
    );
  }
}

