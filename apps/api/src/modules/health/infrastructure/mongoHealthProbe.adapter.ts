import { mongoHealth } from '@/shared/db/mongo.js';
import type { DependencyHealth } from '../domain/health.entity.js';
import type { HealthProbePort } from '../domain/healthProbe.port.js';

export class MongoHealthProbe implements HealthProbePort {
  readonly name = 'mongodb';

  async check(): Promise<DependencyHealth> {
    const started = Date.now();
    const { ok, state } = await mongoHealth();
    return {
      name: this.name,
      status: ok ? 'up' : 'down',
      detail: state,
      latencyMs: Date.now() - started,
    };
  }
}
