import { createHmac } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { makeRideUpiWebhook } from '../src/modules/rides/interface/rideUpiWebhook.controller.js';
import { shouldCaptureRawBody } from '../src/shared/http/rawBody.js';

describe('Ride UPI webhook boundary', () => {
  const secret = 'fixture-only-webhook-secret';
  const rideId = '018f0a00-0000-7000-8000-000000000001';
  function app() {
    const reconcileQrWebhook = vi.fn(async () => ({ id: rideId, status: 'SETTLED' }));
    const rideUpdated = vi.fn(async () => {});
    const server = express();
    server.use(
      express.json({
        verify: (req, _res, body) => {
          (req as express.Request).rawBody = body.toString('utf8');
        },
      }),
    );
    server.post(
      '/webhook',
      makeRideUpiWebhook(
        { reconcileQrWebhook } as unknown as Parameters<typeof makeRideUpiWebhook>[0],
        { notifier: { rideUpdated } } as unknown as Parameters<typeof makeRideUpiWebhook>[1],
        secret,
      ),
    );
    server.use(
      (error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(403).json({ message: error.message });
      },
    );
    return { server, reconcileQrWebhook, rideUpdated };
  }
  const body = JSON.stringify({
    event: 'qr_code.credited',
    payload: { qr_code: { entity: { id: 'qr_shared', notes: { rideId } } } },
  });
  const sign = (raw: string) => createHmac('sha256', secret).update(raw).digest('hex');

  it('captures the exact raw webhook payload without capturing unrelated ride requests', () => {
    expect(shouldCaptureRawBody('/api/v1/rides/payment/upi/webhook')).toBe(true);
    expect(shouldCaptureRawBody('/api/v1/rides/payment/upi/checkout')).toBe(false);
  });

  it('rejects missing or forged signatures before accessing ride payments', async () => {
    const f = app();
    for (const signature of ['', 'bad', 'a'.repeat(64)]) {
      expect(
        (
          await request(f.server)
            .post('/webhook')
            .type('json')
            .set('x-razorpay-signature', signature)
            .send(body)
        ).status,
      ).toBe(403);
    }
    expect(f.reconcileQrWebhook).not.toHaveBeenCalled();
  });

  it('uses a signed event only to trigger authoritative provider reconciliation', async () => {
    const f = app();
    const response = await request(f.server)
      .post('/webhook')
      .type('json')
      .set('x-razorpay-signature', sign(body))
      .send(body);
    expect(response.status).toBe(200);
    expect(f.reconcileQrWebhook).toHaveBeenCalledWith(rideId, 'qr_shared');
    expect(f.rideUpdated).toHaveBeenCalledTimes(1);
  });

  it('rejects tampered payloads and acknowledges irrelevant signed events', async () => {
    const f = app();
    expect(
      (
        await request(f.server)
          .post('/webhook')
          .type('json')
          .set('x-razorpay-signature', sign(body))
          .send(body.replace('qr_shared', 'qr_other'))
      ).status,
    ).toBe(403);
    const ignored = JSON.stringify({ event: 'qr_code.created' });
    expect(
      (
        await request(f.server)
          .post('/webhook')
          .type('json')
          .set('x-razorpay-signature', sign(ignored))
          .send(ignored)
      ).status,
    ).toBe(200);
    expect(f.reconcileQrWebhook).not.toHaveBeenCalled();
  });

  it('requests webhook retry when the provider has not confirmed capture yet', async () => {
    const f = app();
    f.reconcileQrWebhook.mockResolvedValue({ id: rideId, status: 'PAYMENT_PENDING' });
    const response = await request(f.server)
      .post('/webhook')
      .type('json')
      .set('x-razorpay-signature', sign(body))
      .send(body);
    expect(response.status).not.toBe(200);
    expect(f.rideUpdated).not.toHaveBeenCalled();
  });
});
