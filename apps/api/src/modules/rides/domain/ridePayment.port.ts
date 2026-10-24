import type { RideUpiIntentDto } from '@cabzone/contracts';

export interface RidePaymentGateway {
  readonly keyId: string;
  readonly live: boolean;
  createQr(amountPaise: number, rideId: string): Promise<RideUpiIntentDto>;
  findQrPayment(qrId: string, amountPaise: number): Promise<string | null>;
  closeQrForCash(qrId: string): Promise<void>;
  createOrder(amountPaise: number, rideId: string): Promise<string>;
  verifySignature(orderId: string, paymentId: string, signature: string): void;
  findCapturedPayment(orderId: string, amountPaise: number): Promise<string | null>;
}
