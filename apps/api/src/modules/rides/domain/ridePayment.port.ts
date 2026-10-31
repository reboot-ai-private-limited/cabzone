import type { RideUpiIntentDto } from '@cabzone/contracts';
import type { RefundVerifierPort } from './refundVerifier.port.js';

export interface RidePaymentGateway {
  fetchRefund?: RefundVerifierPort['fetchRefund'];
  readonly keyId: string;
  readonly live: boolean;
  createQr(amountPaise: number, rideId: string): Promise<RideUpiIntentDto | null>;
  findQrPayment(qrId: string, amountPaise: number): Promise<string | null>;
  closeQrForCash(qrId: string): Promise<void>;
  createOrder(amountPaise: number, rideId: string): Promise<string>;
  verifySignature(orderId: string, paymentId: string, signature: string): void;
  findCapturedPayment(orderId: string, amountPaise: number): Promise<string | null>;
}
