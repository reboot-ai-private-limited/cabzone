import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';
import type { RidePaymentGateway } from '../domain/ridePayment.port.js';

const paymentSchema = z.object({
  id: z.string().regex(/^pay_[a-zA-Z0-9]+$/),
  order_id: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  method: z.string(),
  status: z.string(),
});

export class RazorpayTestGateway implements RidePaymentGateway {
  constructor(
    readonly keyId: string,
    private readonly secret: string,
    private readonly enabled: boolean,
  ) {}

  private async api(path: string, body?: object): Promise<unknown> {
    if (!this.enabled || !this.keyId.startsWith('rzp_test_') || !this.secret) {
      throw AppError.badRequest('Test UPI checkout is not configured on the server.');
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

  async createOrder(amountPaise: number, rideId: string): Promise<string> {
    const result = z
      .object({ id: z.string().regex(/^order_[a-zA-Z0-9]+$/) })
      .parse(
        await this.api('orders', {
          amount: amountPaise,
          currency: 'INR',
          receipt: rideId,
          notes: { rideId, purpose: 'ride_fare_test' },
        }),
      );
    return result.id;
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
          p.status === 'captured',
      )?.id ?? null
    );
  }
}
