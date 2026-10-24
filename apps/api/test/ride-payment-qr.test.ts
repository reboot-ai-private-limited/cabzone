import express from 'express';
import request from 'supertest';
import QRCode from 'qrcode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RidePaymentQrAdapter } from '../src/modules/rides/infrastructure/ridePaymentQr.adapter.js';
import { makeRidePaymentQrControllers } from '../src/modules/rides/interface/ridePaymentQr.controller.js';
import { rideCheckoutHtml } from '../src/modules/rides/interface/rideCheckout.html.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Payment-only QR tickets', () => {
  it('encodes a browser checkout link and reuses the exact ride order', async () => {
    const encode = vi.spyOn(QRCode, 'toDataURL').mockResolvedValue('data:image/png;base64,test');
    const service = new RidePaymentQrAdapter('fixture-secret');
    const result = await service.issue('ride', 'order_existing', 'https://api.example.com');
    const url = new URL(encode.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/api/v1/rides/payment/upi/checkout');
    expect(url.search).toBe('');
    expect(await service.read(url.hash.slice(1))).toEqual({
      rideId: 'ride',
      orderId: 'order_existing',
    });
    expect(result.imageDataUrl).toMatch(/^data:image\/png/);
    await expect(new RidePaymentQrAdapter('other-secret').read(url.hash.slice(1))).rejects.toThrow(
      'invalid',
    );
    await expect(service.read(url.hash.slice(1) + 'tampered')).rejects.toThrow('invalid');
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31 * 60_000);
    await expect(service.read(url.hash.slice(1))).rejects.toThrow('expired');
  });

  it('renders a real PNG without exposing an account access token', async () => {
    const result = await new RidePaymentQrAdapter('fixture-secret').issue(
      'ride',
      'order_existing',
      'http://192.168.1.5:4000',
    );
    expect(
      Buffer.from(result.imageDataUrl.split(',')[1]!, 'base64').subarray(1, 4).toString(),
    ).toBe('PNG');
  });

  it('serves a payment page with UPI-only checkout and no manual paid override', () => {
    const html = rideCheckoutHtml('nonce-test');
    expect(html).toContain('nonce="nonce-test"');
    expect(html).toContain('show_default_blocks:false');
    expect(html).toContain('razorpay_signature');
    expect(html).toContain("call(proof?'verify':'status'");
    expect(html).toContain('location.hash.slice(1)');
  });
});

describe('QR HTTP boundaries', () => {
  const rideId = '018f0a00-0000-7000-8000-000000000001';
  function app() {
    const ride = {
      id: rideId,
      driverId: 'assigned',
      bookerRiderId: 'booker',
      status: 'PAYMENT_PENDING',
    };
    const payment = {
      live: false,
      paymentState: vi.fn(async () => ({ paid: false, method: 'UPI', testMode: true })),
      session: vi.fn(async () => ({
        kind: 'intent',
        imageDataUrl: 'data:image/png;base64,live',
        amountPaise: 16500,
        expiresAt: new Date(Date.now() + 1800000).toISOString(),
      })),
      reconcile: vi.fn(async () => ride),
      create: vi.fn(async () => ({
        orderId: 'order_existing',
        amountPaise: 16500,
        keyId: 'rzp_test_fixture',
        currency: 'INR',
        testMode: true,
      })),
    };
    const qr = {
      read: vi.fn(async (ticket: string) => {
        if (ticket !== 'valid') throw new Error('Invalid ticket');
        return { rideId, orderId: 'order_existing' };
      }),
      issue: vi.fn(async () => ({
        imageDataUrl: 'data:image/png;base64,test',
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      })),
    };
    const handlers = makeRidePaymentQrControllers({
      rideRepo: { findById: async () => ride },
      payment,
      qr,
      actors: { resolveDriverId: async (id: string) => id, resolveRiderId: async () => 'booker' },
    } as unknown as Parameters<typeof makeRidePaymentQrControllers>[0]);
    const server = express();
    server.use(express.json());
    server.use((req, _res, next) => {
      req.auth = {
        userId: req.get('x-driver') ?? 'assigned',
        role: 'DRIVER',
        sessionId: 'session',
      };
      next();
    });
    server.post('/:id/qr', handlers.driverQr);
    server.post('/session', handlers.session);
    server.post('/verify', handlers.verify);
    server.get('/page', handlers.page);
    server.use(
      (error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(400).json({ message: error.message });
      },
    );
    return { server, payment, qr };
  }

  it('lets the assigned driver display the existing order without exposing secret credentials', async () => {
    const f = app();
    const response = await request(f.server).post(`/${rideId}/qr`);
    expect(response.status).toBe(200);
    expect(response.body.data.imageDataUrl).toMatch(/^data:image\/png/);
    expect(f.payment.create).toHaveBeenCalledWith(rideId, 'booker');
    expect(f.qr.issue.mock.calls[0]![1]).toBe('order_existing');
    expect(response.body.data.keyId).toBeUndefined();
  });

  it('denies foreign drivers and invalid tickets before touching payments', async () => {
    const f = app();
    expect((await request(f.server).post(`/${rideId}/qr`).set('x-driver', 'foreign')).status).toBe(
      400,
    );
    expect(f.payment.create).not.toHaveBeenCalled();
    expect((await request(f.server).post('/session').send({ ticket: 'forged' })).status).toBe(400);
    expect(f.payment.reconcile).not.toHaveBeenCalled();
  });

  it('shows the same live UPI session to the assigned driver without issuing a browser ticket', async () => {
    const f = app();
    f.payment.live = true;
    const response = await request(f.server).post(`/${rideId}/qr`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      testMode: false,
      amountPaise: 16500,
      imageDataUrl: 'data:image/png;base64,live',
    });
    expect(f.payment.session).toHaveBeenCalledWith(rideId, 'booker');
    expect(f.payment.create).not.toHaveBeenCalled();
    expect(f.qr.issue).not.toHaveBeenCalled();
  });

  it('stops issuing QR images and rejects old browser checkout after cash selection', async () => {
    const f = app();
    f.payment.paymentState.mockResolvedValue({ paid: false, method: 'CASH', testMode: true });
    const driver = await request(f.server).post(`/${rideId}/qr`);
    expect(driver.body.data.method).toBe('CASH');
    expect(driver.body.data.imageDataUrl).toBeUndefined();
    expect((await request(f.server).post('/session').send({ ticket: 'valid' })).status).toBe(400);
    expect(f.payment.create).not.toHaveBeenCalled();
    expect(f.qr.issue).not.toHaveBeenCalled();
  });

  it('rejects a payment proof for another order and sets a scoped checkout CSP', async () => {
    const f = app();
    const response = await request(f.server)
      .post('/verify')
      .send({
        ticket: 'valid',
        orderId: 'order_other',
        paymentId: 'pay_test',
        signature: 'a'.repeat(64),
      });
    expect(response.status).toBe(400);
    expect(f.payment.reconcile).not.toHaveBeenCalled();
    const page = await request(f.server).get('/page');
    expect(page.status).toBe(200);
    expect(page.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(page.headers['cache-control']).toBe('no-store');
  });
});
