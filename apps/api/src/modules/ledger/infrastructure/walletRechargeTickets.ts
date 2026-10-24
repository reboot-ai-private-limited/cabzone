import { createHmac } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';

export class WalletRechargeTickets {
  private readonly key: Uint8Array;
  constructor(secret: string) {
    this.key = createHmac('sha256', secret).update('wallet-recharge-only-ticket').digest();
  }
  async issue(operationId: string, driverId: string) {
    return new SignJWT({ operationId, driverId })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('wallet-recharge')
      .setIssuedAt()
      .setExpirationTime('30m')
      .sign(this.key);
  }
  async read(ticket: string) {
    try {
      const result = await jwtVerify(ticket, this.key, {
        algorithms: ['HS256'],
        audience: 'wallet-recharge',
      });
      return z
        .object({ operationId: z.string().uuid(), driverId: z.string().min(1) })
        .parse(result.payload);
    } catch {
      throw AppError.badRequest(
        'Recharge link expired or invalid. Reopen the recharge from your wallet.',
      );
    }
  }
}
