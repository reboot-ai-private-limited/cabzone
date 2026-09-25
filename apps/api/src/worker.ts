import { Worker } from 'bullmq';
import { loadEnv } from '@/config/env.js';
import { QUEUE_NAMES, closeQueues } from '@/shared/queue/queues.js';
import { disconnectRedis, getRedis } from '@/shared/queue/redis.js';
import { connectMongo, disconnectMongo } from '@/shared/db/mongo.js';
import { logger } from '@/shared/logging/logger.js';
import { buildContainers } from './container.js';

async function main(): Promise<void> {
  loadEnv();

  await connectMongo();

  const containers = buildContainers();
  logger.info({ modules: Object.keys(containers) }, 'worker initialized');

  const notificationsWorker = new Worker(
    QUEUE_NAMES.notifications,
    async (job) => {
      logger.info({ id: job.id, name: job.name }, 'processing notification job');
    },
    { connection: getRedis(), concurrency: 5 },
  );

  notificationsWorker.on('failed', (job, err) => {
    logger.error({ id: job?.id, name: job?.name, err: err.message }, 'notification job failed');
  });

  logger.info({ queues: Object.values(QUEUE_NAMES) }, 'worker started');

  const shutdown = (signal: string) => {
    void (async () => {
      logger.info({ signal }, 'signal received, closing workers');
      await notificationsWorker.close();
      await closeQueues();
      await disconnectMongo();
      disconnectRedis();
      process.exit(0);
    })();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.fatal({ err: String(err) }, 'worker failed to start');
  process.exit(1);
});
