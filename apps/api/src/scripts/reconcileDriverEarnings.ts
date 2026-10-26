import { MongoWalletRepository } from '../modules/ledger/index.js';
import { DriverEarningsUseCase } from '../modules/rides/application/useCases/driverEarnings.usecase.js';
import { MongoRideEventRepository, MongoRideRepository } from '../modules/rides/index.js';
import { connectMongo, disconnectMongo } from '../shared/db/mongo.js';
import { MongoUnitOfWork } from '../shared/db/unitOfWork.js';

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const backfill = process.argv.includes('--backfill-online');
  const allowIssues = process.argv.includes('--allow-issues');
  const driverId = readArg('--driver-id');
  const adminId = readArg('--admin-id');
  const rideIdsRaw = readArg('--ride-ids');
  const rideIds = rideIdsRaw
    ? rideIdsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  await connectMongo();
  try {
    const useCase = new DriverEarningsUseCase({
      rideRepo: new MongoRideRepository(),
      rideEventRepo: new MongoRideEventRepository(),
      walletRepo: new MongoWalletRepository(),
      unitOfWork: new MongoUnitOfWork(),
    });
    const report = await useCase.reconcile({
      mode: backfill ? 'BACKFILL_ONLINE_EARNINGS' : 'AUDIT',
      driverId,
      rideIds,
      adminId,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.issues.length > 0 && !allowIssues) {
      process.exitCode = 1;
    }
  } finally {
    await disconnectMongo();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Reconciliation failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
