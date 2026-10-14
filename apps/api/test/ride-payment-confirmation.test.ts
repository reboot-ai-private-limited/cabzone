import { describe, expect, it } from 'vitest';
import {
  CompleteRideUseCase,
  MemoryRideEventRepository,
  MemoryRideRepository,
  type RideEntity,
} from '../src/modules/rides/index.js';
import { MemoryWalletRepository } from '../src/modules/ledger/index.js';
import { unitOfWork } from './helpers/unitOfWork.js';

async function fixture(status: RideEntity['status'] = 'TRIP_STARTED') {
  const now = new Date();
  const rideRepo = new MemoryRideRepository();
  const walletRepo = new MemoryWalletRepository();
  const rideEventRepo = new MemoryRideEventRepository();
  await walletRepo.save({
    id: 'wallet',
    driverId: 'driver',
    balancePaise: 10000,
    status: 'ACTIVE',
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  await rideRepo.save({
    id: 'ride',
    bookerRiderId: 'rider',
    driverId: 'driver',
    vehicleId: null,
    vehicleCategory: 'CAB',
    passenger: {
      riderId: 'rider',
      name: 'Passenger',
      phoneE164: '+919876543210',
      pickupOtpHash: null,
    },
    pickup: { lat: 26.71, lng: 88.42, address: null },
    drop: { lat: 26.75, lng: 88.45, address: null },
    routeSnapshot: {
      provider: 'TEST',
      distanceM: 6000,
      durationSeconds: 600,
      polyline: '',
      calculatedAt: now,
    },
    zoneSnapshot: { classification: 'IN_CITY', cityZoneId: 'city' },
    pricingSnapshot: {
      pricingConfigId: 'price',
      pricingConfigVersion: 1,
      vehicleCategory: 'CAB',
      baseFarePaise: 5000,
      ratePerKmPaise: 1000,
      minimumFarePaise: 5000,
      bufferSurchargePaise: 0,
      negotiationFloorPercent: 80,
      negotiationCeilingPercent: 150,
      commissionPercent: 8,
      zoneType: 'IN_CITY',
    },
    suggestedFarePaise: 11000,
    proposedFarePaise: 11000,
    agreedFarePaise: 11000,
    status,
    cancellationReason: null,
    offeringExpiresAt: null,
    acceptedAt: now,
    arrivedAt: now,
    startedAt: now,
    completedAt: status === 'PAYMENT_PENDING' ? now : null,
    settledAt: null,
    cancelledAt: null,
    version: 4,
    createdAt: now,
    updatedAt: now,
  });
  return {
    rideRepo,
    walletRepo,
    rideEventRepo,
    complete: new CompleteRideUseCase({ rideRepo, walletRepo, rideEventRepo, unitOfWork }),
  };
}

describe('Payment confirmation before commission settlement', () => {
  it('completes the trip into PAYMENT_PENDING without posting commission', async () => {
    const { complete, walletRepo } = await fixture();
    const result = await complete.execute({ rideId: 'ride', driverId: 'driver' });
    expect(result.ride.status).toBe('PAYMENT_PENDING');
    expect(result.ride.completedAt).toBeInstanceOf(Date);
    expect(result.ride.settledAt).toBeNull();
    expect((await walletRepo.findByDriverId('driver'))?.balancePaise).toBe(10000);
    expect(await walletRepo.findTransactionsByWalletId('wallet')).toHaveLength(0);
  });

  it('returns the pending outcome on repeated completion without changing it', async () => {
    const { complete, walletRepo, rideRepo } = await fixture();
    const first = await complete.execute({ rideId: 'ride', driverId: 'driver' });
    const retry = await complete.execute({ rideId: 'ride', driverId: 'driver' });
    expect(first.ride.status).toBe('PAYMENT_PENDING');
    expect(retry).toEqual(first);
    expect((await rideRepo.findById('ride'))?.version).toBe(5);
    expect(await walletRepo.findTransactionsByWalletId('wallet')).toHaveLength(0);
  });

  it('settles and debits commission once after payment confirmation, including retries', async () => {
    const { complete, walletRepo, rideRepo } = await fixture('PAYMENT_PENDING');
    const first = await complete.confirmPayment({ rideId: 'ride', driverId: 'driver' });
    const retry = await complete.confirmPayment({ rideId: 'ride', driverId: 'driver' });
    expect(first.ride.status).toBe('SETTLED');
    expect(first.ride.settledAt).toBeInstanceOf(Date);
    expect(retry).toEqual(first);
    expect((await rideRepo.findById('ride'))?.version).toBe(5);
    expect((await walletRepo.findByDriverId('driver'))?.balancePaise).toBe(9120);
    const transactions = await walletRepo.findTransactionsByWalletId('wallet');
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      referenceType: 'RIDE_COMMISSION',
      referenceId: 'ride',
      type: 'DEBIT',
      amountPaise: 880,
    });
  });

  it('rejects payment confirmation by a different driver without posting money', async () => {
    const { complete, walletRepo, rideRepo } = await fixture('PAYMENT_PENDING');
    await expect(
      complete.confirmPayment({ rideId: 'ride', driverId: 'other-driver' }),
    ).rejects.toThrow('UNAUTHORIZED_DRIVER');
    expect((await rideRepo.findById('ride'))?.status).toBe('PAYMENT_PENDING');
    expect(await walletRepo.findTransactionsByWalletId('wallet')).toHaveLength(0);
  });

  it('rejects payment confirmation before the trip is completed', async () => {
    const { complete, walletRepo, rideRepo } = await fixture();
    await expect(complete.confirmPayment({ rideId: 'ride', driverId: 'driver' })).rejects.toThrow(
      'INVALID_RIDE_STATE',
    );
    expect((await rideRepo.findById('ride'))?.status).toBe('TRIP_STARTED');
    expect(await walletRepo.findTransactionsByWalletId('wallet')).toHaveLength(0);
  });

  it('records a rider dispute and refunds the charged commission once when the rider wins', async () => {
    const { complete, walletRepo, rideRepo, rideEventRepo } = await fixture('PAYMENT_PENDING');
    await complete.confirmPayment({ rideId: 'ride', driverId: 'driver' });
    const disputed = await complete.disputePayment({
      rideId: 'ride',
      riderId: 'rider',
      reason: 'I paid less than the stated fare',
    });
    expect(disputed.status).toBe('PAYMENT_DISPUTED');
    expect((await walletRepo.findByDriverId('driver'))?.balancePaise).toBe(9120);
    const resolved = await complete.resolveDispute({
      rideId: 'ride',
      adminId: 'admin',
      outcome: 'RIDER_WINS',
      reason: 'Verified overcharge',
    });
    expect(resolved.status).toBe('SETTLED');
    expect((await walletRepo.findByDriverId('driver'))?.balancePaise).toBe(10000);
    await complete.resolveDispute({
      rideId: 'ride',
      adminId: 'admin',
      outcome: 'RIDER_WINS',
      reason: 'Verified overcharge',
    });
    expect(await walletRepo.findTransactionsByWalletId('wallet')).toHaveLength(2);
    expect((await rideRepo.findById('ride'))?.version).toBe(7);
    expect((await rideEventRepo.findByRideId('ride')).map((event) => event.eventType)).toContain(
      'PAYMENT_DISPUTED',
    );
    expect((await rideEventRepo.findByRideId('ride')).map((event) => event.eventType)).toContain(
      'PAYMENT_DISPUTE_RESOLVED',
    );
  });

  it('keeps commission when the driver wins and rejects a changed resolution', async () => {
    const { complete, walletRepo } = await fixture('PAYMENT_PENDING');
    await complete.confirmPayment({ rideId: 'ride', driverId: 'driver' });
    await complete.disputePayment({
      rideId: 'ride',
      riderId: 'rider',
      reason: 'Payment status is wrong',
    });
    await complete.resolveDispute({
      rideId: 'ride',
      adminId: 'admin',
      outcome: 'DRIVER_WINS',
      reason: 'Receipt verified',
    });
    expect((await walletRepo.findByDriverId('driver'))?.balancePaise).toBe(9120);
    await expect(
      complete.resolveDispute({
        rideId: 'ride',
        adminId: 'admin',
        outcome: 'RIDER_WINS',
        reason: 'Changed',
      }),
    ).rejects.toThrow('DISPUTE_ALREADY_RESOLVED');
    expect(await walletRepo.findTransactionsByWalletId('wallet')).toHaveLength(1);
  });
});
