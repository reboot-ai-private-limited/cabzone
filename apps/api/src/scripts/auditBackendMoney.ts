import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { MongoUnitOfWork } from '../shared/db/unitOfWork.js';
import { DriverEarningsUseCase } from '../modules/rides/application/useCases/driverEarnings.usecase.js';
import { MongoRideRepository } from '../modules/rides/infrastructure/persistence/mongoRide.repository.js';
import { MongoRideEventRepository } from '../modules/rides/infrastructure/persistence/mongoRideEvent.repository.js';
import { RazorpayGateway } from '../modules/rides/infrastructure/razorpay.adapter.js';
import { MongoWalletRepository } from '../modules/ledger/infrastructure/persistence/mongoWallet.repository.js';
import { MongoWalletOperationRepository } from '../modules/ledger/infrastructure/persistence/walletOperation.repository.js';
import { ReconcileWalletLedgerUseCase } from '../modules/ledger/application/useCases/reconcileWalletLedger.usecase.js';

/** Explicit AUDIT-only entry point: no migrations, auto-indexing, recovery or payment writes. */
async function main(): Promise<void> {
  await mongoose.connect(env.MONGO_URI, {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 10000,
  });
  try {
    const walletRepo = new MongoWalletRepository();
    const gateway =
      env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
        ? new RazorpayGateway(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, true, env.RAZORPAY_MODE)
        : undefined;
    const earnings = await new DriverEarningsUseCase({
      rideRepo: new MongoRideRepository(),
      rideEventRepo: new MongoRideEventRepository(),
      walletRepo,
      unitOfWork: new MongoUnitOfWork(),
      gateway,
    }).reconcile({ mode: 'AUDIT' });
    const ledger = await new ReconcileWalletLedgerUseCase({
      walletRepo,
      gateway,
      operations: new MongoWalletOperationRepository(),
    }).execute({ mode: 'AUDIT' });
    assert.equal(earnings.mode, 'AUDIT');
    assert.equal(ledger.mode, 'AUDIT');
    assert.equal(earnings.backfilledRideIds.length, 0);
    assert.equal(ledger.reconciledRechargeIds.length, 0);
    process.stdout.write(
      `${JSON.stringify(
        {
          providerVerification: gateway ? env.RAZORPAY_MODE : 'unconfigured',
          earnings,
          ledger,
        },
        null,
        2,
      )}\n`,
    );
    if (earnings.issues.length || ledger.issues.length) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
main().catch(() => {
  process.stderr.write(
    'Read-only money audit failed. Check database connectivity and provider configuration locally.\n',
  );
  process.exitCode = 1;
});
