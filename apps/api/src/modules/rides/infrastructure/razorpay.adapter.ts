import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import QRCode from 'qrcode';
import type { RideUpiIntentDto } from '@cabzone/contracts';
import { AppError } from '../../../shared/errors/AppError.js';
import type { RidePaymentGateway } from '../domain/ridePayment.port.js';

const paymentSchema = z.object({
  id: z.string().regex(/^pay_[a-zA-Z0-9]+$/),
  order_id: z.string().nullable(),
  amount: z.number().int(),
  currency: z.string(),
  method: z.string(),
  status: z.string(),
  amount_refunded: z.number().int().nonnegative().default(0),
});

export class RazorpayGateway implements RidePaymentGateway {
  constructor(
    readonly keyId: string,
    private readonly secret: string,
    private readonly enabled: boolean,
    private readonly mode: 'test' | 'live' = 'test',
  ) {}

  get live() {
    return this.mode === 'live';
  }

  private async api(path: string, body?: object): Promise<unknown> {
    if (!this.enabled || !this.keyId.startsWith(`rzp_${this.mode}_`) || !this.secret) {
      throw AppError.badRequest('UPI checkout is not configured on the server.');
    }
    let response: Response;
    try {
      response = await fetch(`https://api.razorpay.com/v1/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.secret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw AppError.badRequest(
        'Razorpay is unavailable. Please check payment status before retrying.',
      );
    }
    if (!response.ok)
      throw AppError.badRequest('Razorpay could not process this request. Please try again.');
    return response.json();
  }

  async createOrder(amountPaise: number, rideId: string, purpose = 'ride_fare_test'): Promise<string> {
    if (this.live) throw AppError.badRequest('Use the ride UPI session to pay.');
    const result = z.object({ id: z.string().regex(/^order_[a-zA-Z0-9]+$/) }).parse(
      await this.api('orders', {
        amount: amountPaise,
        currency: 'INR',
        receipt: rideId,
        notes: { rideId, purpose },
      }),
    );
    return result.id;
  }

  async createQr(amountPaise: number, rideId: string): Promise<RideUpiIntentDto> {
    if (!this.live) throw AppError.badRequest('UPI app payments require live mode.');
    const qr = z
      .object({
        id: z.string().regex(/^qr_[a-zA-Z0-9]+$/),
        image_content: z.string().max(4096),
        close_by: z.number().int(),
        payment_amount: z.literal(amountPaise),
        fixed_amount: z.literal(true),
        usage: z.literal('single_use'),
      })
      .parse(
        await this.api('payments/qr_codes', {
          type: 'upi_qr',
          name: 'Cabzone ride',
          usage: 'single_use',
          fixed_amount: true,
          payment_amount: amountPaise,
          close_by: Math.floor(Date.now() / 1000) + 30 * 60,
          notes: { rideId },
        }),
      );
    const url = new URL(qr.image_content);
    if (
      url.protocol !== 'upi:' ||
      url.hostname !== 'pay' ||
      url.searchParams.get('am') !== (amountPaise / 100).toFixed(2) ||
      url.searchParams.get('cu') !== 'INR' ||
      !url.searchParams.get('pa') ||
      !url.searchParams.get('tr')
    )
      throw AppError.badRequest('Provider returned an invalid UPI payment link.');
    return {
      kind: 'intent',
      qrId: qr.id,
      upiUrl: qr.image_content,
      amountPaise,
      imageDataUrl: await QRCode.toDataURL(qr.image_content, { width: 360, margin: 4 }),
      expiresAt: new Date(qr.close_by * 1000).toISOString(),
      testMode: false,
    };
  }

  async findQrPayment(qrId: string, amountPaise: number): Promise<string | null> {
    const { items } = z
      .object({ items: z.array(paymentSchema) })
      .parse(await this.api(`payments/qr_codes/${encodeURIComponent(qrId)}/payments`));
    return (
      items.find(
        (p) =>
          p.amount === amountPaise &&
          p.currency === 'INR' &&
          p.method === 'upi' &&
          p.status === 'captured' &&
          p.amount_refunded === 0,
      )?.id ?? null
    );
  }

  async closeQrForCash(qrId: string): Promise<void> {
    const path = `payments/qr_codes/${encodeURIComponent(qrId)}`;
    let qr = z.object({ status: z.enum(['active', 'closed']) }).parse(await this.api(path));
    if (qr.status === 'active')
      qr = z
        .object({ status: z.enum(['active', 'closed']) })
        .parse(await this.api(`${path}/close`, {}));
    if (qr.status !== 'closed')
      throw AppError.conflict('The payment QR could not be closed. Please retry.');
    const payments = z
      .object({ items: z.array(z.object({ status: z.string() })) })
      .parse(await this.api(`${path}/payments`));
    if (payments.items.some((p) => p.status !== 'failed' && p.status !== 'refunded'))
      throw AppError.conflict(
        'A UPI payment is processing or already received. Check payment status before collecting cash.',
      );
  }

  verifySignature(orderId: string, paymentId: string, signature: string): void {
    const expected = createHmac('sha256', this.secret).update(`${orderId}|${paymentId}`).digest();
    const supplied = Buffer.from(signature, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
      throw AppError.badRequest('Payment signature is invalid.');
    }
  }

  async findCapturedPayment(orderId: string, amountPaise: number): Promise<string | null> {
    const { items } = z
      .object({ items: z.array(paymentSchema) })
      .parse(await this.api(`orders/${encodeURIComponent(orderId)}/payments`));
    return (
      items.find(
        (p) =>
          p.order_id === orderId &&
          p.amount === amountPaise &&
          p.currency === 'INR' &&
          p.method === 'upi' &&
          p.amount_refunded === 0 &&
          p.status === 'captured',
      )?.id ?? null
    );
  }
}
