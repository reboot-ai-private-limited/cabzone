import { createApp } from './app.js';
import { env, loadEnv } from '@/config/env.js';
import { connectMongo, disconnectMongo } from '@/shared/db/mongo.js';
import { disconnectRedis } from '@/shared/queue/redis.js';
import { closeQueues } from '@/shared/queue/queues.js';
import { logger } from '@/shared/logging/logger.js';

async function main(): Promise<void> {
  loadEnv();

  await connectMongo();

  const server = createApp().listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'api listening');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'signal received, draining');
    const force = setTimeout(() => {
      logger.fatal('drain timed out, forcing exit');
      process.exit(1);
    }, 15_000);
    force.unref();

    server.close(() => {
      void (async () => {
        await closeQueues();
        await disconnectMongo();
        disconnectRedis();
        logger.info('shutdown complete');
        process.exit(0);
      })();
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.fatal({ err: String(err) }, 'failed to start');
  process.exit(1);
});
