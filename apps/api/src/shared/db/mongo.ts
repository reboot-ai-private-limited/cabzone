import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

mongoose.set('strictQuery', true);

export async function connectMongo(): Promise<void> {
  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 5_000,
  });
  logger.info('mongo connected');
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.connection.close();
  logger.info('mongo disconnected');
}

const CONNECTION_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

const PING_TIMEOUT_MS = 2_000;

export async function mongoHealth(): Promise<{ ok: boolean; state: string }> {
  const readyState = mongoose.connection.readyState;
  const state = CONNECTION_STATES[readyState] ?? 'unknown';

  if (readyState !== 1) return { ok: false, state };

  const db = mongoose.connection.db;
  if (db === undefined) return { ok: false, state: 'no database handle' };

  try {
    await Promise.race([
      db.admin().ping(),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('ping timed out')), PING_TIMEOUT_MS).unref(),
      ),
    ]);
    return { ok: true, state };
  } catch (err) {
    return { ok: false, state: err instanceof Error ? err.message : state };
  }
}
