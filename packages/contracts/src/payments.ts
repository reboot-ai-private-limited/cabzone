/**
 * Payment and External Provider Contracts
 */

export const PAYMENT_METHODS = ['UPI', 'CASH'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface RideUpiCheckoutDto {
  orderId: string;
  amountPaise: number;
  currency: 'INR';
  keyId: string;
  testMode: true;
}

export interface RideUpiIntentDto {
  kind: 'intent';
  qrId: string;
  upiUrl: string;
  imageDataUrl: string;
  amountPaise: number;
  expiresAt: string;
  testMode: false;
}

export type RideUpiSessionDto =
  { kind: 'checkout'; checkout: RideUpiCheckoutDto } | RideUpiIntentDto;

export const PAYMENT_STATUSES = [
  'CREATED',
  'PENDING',
  'CONFIRMED',
  'FAILED',
  'DISPUTED',
  'REFUNDED',
] as const;

export interface RidePaymentStateDto {
  paid: boolean;
  method: 'UPI' | 'CASH';
  testMode: boolean;
  requiresReview: boolean;
}
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface PaymentDto {
  id: string;
  rideId: string;
  payerRiderId: string;
  method: PaymentMethod;
  amountPaise: number;
  status: PaymentStatus;
  provider: string | null;
  providerPaymentId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentEventDto {
  id: string;
  paymentId: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  payloadHash: string;
  payload: Record<string, unknown>;
  processedAt: string | null;
  createdAt: string;
}
