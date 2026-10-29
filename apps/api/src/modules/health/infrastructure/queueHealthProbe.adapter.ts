import { QUEUE_NAMES, getQueue } from '@/shared/queue/queues.js';
import { redisHealth } from '@/shared/queue/redis.js';
import { emitOperationalAlert } from '@/shared/monitoring/alerting.js';
import type { DependencyHealth } from '../domain/health.entity.js';
import type { HealthProbePort } from '../domain/healthProbe.port.js';

const QUEUE_WAITING_LAG_THRESHOLD = 250;

export class QueueHealthProbe implements HealthProbePort {
  readonly name = 'bullmq';

  constructor(
    private readonly inspectCounts?: () => Promise<{
      waiting?: number;
      active?: number;
      failed?: number;
      delayed?: number;
    }>,
  ) {}

  async check(): Promise<DependencyHealth> {
    const started = Date.now();
    try {
      if (!this.inspectCounts) {
        const redis = await redisHealth();
        if (!redis.ok) {
          return {
            name: this.name,
            status: 'down',
            detail: `redis:${redis.state}`,
            latencyMs: Date.now() - started,
          };
        }
      }

      const counts = this.inspectCounts
        ? await this.inspectCounts()
        : await getQueue(QUEUE_NAMES.notifications).getJobCounts(
            'waiting',
            'active',
            'failed',
            'delayed',
          );

      const waiting = counts.waiting ?? 0;
      const failed = counts.failed ?? 0;
      const latencyMs = Date.now() - started;

      if (failed > 0 || waiting >= QUEUE_WAITING_LAG_THRESHOLD) {
        void emitOperationalAlert({
          category: 'QUEUE_HEALTH',
          severity: failed > 0 ? 'critical' : 'warning',
          dedupeKey: `QUEUE_HEALTH:${QUEUE_NAMES.notifications}:${failed > 0 ? 'failed' : 'lag'}`,
          summary: `BullMQ queue "${QUEUE_NAMES.notifications}" requires attention (waiting=${waiting}, failed=${failed}).`,
          metadata: {
            queue: QUEUE_NAMES.notifications,
            waiting,
            active: counts.active ?? 0,
            failed,
            delayed: counts.delayed ?? 0,
          },
        });
      }

      return {
        name: this.name,
        status: 'up',
        detail: `waiting=${waiting},failed=${failed}`,
        latencyMs,
      };
    } catch {
      return {
        name: this.name,
        status: 'down',
        detail: 'queue probe failed',
        latencyMs: Date.now() - started,
      };
    }
  }
}
