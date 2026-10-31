/**
 * Payment and External Provider Contracts
 */

import type { RideDto } from './rides.js';

export const PAYMENT_METHODS = ['UPI', 'CASH'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_CHANNELS = ['QR', 'CHECKOUT', 'CASH'] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export const QR_PAYMENT_CLIENT_STATES = ['NONE', 'PENDING', 'PAID', 'EXPIRED'] as const;
export type QrPaymentClientState = (typeof QR_PAYMENT_CLIENT_STATES)[number];

export interface RidePaymentQrLineDto {
  label: string;
  amountPaise: number;
}

export interface RidePaymentQrViewDto {
  state: QrPaymentClientState;
  upiUri: string | null;
  imageUrl: string | null;
  expiresAt: string | null;
  amountPaise: number;
  lines: RidePaymentQrLineDto[];
}

export interface RidePaymentQrResponseDto {
  ride: RideDto;
  qr: RidePaymentQrViewDto;
}

export interface RideUpiCheckoutDto {
  orderId: string;
  amountPaise: number;
  currency: 'INR';
  keyId: string;
  testMode: boolean;
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
  'CAPTURED',
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
  cashClaimedByRider?: boolean;
  unpaidReportedByDriver?: boolean;
}
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface PaymentDto {
  id: string;
  rideId: string;
  payerRiderId: string;
  method: PaymentMethod;
  channel?: PaymentChannel;
  amountPaise: number;
  status: PaymentStatus;
  provider: string | null;
  gatewayRef?: string | null;
  providerPaymentId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentEventDto {
  id: string;
  paymentId: string | null;
  provider: string;
  providerEventId: string;
  eventType: string;
  payloadHash: string;
  payload: Record<string, unknown>;
  processedAt: string | null;
  createdAt: string;
}
