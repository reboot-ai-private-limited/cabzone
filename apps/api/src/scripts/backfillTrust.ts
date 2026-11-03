/* eslint-disable no-console -- command line tool: the table and notices are its output */
/**
 * Backfill for trust score v2 (decision D-048).
 *
 *   pnpm --filter @cabzone/api backfill:trust                 # all steps
 *   pnpm --filter @cabzone/api backfill:trust -- --dry-run    # report only, write nothing
 *   pnpm --filter @cabzone/api backfill:trust -- --step=scores
 *
 * Steps, in the order they must run:
 *   cancelled-by  ride.cancelled_by from the RIDE_CANCELLED event actor, else inferred from the reason
 *   disputes      ride.disputed_at / dispute_outcome / dispute_resolved_at from dispute events
 *   rating-sums   rider/driver rating_sum from revealed reviews (exact, replaces average x count)
 *   scores        recompute and store every rider and driver trust score
 *
 * Every step is idempotent and resumable: it only touches rows that still need the change.
 */
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { inferCancelledBy } from '../modules/rides/domain/cancellationPolicy.js';
import { RideModel } from '../modules/rides/infrastructure/persistence/ride.model.js';
import { RideEventModel } from '../modules/rides/infrastructure/persistence/rideEvent.model.js';
import { RideReviewModel } from '../modules/rides/infrastructure/persistence/rideReview.model.js';
import { MongoRideRepository } from '../modules/rides/infrastructure/persistence/mongoRide.repository.js';
import { MongoRiderRepository } from '../modules/identity/infrastructure/persistence/mongoRider.repository.js';
import { MongoDriverRepository } from '../modules/identity/infrastructure/persistence/mongoDriver.repository.js';
import { RiderModel } from '../modules/identity/infrastructure/persistence/rider.model.js';
import { DriverModel } from '../modules/identity/infrastructure/persistence/driver.model.js';
import { TrustScoreService } from '../modules/identity/application/trustScore.service.js';
import { connectMongo, disconnectMongo } from '../shared/db/mongo.js';
import { logger } from '../shared/logging/logger.js';

export interface BackfillOptions {
  dryRun: boolean;
  batchSize: number;
}

export interface BackfillReport {
  step: string;
  scanned: number;
  changed: number;
}

export async function backfillCancelledBy(opts: BackfillOptions): Promise<BackfillReport> {
  const report: BackfillReport = { step: 'cancelled-by', scanned: 0, changed: 0 };
  const filter = {
    status: { $in: ['CANCELLED', 'EXPIRED'] },
    $or: [{ cancelled_by: null }, { cancelled_by: { $exists: false } }],
  };
  let afterId: string | null = null;
  for (;;) {
    const rides: Array<{ _id: string; cancellation_reason: string | null; status: string }> =
      await RideModel.find(afterId ? { ...filter, _id: { $gt: afterId } } : filter)
        .sort({ _id: 1 })
        .limit(opts.batchSize)
        .select('_id cancellation_reason status')
        .lean()
        .exec();
    if (rides.length === 0) break;
    const events = await RideEventModel.find({
      ride_id: { $in: rides.map((r) => r._id) },
      event_type: { $in: ['RIDE_CANCELLED', 'OFFER_EXPIRED'] },
    })
      .select('ride_id actor_type')
      .lean()
      .exec();
    const actorByRide = new Map(events.map((e) => [e.ride_id, e.actor_type]));

    const ops: Array<{ updateOne: { filter: object; update: object } }> = [];
    for (const ride of rides) {
      report.scanned += 1;
      const actor =
        actorByRide.get(ride._id) ??
        (ride.status === 'EXPIRED'
          ? 'SYSTEM'
          : inferCancelledBy(ride.cancellation_reason as Parameters<typeof inferCancelledBy>[0]));
      if (!actor) continue; // ambiguous: stays null and is treated as neutral
      ops.push({ updateOne: { filter: { _id: ride._id }, update: { $set: { cancelled_by: actor } } } });
    }
    report.changed += ops.length;
    if (!opts.dryRun && ops.length > 0) await RideModel.bulkWrite(ops as never);
    afterId = rides[rides.length - 1]!._id;
    if (rides.length < opts.batchSize) break;
  }
  return report;
}

export async function backfillDisputes(opts: BackfillOptions): Promise<BackfillReport> {
  const report: BackfillReport = { step: 'disputes', scanned: 0, changed: 0 };
  const rideIds = new Set<string>();
  const opened = await RideEventModel.find({ event_type: 'PAYMENT_DISPUTED' })
    .select('ride_id created_at')
    .sort({ created_at: 1 })
    .lean()
    .exec();
  const resolved = await RideEventModel.find({ event_type: 'PAYMENT_DISPUTE_RESOLVED' })
    .select('ride_id created_at metadata')
    .sort({ created_at: 1 })
    .lean()
    .exec();
  const openedAt = new Map<string, Date>();
  for (const e of opened) {
    if (!openedAt.has(e.ride_id)) openedAt.set(e.ride_id, e.created_at);
    rideIds.add(e.ride_id);
  }
  const resolution = new Map<string, { outcome: string; at: Date }>();
  for (const e of resolved) {
    const outcome = (e.metadata as { outcome?: string } | undefined)?.outcome;
    if (outcome === 'RIDER_WINS' || outcome === 'DRIVER_WINS') {
      resolution.set(e.ride_id, { outcome, at: e.created_at });
      rideIds.add(e.ride_id);
    }
  }
  const ops: Array<{ updateOne: { filter: object; update: object } }> = [];
  for (const rideId of rideIds) {
    report.scanned += 1;
    const $set: Record<string, unknown> = {};
    const o = openedAt.get(rideId);
    const r = resolution.get(rideId);
    if (o) $set.disputed_at = o;
    if (r) {
      $set.dispute_outcome = r.outcome;
      $set.dispute_resolved_at = r.at;
    }
    ops.push({
      updateOne: {
        filter: {
          _id: rideId,
          $or: [{ dispute_outcome: null }, { dispute_outcome: { $exists: false } }, { disputed_at: null }],
        },
        update: { $set },
      },
    });
  }
  report.changed = ops.length;
  if (!opts.dryRun) {
    for (let i = 0; i < ops.length; i += opts.batchSize) {
      await RideModel.bulkWrite(ops.slice(i, i + opts.batchSize) as never);
    }
  }
  return report;
}

export async function backfillRatingSums(opts: BackfillOptions): Promise<BackfillReport> {
  const report: BackfillReport = { step: 'rating-sums', scanned: 0, changed: 0 };
  const groups: Array<{ _id: { role: string; id: string }; sum: number; count: number }> =
    await RideReviewModel.aggregate([
      { $match: { status: 'REVEALED' } },
      {
        $group: {
          _id: { role: '$reviewee_role', id: '$reviewee_id' },
          sum: { $sum: '$stars' },
          count: { $sum: 1 },
        },
      },
    ]).exec();
  for (const g of groups) {
    report.scanned += 1;
    const Model = (g._id.role === 'DRIVER' ? DriverModel : RiderModel) as unknown as {
      updateOne(filter: object, update: object): { exec(): Promise<unknown> };
    };
    const average = Number((g.sum / g.count).toFixed(2));
    report.changed += 1;
    if (opts.dryRun) continue;
    await Model.updateOne(
      { _id: g._id.id },
      { $set: { rating_sum: g.sum, rating_count: g.count, rating_average: average } },
    ).exec();
  }
  return report;
}

export async function backfillScores(opts: BackfillOptions): Promise<BackfillReport> {
  const report: BackfillReport = { step: 'scores', scanned: 0, changed: 0 };
  const service = new TrustScoreService({
    riderRepo: new MongoRiderRepository(),
    driverRepo: new MongoDriverRepository(),
    rideRepo: new MongoRideRepository(),
    mode: env.TRUST_SCORE_V2,
  });
  if (opts.dryRun) {
    report.scanned = (await RiderModel.countDocuments()) + (await DriverModel.countDocuments());
    return report;
  }
  report.scanned = report.changed = await service.refreshAll({ batchSize: opts.batchSize });
  return report;
}

export async function runBackfill(
  step: string,
  opts: BackfillOptions,
): Promise<BackfillReport[]> {
  const steps: Record<string, (o: BackfillOptions) => Promise<BackfillReport>> = {
    'cancelled-by': backfillCancelledBy,
    disputes: backfillDisputes,
    'rating-sums': backfillRatingSums,
    scores: backfillScores,
  };
  const names = step === 'all' ? Object.keys(steps) : [step];
  const reports: BackfillReport[] = [];
  for (const name of names) {
    const fn = steps[name];
    if (!fn) throw new Error(`Unknown step "${name}". Use one of: all, ${Object.keys(steps).join(', ')}`);
    const report = await fn(opts);
    logger.info({ ...report, dryRun: opts.dryRun }, 'trust backfill step finished');
    reports.push(report);
  }
  return reports;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const step = args.find((a) => a.startsWith('--step='))?.slice('--step='.length) ?? 'all';
  await connectMongo();
  try {
    const reports = await runBackfill(step, { dryRun, batchSize: 500 });
    console.table(reports);
    if (dryRun) console.log('Dry run: nothing was written.');
  } finally {
    await disconnectMongo();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
