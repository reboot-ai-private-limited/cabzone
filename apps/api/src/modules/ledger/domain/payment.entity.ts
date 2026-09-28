import type { PaymentMethod, PaymentStatus } from '@Cabzone/contracts';

export interface PaymentEntity {
  id: string;
  rideId: string;
  payerRiderId: string;
  method: PaymentMethod;
  amountPaise: number;
  status: PaymentStatus;
  provider: string | null;
  providerPaymentId: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function isPaymentSettled(payment: PaymentEntity): boolean {
  return payment.status === 'CONFIRMED';
}
