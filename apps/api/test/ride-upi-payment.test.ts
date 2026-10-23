import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RideUpiPaymentUseCase } from '../src/modules/rides/application/useCases/rideUpiPayment.usecase.js';
import { RazorpayTestGateway } from '../src/modules/rides/infrastructure/razorpay.adapter.js';
import {
  CompleteRideUseCase,
  MemoryRideEventRepository,
  MemoryRideRepository,
  type RideEntity,
} from '../src/modules/rides/index.js';
import { MemoryWalletRepository } from '../src/modules/ledger/index.js';
import { unitOfWork } from './helpers/unitOfWork.js';

async function fixture() {
  const now = new Date();
  const rideRepo = new MemoryRideRepository();
  const rideEventRepo = new MemoryRideEventRepository();
  const walletRepo = new MemoryWalletRepository();
  const ride: RideEntity = {
    id: 'ride',
    bookerRiderId: 'rider',
    driverId: 'driver',
    vehicleId: null,
    vehicleCategory: 'CAB',
    passenger: {
      riderId: 'passenger',
      name: 'Passenger',
      phoneE164: '+919876543210',
      pickupOtpHash: null,
    },
    pickup: { lat: 26.7, lng: 88.4, address: 'Sevoke Road' },
    drop: { lat: 26.8, lng: 88.5, address: 'Hill Cart Road' },
    routeSnapshot: {
      provider: 'TEST',
      distanceM: 2200,
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
    suggestedFarePaise: 10000,
    proposedFarePaise: 11000,
    agreedFarePaise: 12000,
    status: 'PAYMENT_PENDING',
    cancellationReason: null,
    offeringExpiresAt: null,
    acceptedAt: now,
    arrivedAt: now,
    startedAt: now,
    completedAt: now,
    settledAt: null,
    cancelledAt: null,
    version: 4,
    createdAt: now,
    updatedAt: now,
  };
  await rideRepo.save(ride);
  await walletRepo.save({
    id: 'wallet',
    driverId: 'driver',
    balancePaise: 10000,
    status: 'ACTIVE',
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  const gateway = {
    keyId: 'rzp_test_fixture',
    createOrder: vi.fn(async () => 'order_test'),
    verifySignature: vi.fn(),
    findCapturedPayment: vi.fn(async (): Promise<string | null> => null),
  };
  const deps = { rideRepo, rideEventRepo, unitOfWork, gateway };
  return {
    ...deps,
    ride,
    walletRepo,
    useCase: new RideUpiPaymentUseCase(deps),
    complete: new CompleteRideUseCase({ ...deps, walletRepo }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Ride UPI payment', () => {
  it('uses the agreed server fare and persists one reusable order across restarts', async () => {
    const f = await fixture();
    const checkout = await f.useCase.create('ride', 'rider');
    expect(checkout).toEqual({
      keyId: 'rzp_test_fixture',
      orderId: 'order_test',
      amountPaise: 12000,
      currency: 'INR',
      testMode: true,
    });
    expect(f.gateway.createOrder).toHaveBeenCalledWith(12000, 'ride');
    expect(await new RideUpiPaymentUseCase(f).create('ride', 'rider')).toEqual(checkout);
    expect(f.gateway.createOrder).toHaveBeenCalledTimes(1);
    expect((await f.rideRepo.findById('ride'))?.status).toBe('PAYMENT_PENDING');
  });

  it('denies a foreign rider, the passenger and a ride that has not completed', async () => {
    const f = await fixture();
    await expect(f.useCase.create('ride', 'other')).rejects.toThrow('booking customer');
    await expect(f.useCase.create('ride', 'passenger')).rejects.toThrow('booking customer');
    await expect(f.useCase.reconcile('ride', 'other')).rejects.toThrow('booking customer');
    await f.rideRepo.save({ ...f.ride, status: 'TRIP_STARTED' });
    await expect(f.useCase.create('ride', 'rider')).rejects.toThrow('not awaiting payment');
    expect(f.gateway.createOrder).not.toHaveBeenCalled();
  });

  it('does not settle an unconfirmed payment and blocks manual cash confirmation after UPI selection', async () => {
    const f = await fixture();
    await f.useCase.create('ride', 'rider');
    expect((await f.useCase.reconcile('ride', 'rider')).status).toBe('PAYMENT_PENDING');
    await expect(f.complete.confirmPayment({ rideId: 'ride', driverId: 'driver' })).rejects.toThrow(
      'online UPI',
    );
    expect((await f.walletRepo.findByDriverId('driver'))?.balancePaise).toBe(10000);
  });

  it('rejects another order or invalid proof without granting settlement', async () => {
    const f = await fixture();
    await f.useCase.create('ride', 'rider');
    await expect(
      f.useCase.reconcile('ride', 'rider', {
        orderId: 'order_other',
        paymentId: 'pay_test',
        signature: 'bad',
      }),
    ).rejects.toThrow('does not belong');
    f.gateway.verifySignature.mockImplementation(() => {
      throw new Error('invalid signature');
    });
    await expect(
      f.useCase.reconcile('ride', 'rider', {
        orderId: 'order_test',
        paymentId: 'pay_test',
        signature: 'bad',
      }),
    ).rejects.toThrow('invalid signature');
    expect(f.gateway.findCapturedPayment).not.toHaveBeenCalled();
  });

  it('recovers captured payments and records net payable exactly once without debiting the prepaid wallet', async () => {
    const f = await fixture();
    await f.useCase.create('ride', 'rider');
    f.gateway.findCapturedPayment.mockResolvedValue('pay_test');
    expect((await f.useCase.reconcile('ride', 'rider')).status).toBe('SETTLED');
    expect((await new RideUpiPaymentUseCase(f).reconcile('ride', 'rider')).status).toBe('SETTLED');
    const events = await f.rideEventRepo.findByRideId('ride');
    expect(events.filter((e) => e.eventType === 'DRIVER_PAYOUT_PENDING')).toHaveLength(1);
    expect(events.find((e) => e.eventType === 'PAYMENT_CONFIRMED')?.metadata).toMatchObject({
      farePaise: 12000,
      commissionPaise: 960,
      driverPayablePaise: 11040,
      mode: 'test',
    });
    expect((await f.walletRepo.findByDriverId('driver'))?.balancePaise).toBe(10000);
    expect(await f.walletRepo.findTransactionsByWalletId('wallet')).toHaveLength(0);
  });

  it('verifies callback payment id against the captured payment', async () => {
    const f = await fixture();
    await f.useCase.create('ride', 'rider');
    f.gateway.findCapturedPayment.mockResolvedValue('pay_captured');
    await expect(
      f.useCase.reconcile('ride', 'rider', {
        orderId: 'order_test',
        paymentId: 'pay_other',
        signature: 'valid',
      }),
    ).rejects.toThrow('does not match');
    expect((await f.rideRepo.findById('ride'))?.status).toBe('PAYMENT_PENDING');
  });
});

describe('Razorpay test gateway', () => {
  it('checks HMAC using the server order and rejects changed or malformed signatures', () => {
    const gateway = new RazorpayTestGateway('rzp_test_fixture', 'fixture-secret', true);
    const signature = createHmac('sha256', 'fixture-secret')
      .update('order_test|pay_test')
      .digest('hex');
    expect(() => gateway.verifySignature('order_test', 'pay_test', signature)).not.toThrow();
    expect(() => gateway.verifySignature('order_other', 'pay_test', signature)).toThrow('invalid');
    expect(() => gateway.verifySignature('order_test', 'pay_test', 'bad')).toThrow('invalid');
  });

  it.each([
    { amount: 11999 },
    { currency: 'USD' },
    { method: 'card' },
    { status: 'authorized' },
    { order_id: 'order_other' },
  ])('rejects a payment whose captured UPI details do not match: %j', async (override) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'pay_test',
                  order_id: 'order_test',
                  amount: 12000,
                  currency: 'INR',
                  method: 'upi',
                  status: 'captured',
                  ...override,
                },
              ],
            }),
          ),
      ),
    );
    expect(
      await new RazorpayTestGateway('rzp_test_fixture', 'secret', true).findCapturedPayment(
        'order_test',
        12000,
      ),
    ).toBeNull();
  });

  it('accepts a captured INR UPI payment with the exact order and amount', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'pay_test',
                  order_id: 'order_test',
                  amount: 12000,
                  currency: 'INR',
                  method: 'upi',
                  status: 'captured',
                },
              ],
            }),
          ),
      ),
    );
    expect(
      await new RazorpayTestGateway('rzp_test_fixture', 'secret', true).findCapturedPayment(
        'order_test',
        12000,
      ),
    ).toBe('pay_test');
  });

  it('refuses live keys and disabled checkout before any network request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      new RazorpayTestGateway('rzp_live_fixture', 'secret', true).createOrder(12000, 'ride'),
    ).rejects.toThrow('not configured');
    await expect(
      new RazorpayTestGateway('rzp_test_fixture', 'secret', false).createOrder(12000, 'ride'),
    ).rejects.toThrow('not configured');
    expect(fetch).not.toHaveBeenCalled();
  });
});
