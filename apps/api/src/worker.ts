import { Worker } from 'bullmq';
import { loadEnv } from '@/config/env.js';
import { QUEUE_NAMES, closeQueues } from '@/shared/queue/queues.js';
import { disconnectRedis, getRedis } from '@/shared/queue/redis.js';
import { connectMongo, disconnectMongo } from '@/shared/db/mongo.js';
import { logger } from '@/shared/logging/logger.js';
import { buildContainers } from './container.js';
import { emitOperationalAlert } from '@/shared/monitoring/alerting.js';

const RIDE_CALL_SWEEP_MS = 5_000;

async function main(): Promise<void> {
  loadEnv();

  await connectMongo();

  const containers = buildContainers();
  logger.info({ modules: Object.keys(containers) }, 'worker initialized');

  const runRideCallSweep = () => {
    containers.rides.rideCalls
      .maintain()
      .catch((err: unknown) => logger.warn({ err: String(err) }, 'worker ride call maintenance failed'));
  };
  runRideCallSweep();
  const rideCallSweep = setInterval(runRideCallSweep, RIDE_CALL_SWEEP_MS);
  rideCallSweep.unref();

  const notificationsWorker = new Worker(
    QUEUE_NAMES.notifications,
    async (job) => {
      logger.info({ id: job.id, name: job.name }, 'processing notification job');
    },
    { connection: getRedis(), concurrency: 5 },
  );

  notificationsWorker.on('failed', (job, err) => {
    logger.error({ id: job?.id, name: job?.name, err: err.message }, 'notification job failed');
    void emitOperationalAlert({
      category: 'QUEUE_HEALTH',
      severity: 'critical',
      dedupeKey: `QUEUE_HEALTH:notifications:${job?.name ?? 'unknown'}`,
      summary: 'Notification worker job failed.',
      metadata: { jobId: job?.id, jobName: job?.name },
    });
  });

  logger.info({ queues: Object.values(QUEUE_NAMES) }, 'worker started');

  const shutdown = (signal: string) => {
    void (async () => {
      logger.info({ signal }, 'signal received, closing workers');
      clearInterval(rideCallSweep);
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
