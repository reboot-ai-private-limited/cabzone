import { Redis } from 'ioredis';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

let connection: Redis | undefined;
let lastLoggedErrorTime = 0;

export function getRedis(): Redis {
  if (connection !== undefined) return connection;

  connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times) {
      if (times > 3) return null; // Stop retrying if Redis is down
      return Math.min(times * 1000, 3000);
    },
  });

  connection.on('error', (err: Error) => {
    const now = Date.now();
    if (now - lastLoggedErrorTime > 15_000) {
      lastLoggedErrorTime = now;
      logger.warn({ message: err.message }, 'redis connection error');
    }
  });

  return connection;
}

export function disconnectRedis(): void {
  connection?.disconnect();
  connection = undefined;
}

const PING_TIMEOUT_MS = 1_500;

export async function redisHealth(): Promise<{ ok: boolean; state: string }> {
  // Use a dedicated lightweight check to avoid keeping an orphaned retry loop open
  const tempRedis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: PING_TIMEOUT_MS,
    retryStrategy: () => null, // Do not auto-reconnect for health check
    lazyConnect: true,
  });

  tempRedis.on('error', () => {
    // Suppress unhandled error events during health check probe
  });

  try {
    await Promise.race([
      tempRedis.connect(),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('connect timed out')), PING_TIMEOUT_MS).unref(),
      ),
    ]);
    const pong = await tempRedis.ping();
    tempRedis.disconnect();
    return { ok: pong === 'PONG', state: 'ready' };
  } catch (err) {
    tempRedis.disconnect();
    return { ok: false, state: err instanceof Error ? err.message : 'unreachable' };
  }
}

