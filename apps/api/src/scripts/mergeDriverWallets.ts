import { newUuid } from '../shared/ids.js';
import { MongoWalletRepository } from '../modules/ledger/index.js';
import { connectMongo, disconnectMongo } from '../shared/db/mongo.js';
import { MongoUnitOfWork } from '../shared/db/unitOfWork.js';

/**
 * One-time migration to the single driver wallet: folds each driver's legacy
 * `earningsBalancePaise` into `balancePaise`, leaving the earnings bucket at zero.
 *
 * Each move is posted as a matched pair (EARNINGS debit, COMMISSION credit, reference type
 * WALLET_MERGE) so both ledger chains still reconcile. Idempotent: wallets with no earnings
 * balance are skipped, and the transaction keys are deterministic.
 *
 * Usage: pnpm --filter @cabzone/api migrate:single-wallet [--dry-run]
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await connectMongo();
  try {
    const walletRepo = new MongoWalletRepository();
    const unitOfWork = new MongoUnitOfWork();
    const wallets = (await walletRepo.findAllWallets?.()) ?? [];
    let merged = 0;
    let totalPaise = 0;
    for (const listed of wallets) {
      if (listed.ownerType === 'RIDER' || (listed.earningsBalancePaise ?? 0) <= 0) continue;
      if (dryRun) {
        merged += 1;
        totalPaise += listed.earningsBalancePaise ?? 0;
        process.stdout.write(`[dry-run] ${listed.driverId}: ${listed.earningsBalancePaise} paise
`);
        continue;
      }
      await unitOfWork.run(async () => {
        const wallet = await walletRepo.findById(listed.id);
        const earnings = wallet?.earningsBalancePaise ?? 0;
        if (!wallet || earnings <= 0) return;
        const now = new Date();
        const balanceAfter = wallet.balancePaise + earnings;
        await walletRepo.recordTransaction({
          id: newUuid(),
          walletId: wallet.id,
          driverId: wallet.driverId,
          bucket: 'EARNINGS',
          type: 'DEBIT',
          amountPaise: earnings,
          referenceType: 'WALLET_MERGE',
          referenceId: wallet.id,
          idempotencyKey: `wallet-merge:${wallet.id}:EARNINGS`,
          balanceBeforePaise: earnings,
          balanceAfterPaise: 0,
          createdBy: null,
          note: 'Single wallet migration: earnings moved into main balance',
          createdAt: now,
        });
        await walletRepo.recordTransaction({
          id: newUuid(),
          walletId: wallet.id,
          driverId: wallet.driverId,
          bucket: 'COMMISSION',
          type: 'CREDIT',
          amountPaise: earnings,
          referenceType: 'WALLET_MERGE',
          referenceId: wallet.id,
          idempotencyKey: `wallet-merge:${wallet.id}:COMMISSION`,
          balanceBeforePaise: wallet.balancePaise,
          balanceAfterPaise: balanceAfter,
          createdBy: null,
          note: 'Single wallet migration: earnings moved into main balance',
          createdAt: now,
        });
        await walletRepo.save({
          ...wallet,
          balancePaise: balanceAfter,
          earningsBalancePaise: 0,
          owedPaise: Math.max(0, -balanceAfter),
          version: wallet.version + 1,
          updatedAt: now,
        });
        merged += 1;
        totalPaise += earnings;
      });
    }
    process.stdout.write(
      `${dryRun ? 'Would merge' : 'Merged'} ${merged} wallet(s), ${totalPaise} paise total.
`,
    );
  } finally {
    await disconnectMongo();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Migration failed: ${err instanceof Error ? err.message : String(err)}
`);
  process.exit(1);
});
