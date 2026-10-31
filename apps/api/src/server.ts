import { createApp } from './app.js';
import { env, loadEnv } from '@/config/env.js';
import { connectMongo, disconnectMongo } from '@/shared/db/mongo.js';
import { disconnectRedis, getRedis, redisHealth } from '@/shared/queue/redis.js';
import { closeQueues } from '@/shared/queue/queues.js';
import { logger } from '@/shared/logging/logger.js';
import { getRealtimeHub } from '@/shared/realtime/index.js';
import type { AppContainers } from './container.js';
import { assertRealtimeReadyForEnv } from '@/shared/realtime/readiness.js';

const OFFER_SWEEP_MS = 15_000;
const PUSH_RECEIPT_SWEEP_MS = 60_000;
const KYC_EXPIRY_SWEEP_MS = 5 * 60_000;
const RATING_REVEAL_SWEEP_MS = 60_000;
const RIDE_CALL_SWEEP_MS = 5_000;

async function main(): Promise<void> {
  loadEnv();

  await connectMongo();
  let sharedDeliveryReady = false;
  try {
    const health = await redisHealth();
    if (health.ok) {
      await getRealtimeHub().enableSharedDelivery(getRedis());
      sharedDeliveryReady = true;
    } else {
      logger.warn({ state: health.state }, 'Redis unavailable; realtime hub running in local mode');
    }
  } catch (err: unknown) {
    logger.warn({ err: String(err) }, 'Redis shared delivery skipped');
  }
  await assertRealtimeReadyForEnv(sharedDeliveryReady);

  const app = createApp();
  const containers = app.locals.containers as AppContainers;
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'api listening');
  });

  const hub = getRealtimeHub();
  const verifyToken = containers.identity.verifyToken;
  if (verifyToken) hub.attach(server, verifyToken);

  // Expire unclaimed offers. Runs in-process (not the worker) so expiry events reach this process's sockets.
  const sweep = setInterval(() => {
    containers.rides.expireOffersUseCase
      .execute()
      .catch((err: unknown) => logger.warn({ err: String(err) }, 'offer expiry sweep failed'));
  }, OFFER_SWEEP_MS);
  sweep.unref();
  const receiptSweep = setInterval(() => {
    containers.dispatch.push
      .checkReceipts()
      .catch((err: unknown) => logger.warn({ err: String(err) }, 'push receipt sweep failed'));
  }, PUSH_RECEIPT_SWEEP_MS);
  receiptSweep.unref();
  // D-046: Periodically reveal unilateral post-ride ratings once their 7-day window expires.
  const ratingRevealSweep = setInterval(() => {
    containers.rides.rideRatingsUseCase
      .revealExpiredRatings()
      .catch((err: unknown) => logger.warn({ err: String(err) }, 'rating reveal sweep failed'));
  }, RATING_REVEAL_SWEEP_MS);
  ratingRevealSweep.unref();

  const runKycExpirySweep = () => {
    containers.identity.sweepKycExpiry
      ?.execute()
      .catch((err: unknown) => logger.warn({ err: String(err) }, 'kyc expiry sweep failed'));
  };
  runKycExpirySweep();
  const kycExpirySweep = setInterval(runKycExpirySweep, KYC_EXPIRY_SWEEP_MS);
  kycExpirySweep.unref();

  const runRideCallSweep = () => {
    containers.rides.rideCalls.maintain()
      .catch((err: unknown) => logger.warn({ err: String(err) }, 'ride call maintenance failed'));
  };
  runRideCallSweep();
  const rideCallSweep = setInterval(runRideCallSweep, RIDE_CALL_SWEEP_MS);
  rideCallSweep.unref();

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'signal received, draining');
    const force = setTimeout(() => {
      logger.fatal('drain timed out, forcing exit');
      process.exit(1);
    }, 15_000);
    force.unref();

    clearInterval(sweep);
    clearInterval(receiptSweep);
    clearInterval(kycExpirySweep);
    clearInterval(ratingRevealSweep);
    clearInterval(rideCallSweep);
    hub.close();
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
