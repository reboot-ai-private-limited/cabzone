import { createHmac } from 'node:crypto';
import type { RideUpiIntentDto } from '@cabzone/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RideUpiPaymentUseCase } from '../src/modules/rides/application/useCases/rideUpiPayment.usecase.js';
import { RazorpayGateway } from '../src/modules/rides/infrastructure/razorpay.adapter.js';
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
    live: false,
    closeQrForCash: vi.fn(async () => {}),
    createQr: vi.fn(async (): Promise<RideUpiIntentDto> => {
      throw new Error('Live mode is not configured.');
    }),
    findQrPayment: vi.fn(async (): Promise<string | null> => null),
    keyId: 'rzp_test_fixture',
    createOrder: vi.fn(async () => 'order_test'),
    verifySignature: vi.fn(),
    findCapturedPayment: vi.fn(async (): Promise<string | null> => null),
  };
  const deps = { rideRepo, rideEventRepo, unitOfWork, gateway, walletRepo };
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
  it('does not select cash if another request exposed a new live QR during the switch', async () => {
    const f = await fixture();
    let injectQr = true;
    const gateway = {
      ...f.gateway,
      live: true,
      createQr: vi.fn(async (): Promise<RideUpiIntentDto> => ({
        kind: 'intent',
        qrId: 'qr_race',
        upiUrl: 'upi://pay?pa=test',
        imageDataUrl: 'data:image/png;base64,test',
        amountPaise: 12000,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        testMode: false,
      })),
    };
    const payment = new RideUpiPaymentUseCase({
      ...f,
      gateway,
      unitOfWork: {
        run: async (work) => {
          if (injectQr) {
            injectQr = false;
            await payment.session('ride', 'rider');
          }
          return unitOfWork.run(work);
        },
      },
    });
    await expect(payment.switchToCash('ride', { role: 'RIDER', id: 'rider' })).rejects.toThrow(
      'Payment options changed',
    );
    expect((await payment.paymentState('ride')).method).toBe('UPI');
    expect(gateway.closeQrForCash).not.toHaveBeenCalled();
  });
  it('switches test checkout to cash without settling, revokes checkout, and requires driver confirmation', async () => {
    const f = await fixture();
    await f.useCase.create('ride', 'rider');
    await expect(
      f.useCase.switchToCash('ride', { role: 'RIDER', id: 'foreign' }),
    ).rejects.toThrow();
    expect(await f.useCase.switchToCash('ride', { role: 'RIDER', id: 'rider' })).toMatchObject({
      paid: false,
      method: 'CASH',
      testMode: true,
    });
    expect((await f.rideRepo.findById('ride'))?.status).toBe('PAYMENT_PENDING');
    await expect(f.useCase.session('ride', 'rider')).rejects.toThrow('cash');
    await f.useCase.switchToCash('ride', { role: 'DRIVER', id: 'driver' });
    expect(
      (await f.rideEventRepo.findByRideId('ride')).filter(
        (e) => e.eventType === 'PAYMENT_METHOD_CHANGED',
      ),
    ).toHaveLength(1);
    expect(
      (await f.complete.confirmPayment({ rideId: 'ride', driverId: 'driver' })).ride.status,
    ).toBe('SETTLED');
    expect(
      (await f.rideEventRepo.findByRideId('ride')).find((e) => e.eventType === 'PAYMENT_CONFIRMED')
        ?.metadata.method,
    ).toBe('CASH');
  });

  it('reconciles a completed UPI payment instead of switching to cash', async () => {
    const f = await fixture();
    await f.useCase.create('ride', 'rider');
    f.gateway.findCapturedPayment.mockResolvedValue('pay_test');
    expect(await f.useCase.switchToCash('ride', { role: 'DRIVER', id: 'driver' })).toMatchObject({
      paid: true,
      method: 'UPI',
    });
    expect(
      (await f.rideEventRepo.findByRideId('ride')).some(
        (e) => e.eventType === 'PAYMENT_METHOD_CHANGED',
      ),
    ).toBe(false);
  });

  it('rechecks online capture before the driver confirms cash and does not debit commission twice', async () => {
    const f = await fixture();
    await f.useCase.create('ride', 'rider');
    await f.useCase.switchToCash('ride', { role: 'RIDER', id: 'rider' });
    f.gateway.findCapturedPayment.mockResolvedValue('pay_late');
    const complete = new CompleteRideUseCase({
      ...f,
      prepareCashConfirmation: (id, driver) => f.useCase.prepareCashConfirmation(id, driver),
    });
    expect(
      (await complete.confirmPayment({ rideId: 'ride', driverId: 'driver' })).ride.status,
    ).toBe('SETTLED');
    expect((await f.useCase.paymentState('ride')).method).toBe('UPI');
    expect((await f.useCase.reconcile('ride', 'rider')).status).toBe('SETTLED');
    expect(await f.walletRepo.findTransactionsByWalletId('wallet')).toEqual([
      expect.objectContaining({ type: 'CREDIT', bucket: 'EARNINGS', amountPaise: 11040 }),
    ]);
  });

  it('flags a late UPI capture after confirmed cash for review without another payable', async () => {
    const f = await fixture();
    await f.useCase.create('ride', 'rider');
    await f.useCase.switchToCash('ride', { role: 'RIDER', id: 'rider' });
    await f.complete.confirmPayment({ rideId: 'ride', driverId: 'driver' });
    f.gateway.findCapturedPayment.mockResolvedValue('pay_late');
    expect((await f.useCase.reconcile('ride', 'rider')).status).toBe('PAYMENT_DISPUTED');
    await f.useCase.reconcile('ride', 'rider');
    const events = await f.rideEventRepo.findByRideId('ride');
    expect(events.filter((event) => event.eventType === 'PAYMENT_DISPUTED')).toHaveLength(1);
    expect(events.filter((event) => event.eventType === 'DRIVER_PAYOUT_PENDING')).toHaveLength(0);
    expect(await f.useCase.paymentState('ride')).toMatchObject({
      paid: false,
      requiresReview: true,
    });
  });

  it('keeps UPI selected if the live provider cannot close its QR for cash', async () => {
    const f = await fixture();
    const gateway = {
      ...f.gateway,
      live: true,
      createQr: vi.fn(async () => ({
        kind: 'intent' as const,
        qrId: 'qr_shared',
        upiUrl: 'upi://pay?pa=test',
        imageDataUrl: 'data:image/png;base64,test',
        amountPaise: 12000,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        testMode: false as const,
      })),
    };
    const payment = new RideUpiPaymentUseCase({ ...f, gateway });
    await payment.session('ride', 'rider');
    gateway.closeQrForCash.mockRejectedValueOnce(new Error('Payment is processing'));
    await expect(payment.switchToCash('ride', { role: 'RIDER', id: 'rider' })).rejects.toThrow(
      'processing',
    );
    expect(await payment.paymentState('ride')).toMatchObject({ method: 'UPI', paid: false });
    await payment.switchToCash('ride', { role: 'RIDER', id: 'rider' });
    expect(gateway.closeQrForCash).toHaveBeenCalledWith('qr_shared');
    expect(await payment.paymentState('ride')).toMatchObject({ method: 'CASH', paid: false });
  });
  it('shares one live QR session and verifies payment against that QR before settling', async () => {
    const f = await fixture();
    const session = {
      kind: 'intent' as const,
      qrId: 'qr_shared',
      upiUrl: 'upi://pay?pa=merchant%40bank&am=120.00&cu=INR&tr=shared',
      imageDataUrl: 'data:image/png;base64,test',
      amountPaise: 12000,
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
      testMode: false as const,
    };
    const gateway = {
      ...f.gateway,
      live: true,
      createQr: vi.fn(async () => session),
      findQrPayment: vi.fn(async (): Promise<string | null> => null),
    };
    const payment = new RideUpiPaymentUseCase({ ...f, gateway });
    expect(await payment.session('ride', 'rider')).toEqual(session);
    expect(await payment.session('ride', 'rider')).toEqual(session);
    expect(gateway.createQr).toHaveBeenCalledTimes(1);
    expect(f.gateway.createOrder).not.toHaveBeenCalled();
    expect((await payment.reconcile('ride', 'rider')).status).toBe('PAYMENT_PENDING');
    await expect(f.complete.confirmPayment({ rideId: 'ride', driverId: 'driver' })).rejects.toThrow(
      'verified',
    );
    gateway.findQrPayment.mockResolvedValue('pay_live');
    expect((await payment.reconcile('ride', 'rider')).status).toBe('SETTLED');
    expect(gateway.findQrPayment).toHaveBeenCalledWith('qr_shared', 12000);
    await payment.reconcile('ride', 'rider');
    const events = await f.rideEventRepo.findByRideId('ride');
    expect(events.filter((e) => e.eventType === 'PAYMENT_CONFIRMED')).toHaveLength(1);
    expect(events.find((e) => e.eventType === 'PAYMENT_CONFIRMED')?.metadata).toMatchObject({
      mode: 'live',
      qrId: 'qr_shared',
    });
  });

  it('does not replace an expired QR with another payable session', async () => {
    const f = await fixture();
    const gateway = {
      ...f.gateway,
      live: true,
      createQr: vi.fn(async () => ({
        kind: 'intent' as const,
        qrId: 'qr_old',
        upiUrl: 'upi://pay?pa=test',
        imageDataUrl: 'data:image/png;base64,test',
        amountPaise: 12000,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        testMode: false as const,
      })),
    };
    const payment = new RideUpiPaymentUseCase({ ...f, gateway });
    await expect(payment.session('ride', 'passenger')).rejects.toThrow('booking customer');
    await expect(payment.session('ride', 'rider')).rejects.toThrow('expired');
    await expect(payment.session('ride', 'rider')).rejects.toThrow('expired');
    expect(gateway.createQr).toHaveBeenCalledTimes(1);
  });
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
    expect((await f.walletRepo.findByDriverId('driver'))?.earningsBalancePaise).toBe(11040);
    expect(await f.walletRepo.findTransactionsByWalletId('wallet')).toEqual([
      expect.objectContaining({ type: 'CREDIT', bucket: 'EARNINGS', amountPaise: 11040 }),
    ]);
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
  it('closes an active QR before allowing cash and rejects in-flight payments', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'active' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'closed' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })));
    vi.stubGlobal('fetch', fetch);
    const gateway = new RazorpayGateway('rzp_live_fixture', 'secret', true, 'live');
    await gateway.closeQrForCash('qr_shared');
    expect(fetch.mock.calls[1]![0]).toBe(
      'https://api.razorpay.com/v1/payments/qr_codes/qr_shared/close',
    );
    fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'closed' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ status: 'authorized' }] })));
    await expect(gateway.closeQrForCash('qr_shared')).rejects.toThrow('processing');
  });
  it('creates a fixed-fare single-use live QR and preserves the provider intent', async () => {
    const upi = 'upi://pay?pa=merchant%40bank&am=120.00&cu=INR&tr=shared';
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'qr_shared',
            image_content: upi,
            close_by: Math.floor(Date.now() / 1000) + 1800,
            payment_amount: 12000,
            fixed_amount: true,
            usage: 'single_use',
          }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const session = await new RazorpayGateway('rzp_live_fixture', 'secret', true, 'live').createQr(
      12000,
      'ride',
    );
    expect(session.upiUrl).toBe(upi);
    expect(session.imageDataUrl).toMatch(/^data:image\/png/);
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toMatchObject({
      usage: 'single_use',
      payment_amount: 12000,
      notes: { rideId: 'ride' },
    });
  });

  it.each([
    { amount: 11999 },
    { currency: 'USD' },
    { method: 'card' },
    { status: 'authorized' },
    { amount_refunded: 1 },
  ])('does not settle a QR payment with mismatched or refunded details: %j', async (override) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'pay_shared',
                  order_id: null,
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
      await new RazorpayGateway('rzp_live_fixture', 'secret', true, 'live').findQrPayment(
        'qr_shared',
        12000,
      ),
    ).toBeNull();
  });

  it('accepts only captured payments returned for the saved QR', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'pay_shared',
                order_id: null,
                amount: 12000,
                currency: 'INR',
                method: 'upi',
                status: 'captured',
              },
            ],
          }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    expect(
      await new RazorpayGateway('rzp_live_fixture', 'secret', true, 'live').findQrPayment(
        'qr_shared',
        12000,
      ),
    ).toBe('pay_shared');
    expect(fetch.mock.calls[0]![0]).toBe(
      'https://api.razorpay.com/v1/payments/qr_codes/qr_shared/payments',
    );
  });
  it('checks HMAC using the server order and rejects changed or malformed signatures', () => {
    const gateway = new RazorpayGateway('rzp_test_fixture', 'fixture-secret', true);
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
      await new RazorpayGateway('rzp_test_fixture', 'secret', true).findCapturedPayment(
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
      await new RazorpayGateway('rzp_test_fixture', 'secret', true).findCapturedPayment(
        'order_test',
        12000,
      ),
    ).toBe('pay_test');
  });

  it('refuses live keys and disabled checkout before any network request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      new RazorpayGateway('rzp_live_fixture', 'secret', true).createOrder(12000, 'ride'),
    ).rejects.toThrow('not configured');
    await expect(
      new RazorpayGateway('rzp_test_fixture', 'secret', false).createOrder(12000, 'ride'),
    ).rejects.toThrow('not configured');
    expect(fetch).not.toHaveBeenCalled();
  });
});
