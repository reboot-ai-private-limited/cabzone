import { createHmac } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import QRCode from 'qrcode';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';
import type { RidePaymentQrPort } from '../domain/ridePaymentQr.port.js';

export class RidePaymentQrAdapter implements RidePaymentQrPort {
  private readonly key: Uint8Array;
  constructor(secret: string) {
    this.key = createHmac('sha256', secret).update('cabzone-ride-checkout-ticket').digest();
  }

  async issue(rideId: string, orderId: string, origin: string) {
    const expires = Math.floor(Date.now() / 1000) + 30 * 60;
    const ticket = await new SignJWT({ rideId, orderId })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('ride-checkout')
      .setIssuedAt()
      .setExpirationTime(expires)
      .sign(this.key);
    const url = `${new URL(origin).origin}/api/v1/rides/payment/upi/checkout#${ticket}`;
    return {
      imageDataUrl: await QRCode.toDataURL(url, {
        width: 360,
        margin: 4,
        errorCorrectionLevel: 'M',
      }),
      expiresAt: new Date(expires * 1000).toISOString(),
    };
  }

  async read(ticket: string) {
    try {
      const { payload } = await jwtVerify(ticket, this.key, {
        algorithms: ['HS256'],
        audience: 'ride-checkout',
      });
      return z
        .object({ rideId: z.string().min(1), orderId: z.string().regex(/^order_[a-zA-Z0-9]+$/) })
        .parse(payload);
    } catch {
      throw AppError.badRequest(
        'This payment QR has expired or is invalid. Ask the driver to refresh it.',
      );
    }
  }
}
