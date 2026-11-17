import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import {
  MongoPaymentRepository,
  MongoWalletRepository,
  PaymentModel,
} from '../../src/modules/ledger/index.js';
import { MongoRideEventRepository, MongoRideRepository } from '../../src/modules/rides/index.js';
import { RideQrPaymentUseCase } from '../../src/modules/rides/application/useCases/rideQrPayment.usecase.js';
import { MockQrPaymentGateway } from '../../src/modules/rides/infrastructure/razorpayQr.gateway.js';
import { MongoUnitOfWork } from '../../src/shared/db/unitOfWork.js';
import { extensionRide } from '../helpers/extensionRide.js';

let server: MongoMemoryReplSet;
beforeAll(async () => {
  const systemBinary = [
    process.env.MONGOMS_SYSTEM_BINARY,
    resolve(
      process.cwd(),
      '../../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe',
    ),
    'C:/Users/zxprg/.cache/mongodb-binaries/mongod-x64-win32-8.2.6.exe',
  ].find((p) => p && existsSync(p));
  server = await MongoMemoryReplSet.create({
    ...(systemBinary ? { binary: { systemBinary } } : {}),
    replSet: { count: 1 },
  });
  await mongoose.connect(server.getUri());
  await PaymentModel.createIndexes();
});
afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
});

it('rolls back capture when settlement fails, then settles once across concurrent retrying workers', async () => {
  const rideRepo = new MongoRideRepository();
  const rideEventRepo = new MongoRideEventRepository();
  const paymentRepo = new MongoPaymentRepository();
  const walletRepo = new MongoWalletRepository();
  const gateway = new MockQrPaymentGateway();
  const onRideSettled = vi.fn(async () => {});
  const deps = {
    rideRepo,
    rideEventRepo,
    paymentRepo,
    walletRepo,
    gateway,
    unitOfWork: new MongoUnitOfWork(),
    onRideSettled,
  };
  const first = new RideQrPaymentUseCase(deps);
  const second = new RideQrPaymentUseCase(deps);
  const now = new Date();
  const ride = { ...extensionRide(now), status: 'PAYMENT_PENDING' as const, arrearsPaise: 0 };
  await rideRepo.save(ride);
  await first.createOrGet(ride.id, ride.driverId!);
  const [row] = await paymentRepo.listQrByRideId(ride.id);
  const credit = {
    gatewayRef: row!.gatewayRef!,
    providerPaymentId: 'pay_transaction',
    creditedAmountPaise: row!.amountPaise,
  };

  await expect(first.handleWebhookCredited(credit)).rejects.toThrow(/wallet is unavailable/);
  expect((await paymentRepo.findById(row!.id))?.status).toBe('PENDING');
  expect((await rideRepo.findById(ride.id))?.status).toBe('PAYMENT_PENDING');
  expect(onRideSettled).not.toHaveBeenCalled();

  await walletRepo.save({
    id: 'wallet-qr',
    driverId: ride.driverId!,
    balancePaise: 0,
    earningsBalancePaise: 0,
    status: 'ACTIVE',
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  await Promise.all([first.handleWebhookCredited(credit), second.handleWebhookCredited(credit)]);
  expect((await paymentRepo.findById(row!.id))?.status).toBe('CAPTURED');
  expect((await rideRepo.findById(ride.id))?.status).toBe('SETTLED');
  // Single wallet: net online earnings land in the one balance (started at 0).
  expect((await walletRepo.findByDriverId(ride.driverId!))?.balancePaise).toBe(23000);
  expect(onRideSettled).toHaveBeenCalledTimes(1);
});
