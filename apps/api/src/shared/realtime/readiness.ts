import { env, isProdLike } from '@/config/env.js';
import { emitOperationalAlert } from '@/shared/monitoring/alerting.js';

export interface RealtimeReadinessOptions {
  prodLike?: boolean;
  allowLocalFallback?: boolean;
}

/**
 * Resolves local-only realtime readiness in stage/production (Step 16 / C07).
 * Multi-instance or staging/production deployments must not silently degrade to
 * process-local socket delivery unless ALLOW_LOCAL_REALTIME_FALLBACK=true is explicitly set.
 */
export async function assertRealtimeReadyForEnv(
  redisOk: boolean,
  options?: RealtimeReadinessOptions,
): Promise<void> {
  if (redisOk) return;

  const prodLike = options?.prodLike ?? isProdLike;
  const allowFallback = options?.allowLocalFallback ?? env.ALLOW_LOCAL_REALTIME_FALLBACK;

  if (prodLike && !allowFallback) {
    await emitOperationalAlert({
      category: 'DATASTORE_HEALTH',
      severity: 'critical',
      dedupeKey: 'DATASTORE_HEALTH:redis:realtime-startup',
      summary: 'Redis unavailable at startup in prod-like environment; refusing local-only realtime fallback.',
      metadata: { dependency: 'redis', allowLocalFallback: false },
    });
    throw new Error(
      'Redis shared realtime delivery is required in staging/production unless ALLOW_LOCAL_REALTIME_FALLBACK=true.',
    );
  }
}
