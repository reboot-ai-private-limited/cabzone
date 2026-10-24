import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletMoneyUseCase } from '../../src/modules/ledger/application/useCases/walletMoney.usecase.js';
import { MongoWalletRepository } from '../../src/modules/ledger/infrastructure/persistence/mongoWallet.repository.js';
import { WalletModel } from '../../src/modules/ledger/infrastructure/persistence/wallet.model.js';
import { WalletTransactionModel } from '../../src/modules/ledger/infrastructure/persistence/walletTransaction.model.js';
import {
  MongoWalletOperationRepository,
  WalletOperationModel,
} from '../../src/modules/ledger/infrastructure/persistence/walletOperation.repository.js';
import { MongoUnitOfWork } from '../../src/shared/db/unitOfWork.js';

describe('Atomic Mongo wallet money movement', () => {
  let replSet: MongoMemoryReplSet;
  const walletRepo = new MongoWalletRepository();
  const operations = new MongoWalletOperationRepository();
  const gateway = {
    live: false,
    keyId: 'rzp_test_fixture',
    createOrder: vi.fn(async () => 'order_fixture'),
    findCapturedPayment: vi.fn(async () => 'pay_fixture'),
  };
  const money = new WalletMoneyUseCase({
    walletRepo,
    operations,
    gateway,
    unitOfWork: new MongoUnitOfWork(),
    enabled: true,
  });
  beforeAll(async () => {
    const systemBinary = [
      process.env.MONGOMS_SYSTEM_BINARY,
      resolve(
        process.cwd(),
        '../../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe',
      ),
      'C:/Users/zxprg/.cache/mongodb-binaries/mongod-x64-win32-8.2.6.exe',
    ].find((path) => path && existsSync(path));
    replSet = await MongoMemoryReplSet.create({
      ...(systemBinary ? { binary: { systemBinary } } : {}),
      replSet: { count: 1 },
    });
    await mongoose.connect(replSet.getUri());
    await Promise.all([
      WalletModel.init(),
      WalletTransactionModel.init(),
      WalletOperationModel.init(),
    ]);
  });
  beforeEach(async () => {
    await Promise.all([
      WalletModel.deleteMany({}),
      WalletTransactionModel.deleteMany({}),
      WalletOperationModel.deleteMany({}),
    ]);
    await walletRepo.save({
      id: 'wallet',
      driverId: 'driver',
      balancePaise: 10000,
      earningsBalancePaise: 20000,
      status: 'ACTIVE',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await mongoose.disconnect();
    await replSet?.stop();
  });

  it('allows only one concurrent cashout and reserves its funds exactly once', async () => {
    const attempts = await Promise.allSettled([
      money.requestCashout('driver', 25000, 'driver@upi', 'request-one'),
      money.requestCashout('driver', 25000, 'driver@upi', 'request-two'),
    ]);
    expect(attempts.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(await walletRepo.findByDriverId('driver')).toMatchObject({
      balancePaise: 5000,
      earningsBalancePaise: 0,
    });
    expect(await operations.list('driver')).toHaveLength(1);
    expect(await walletRepo.findTransactionsByWalletId('wallet')).toHaveLength(2);
  });

  it('rolls back reservation and rejection refund when the operation save fails', async () => {
    const save = vi
      .spyOn(operations, 'save')
      .mockRejectedValueOnce(new Error('operation unavailable'));
    await expect(
      money.requestCashout('driver', 25000, 'driver@upi', 'request-fail'),
    ).rejects.toThrow('operation unavailable');
    expect(await walletRepo.findByDriverId('driver')).toMatchObject({
      balancePaise: 10000,
      earningsBalancePaise: 20000,
    });
    expect(await walletRepo.findTransactionsByWalletId('wallet')).toHaveLength(0);
    save.mockRestore();
    const cashout = await money.requestCashout('driver', 25000, 'driver@upi', 'request-good');
    vi.spyOn(operations, 'save').mockRejectedValueOnce(new Error('decision unavailable'));
    await expect(
      money.resolveCashout(cashout.id, 'REJECTED', 'Invalid destination', 'finance'),
    ).rejects.toThrow('decision unavailable');
    expect((await operations.find(cashout.id))?.status).toBe('PENDING');
    expect(await walletRepo.findByDriverId('driver')).toMatchObject({
      balancePaise: 5000,
      earningsBalancePaise: 0,
    });
    expect(await walletRepo.findTransactionsByWalletId('wallet')).toHaveLength(2);
  });

  it('reuses a concurrent recharge request and credits concurrent confirmations once', async () => {
    const requests = await Promise.all([
      money.createRecharge('driver', 10000, 'same-recharge'),
      money.createRecharge('driver', 10000, 'same-recharge'),
    ]);
    expect(requests[0]?.id).toBe(requests[1]?.id);
    const recharge = requests[0]!;
    await Promise.all([
      money.reconcileRecharge(recharge.id, 'driver'),
      money.reconcileRecharge(recharge.id, 'driver'),
    ]);
    expect((await walletRepo.findByDriverId('driver'))?.balancePaise).toBe(20000);
    expect(await walletRepo.findTransactionsByWalletId('wallet')).toHaveLength(1);
  });

  it('creates one wallet when two first recharges confirm together', async () => {
    await WalletModel.deleteMany({});
    const first = await money.createRecharge('new-driver', 10000, 'first-recharge');
    const second = await money.createRecharge('new-driver', 20000, 'second-recharge');
    await Promise.all([
      money.reconcileRecharge(first.id, 'new-driver'),
      money.reconcileRecharge(second.id, 'new-driver'),
    ]);
    expect(await WalletModel.countDocuments({ driver_id: 'new-driver' })).toBe(1);
    expect((await walletRepo.findByDriverId('new-driver'))?.balancePaise).toBe(30000);
  });
});
