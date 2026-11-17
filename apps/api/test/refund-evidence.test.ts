import { describe, expect, it, vi } from 'vitest';
import { MemoryWalletRepository } from '../src/modules/ledger/index.js';
import {
  MemoryRideEventRepository,
  MemoryRideRepository,
  type RideEntity,
} from '../src/modules/rides/index.js';
import { CompleteRideUseCase } from '../src/modules/rides/application/useCases/completeRide.usecase.js';
import { unitOfWork } from './helpers/unitOfWork.js';

interface RefundEvidence {
  id: string;
  paymentId: string;
  amountPaise: number;
  currency: string;
  status: string;
}

const verifiedRefund: RefundEvidence = {
  id: 'rfnd_verified',
  paymentId: 'pay_original',
  amountPaise: 23000,
  currency: 'INR',
  status: 'processed',
};

async function disputedPayment(
  method: 'UPI' | 'CASH' | 'UPI_DUPLICATE',
  refundVerifier?: { fetchRefund: (refundId: string) => Promise<RefundEvidence> },
) {
  const now = new Date('2026-10-29T10:00:00Z');
  const rideRepo = new MemoryRideRepository();
  const rideEventRepo = new MemoryRideEventRepository();
  const walletRepo = new MemoryWalletRepository();
  const ride: RideEntity = {
    id: 'refund-evidence-ride',
    bookerRiderId: 'rider-1',
    driverId: 'driver-1',
    vehicleId: null,
    vehicleCategory: 'CAB',
    passenger: {
      riderId: 'rider-1',
      name: 'Test rider',
      phoneE164: '+919876500011',
      pickupOtpHash: null,
    },
    pickup: { lat: 26.72, lng: 88.43, address: 'Pickup' },
    drop: { lat: 26.71, lng: 88.42, address: 'Drop' },
    routeSnapshot: {
      provider: 'TEST',
      distanceM: 4200,
      durationSeconds: 780,
      polyline: '',
      calculatedAt: now,
    },
    zoneSnapshot: { classification: 'IN_CITY', cityZoneId: null },
    pricingSnapshot: {
      pricingConfigId: 'cfg-1',
      pricingConfigVersion: 1,
      vehicleCategory: 'CAB',
      baseFarePaise: 5000,
      ratePerKmPaise: 1200,
      minimumFarePaise: 5000,
      bufferSurchargePaise: 0,
      negotiationFloorPercent: 80,
      negotiationCeilingPercent: 150,
      commissionPercent: 8,
      zoneType: 'IN_CITY',
    },
    suggestedFarePaise: 20000,
    proposedFarePaise: 20000,
    agreedFarePaise: 20000,
    arrearsPaise: 3000,
    status: 'PAYMENT_DISPUTED',
    cancellationReason: null,
    offeringExpiresAt: null,
    acceptedAt: now,
    arrivedAt: now,
    startedAt: now,
    completedAt: now,
    settledAt: now,
    cancelledAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await rideRepo.save(ride);
  await walletRepo.save({
    id: 'driver-wallet',
    driverId: 'driver-1',
    balancePaise: 23400,
    earningsBalancePaise: 0,
    status: 'ACTIVE',
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  await walletRepo.save({
    id: 'rider-wallet',
    ownerType: 'RIDER',
    driverId: '',
    riderId: 'rider-1',
    balancePaise: 0,
    status: 'ACTIVE',
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  await walletRepo.recordTransaction({
    id: 'earnings',
    walletId: 'driver-wallet',
    driverId: 'driver-1',
    bucket: 'COMMISSION',
    type: 'CREDIT',
    amountPaise: 18400,
    referenceType: 'ONLINE_RIDE_EARNINGS',
    referenceId: ride.id,
    idempotencyKey: `ride-earnings:${ride.id}`,
    balanceBeforePaise: 5000,
    balanceAfterPaise: 23400,
    createdBy: null,
    createdAt: now,
  });
  await walletRepo.recordTransaction({
    id: 'arrears',
    walletId: 'rider-wallet',
    ownerType: 'RIDER',
    driverId: null,
    riderId: 'rider-1',
    type: 'CREDIT',
    amountPaise: 3000,
    referenceType: 'CANCELLATION_FEE_ARREARS',
    referenceId: ride.id,
    idempotencyKey: `rider_arrears_paid_${ride.id}`,
    balanceBeforePaise: -3000,
    balanceAfterPaise: 0,
    createdBy: null,
    createdAt: now,
  });
  await rideEventRepo.save({
    id: 'confirmed',
    rideId: ride.id,
    eventType: 'PAYMENT_CONFIRMED',
    actorType: 'SYSTEM',
    actorId: null,
    previousStatus: 'PAYMENT_PENDING',
    newStatus: 'SETTLED',
    metadata: {
      method: method === 'CASH' ? 'CASH' : 'UPI',
      paymentId: method === 'CASH' ? undefined : 'pay_original',
      farePaise: 20000,
      arrearsPaise: 3000,
      totalPayablePaise: 23000,
    },
    createdAt: now,
  });
  await rideEventRepo.save({
    id: 'disputed',
    rideId: ride.id,
    eventType: 'PAYMENT_DISPUTED',
    actorType: 'RIDER',
    actorId: 'rider-1',
    previousStatus: 'SETTLED',
    newStatus: 'PAYMENT_DISPUTED',
    metadata:
      method === 'CASH'
        ? {
            reason: 'Late UPI capture after cash',
            paymentId: 'pay_late_capture',
            amountPaise: 23000,
          }
        : method === 'UPI_DUPLICATE'
          ? {
              reason: 'Duplicate UPI payment received after the ride was settled',
              duplicate: true,
              duplicateOf: 'UPI',
              paymentId: 'pay_duplicate',
              totalPayablePaise: 23000,
            }
          : { reason: 'Payment disputed' },
    createdAt: new Date(now.getTime() + 1),
  });
  return {
    ride,
    rideRepo,
    rideEventRepo,
    walletRepo,
    completeRide: new CompleteRideUseCase({
      rideRepo,
      rideEventRepo,
      walletRepo,
      unitOfWork,
      ...(refundVerifier ? { refundVerifier } : {}),
    }),
  };
}

describe('Dispute provider refund evidence', () => {
  it('does not reverse full online earnings or restore collected arrears from an unverified refund reference', async () => {
    const h = await disputedPayment('UPI');
    await expect(
      h.completeRide.resolveDispute({
        rideId: h.ride.id,
        adminId: 'admin-1',
        outcome: 'RIDER_WINS',
        reason: 'Refund reviewed',
        refundReference: 'rfnd_arbitrary_unverified',
      }),
    ).rejects.toThrow();
    expect((await h.rideRepo.findById(h.ride.id))?.status).toBe('PAYMENT_DISPUTED');
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(23400);
    expect((await h.walletRepo.findByRiderId('rider-1'))?.balancePaise).toBe(0);
    expect(
      await h.walletRepo.findTransactionByIdempotencyKey(
        `dispute_online_reversal_${h.ride.id}:EARNINGS`,
      ),
    ).toBeNull();
    expect(
      await h.walletRepo.findTransactionByIdempotencyKey(`dispute_arrears_reinstate_${h.ride.id}`),
    ).toBeNull();
  });

  it('keeps a duplicate UPI-after-cash dispute open until the actual online refund is verified', async () => {
    const h = await disputedPayment('CASH');
    await expect(
      h.completeRide.resolveDispute({
        rideId: h.ride.id,
        adminId: 'admin-1',
        outcome: 'RIDER_WINS',
        reason: 'Late capture refund reviewed',
        refundReference: 'rfnd_unrelated_payment',
      }),
    ).rejects.toThrow();
    expect((await h.rideRepo.findById(h.ride.id))?.status).toBe('PAYMENT_DISPUTED');
    expect(
      (await h.rideEventRepo.findByRideId(h.ride.id)).some(
        (event) => event.eventType === 'PAYMENT_DISPUTE_RESOLVED',
      ),
    ).toBe(false);
  });

  it.each([
    ['a different refund ID', { id: 'rfnd_other' }],
    ['a different payment', { paymentId: 'pay_other' }],
    ['fare only without recovered arrears', { amountPaise: 20000 }],
    ['an excessive amount', { amountPaise: 24000 }],
    ['a different currency', { currency: 'USD' }],
    ['a pending refund', { status: 'pending' }],
    ['a failed refund', { status: 'failed' }],
  ] satisfies [string, Partial<RefundEvidence>][])(
    'rejects %s before changing the dispute or either wallet',
    async (_label, patch) => {
      const fetchRefund = vi.fn(async () => ({ ...verifiedRefund, ...patch }));
      const h = await disputedPayment('UPI', { fetchRefund });
      await expect(
        h.completeRide.resolveDispute({
          rideId: h.ride.id,
          adminId: 'admin-1',
          outcome: 'RIDER_WINS',
          reason: 'Refund reviewed',
          refundReference: verifiedRefund.id,
        }),
      ).rejects.toThrow();
      expect(fetchRefund).toHaveBeenCalledWith(verifiedRefund.id);
      expect((await h.rideRepo.findById(h.ride.id))?.status).toBe('PAYMENT_DISPUTED');
      expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(23400);
      expect((await h.walletRepo.findByRiderId('rider-1'))?.balancePaise).toBe(0);
      expect(
        (await h.rideEventRepo.findByRideId(h.ride.id)).filter(
          (event) => event.eventType === 'PAYMENT_DISPUTE_RESOLVED',
        ),
      ).toHaveLength(0);
      expect(
        await h.walletRepo.findTransactionByIdempotencyKey(
          `dispute_online_reversal_${h.ride.id}:EARNINGS`,
        ),
      ).toBeNull();
    },
  );

  it('leaves the dispute and wallets untouched when the provider lookup fails', async () => {
    const fetchRefund = vi.fn(async (): Promise<RefundEvidence> => {
      throw new Error('Provider unavailable');
    });
    const h = await disputedPayment('UPI', { fetchRefund });
    await expect(
      h.completeRide.resolveDispute({
        rideId: h.ride.id,
        adminId: 'admin-1',
        outcome: 'RIDER_WINS',
        reason: 'Refund reviewed',
        refundReference: verifiedRefund.id,
      }),
    ).rejects.toThrow();
    expect((await h.rideRepo.findById(h.ride.id))?.status).toBe('PAYMENT_DISPUTED');
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(23400);
    expect((await h.walletRepo.findByRiderId('rider-1'))?.balancePaise).toBe(0);
  });

  it('reverses online earnings and restores refunded arrears once after verifying the full refund', async () => {
    const fetchRefund = vi.fn(async () => verifiedRefund);
    const h = await disputedPayment('UPI', { fetchRefund });
    const resolution = {
      rideId: h.ride.id,
      adminId: 'admin-1',
      outcome: 'RIDER_WINS' as const,
      reason: 'Refund reviewed',
      refundReference: verifiedRefund.id,
    };
    expect((await h.completeRide.resolveDispute(resolution)).status).toBe('SETTLED');
    await h.completeRide.resolveDispute(resolution);
    expect(fetchRefund).toHaveBeenCalledTimes(1);
    expect(fetchRefund).toHaveBeenCalledWith(verifiedRefund.id);
    expect((await h.walletRepo.findByDriverId('driver-1'))?.earningsBalancePaise).toBe(0);
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(5000);
    expect((await h.walletRepo.findByRiderId('rider-1'))?.balancePaise).toBe(-3000);
    expect(
      (await h.walletRepo.findTransactionsByWalletId('driver-wallet')).filter(
        (transaction) => transaction.referenceType === 'ONLINE_EARNINGS_REVERSAL',
      ),
    ).toHaveLength(1);
    expect(
      (await h.walletRepo.findTransactionsByWalletId('rider-wallet')).filter(
        (transaction) => transaction.idempotencyKey === `dispute_arrears_reinstate_${h.ride.id}`,
      ),
    ).toHaveLength(1);
    expect(
      (await h.rideEventRepo.findByRideId(h.ride.id)).filter(
        (event) => event.eventType === 'PAYMENT_DISPUTE_RESOLVED',
      ),
    ).toHaveLength(1);
  });

  it('rejects a refund of the wrong payment when cash was followed by a late UPI capture', async () => {
    const fetchRefund = vi.fn(async () => verifiedRefund);
    const h = await disputedPayment('CASH', { fetchRefund });
    await expect(
      h.completeRide.resolveDispute({
        rideId: h.ride.id,
        adminId: 'admin-1',
        outcome: 'RIDER_WINS',
        reason: 'Refund reviewed',
        refundReference: verifiedRefund.id,
      }),
    ).rejects.toThrow();
    expect((await h.rideRepo.findById(h.ride.id))?.status).toBe('PAYMENT_DISPUTED');
  });

  it('accepts the actual late UPI refund without reversing the cash settlement', async () => {
    const fetchRefund = vi.fn(async () => ({
      ...verifiedRefund,
      paymentId: 'pay_late_capture',
    }));
    const h = await disputedPayment('CASH', { fetchRefund });
    const resolution = {
      rideId: h.ride.id,
      adminId: 'admin-1',
      outcome: 'RIDER_WINS' as const,
      reason: 'Late UPI capture refunded',
      refundReference: verifiedRefund.id,
    };
    expect((await h.completeRide.resolveDispute(resolution)).status).toBe('SETTLED');
    await h.completeRide.resolveDispute(resolution);
    expect(fetchRefund).toHaveBeenCalledTimes(1);
    expect(fetchRefund).toHaveBeenCalledWith(verifiedRefund.id);
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(23400);
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(23400);
    expect((await h.walletRepo.findByRiderId('rider-1'))?.balancePaise).toBe(0);
    expect(
      (await h.rideEventRepo.findByRideId(h.ride.id)).filter(
        (event) => event.eventType === 'PAYMENT_DISPUTE_RESOLVED',
      ),
    ).toHaveLength(1);
  });

  it('rejects a refund of the original payment when the dispute is a duplicate UPI payment', async () => {
    const fetchRefund = vi.fn(async () => verifiedRefund); // refunds pay_original, not the duplicate
    const h = await disputedPayment('UPI_DUPLICATE', { fetchRefund });
    await expect(
      h.completeRide.resolveDispute({
        rideId: h.ride.id,
        adminId: 'admin-1',
        outcome: 'RIDER_WINS',
        reason: 'Refund reviewed',
        refundReference: verifiedRefund.id,
      }),
    ).rejects.toThrow();
    expect((await h.rideRepo.findById(h.ride.id))?.status).toBe('PAYMENT_DISPUTED');
  });

  it('refunds only the duplicate UPI payment and leaves the original earnings untouched', async () => {
    const fetchRefund = vi.fn(async () => ({ ...verifiedRefund, paymentId: 'pay_duplicate' }));
    const h = await disputedPayment('UPI_DUPLICATE', { fetchRefund });
    const resolved = await h.completeRide.resolveDispute({
      rideId: h.ride.id,
      adminId: 'admin-1',
      outcome: 'RIDER_WINS',
      reason: 'Duplicate payment refunded',
      refundReference: verifiedRefund.id,
    });
    expect(resolved.status).toBe('SETTLED');
    const driver = await h.walletRepo.findByDriverId('driver-1');
    expect(driver?.balancePaise).toBe(23400);
    expect(driver?.balancePaise).toBe(23400);
    expect((await h.walletRepo.findByRiderId('rider-1'))?.balancePaise).toBe(0);
    const event = (await h.rideEventRepo.findByRideId(h.ride.id)).find(
      (e) => e.eventType === 'PAYMENT_DISPUTE_RESOLVED',
    );
    expect(event?.metadata).toMatchObject({
      duplicatePayment: true,
      reversedOnlineEarningsPaise: 0,
      refundedCollectedArrearsPaise: 0,
    });
  });
});
