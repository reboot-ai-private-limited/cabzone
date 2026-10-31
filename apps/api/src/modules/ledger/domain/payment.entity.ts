import type { PaymentChannel, PaymentMethod, PaymentStatus } from '@cabzone/contracts';

export interface PaymentQrSnapshot {
  upiUri: string | null;
  imageUrl: string | null;
  expiresAt: Date;
}

export interface PaymentEntity {
  id: string;
  rideId: string;
  payerRiderId: string;
  method: PaymentMethod;
  channel: PaymentChannel;
  amountPaise: number;
  attempt: number;
  idempotencyKey: string;
  status: PaymentStatus;
  provider: string | null;
  gatewayRef: string | null;
  providerPaymentId: string | null;
  qr: PaymentQrSnapshot | null;
  metadata: Record<string, unknown>;
  lastPolledAt: Date | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function isPaymentSettled(payment: PaymentEntity): boolean {
  return payment.status === 'CONFIRMED' || payment.status === 'CAPTURED';
}
