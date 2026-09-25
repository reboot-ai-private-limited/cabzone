import { Redis } from 'ioredis';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

let connection: Redis | undefined;

export function getRedis(): Redis {
  if (connection !== undefined) return connection;

  connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  connection.on('error', (err: Error) => {
    logger.warn({ message: err.message }, 'redis connection error');
  });

  return connection;
}

export function disconnectRedis(): void {
  connection?.disconnect();
  connection = undefined;
}

const PING_TIMEOUT_MS = 2_000;

export async function redisHealth(): Promise<{ ok: boolean; state: string }> {
  const redis = getRedis();
  try {
    const pong = await Promise.race([
      redis.ping(),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('ping timed out')), PING_TIMEOUT_MS).unref(),
      ),
    ]);
    return { ok: pong === 'PONG', state: redis.status };
  } catch (err) {
    return { ok: false, state: err instanceof Error ? err.message : redis.status };
  }
}
