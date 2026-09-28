import { z } from 'zod';
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  TRANSACTION_REFERENCE_TYPES,
  WALLET_STATUSES,
  WALLET_TRANSACTION_TYPES,
} from '@Cabzone/contracts';

export const rechargeWalletSchema = z.object({
  driverId: z.string().uuid('Invalid driverId UUID'),
  amountPaise: z
    .number()
    .int()
    .min(10000, 'Minimum wallet recharge is Rs. 100 (10000 paise)')
    .max(10000000, 'Maximum single recharge is Rs. 1,00,000 (10000000 paise)'),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const adminAdjustWalletSchema = z.object({
  driverId: z.string().uuid('Invalid driverId UUID'),
  amountPaise: z.number().int().positive('Amount must be positive'),
  type: z.enum(['CREDIT', 'DEBIT'] as const),
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(255),
});

export const recordPaymentSchema = z.object({
  rideId: z.string().uuid('Invalid rideId UUID'),
  payerRiderId: z.string().uuid('Invalid payerRiderId UUID'),
  method: z.enum(PAYMENT_METHODS),
  amountPaise: z.number().int().positive('Amount must be positive'),
  provider: z.string().trim().max(50).nullable().optional(),
  providerPaymentId: z.string().trim().max(100).nullable().optional(),
});

export const walletStatusSchema = z.enum(WALLET_STATUSES);
export const walletTransactionTypeSchema = z.enum(WALLET_TRANSACTION_TYPES);
export const transactionReferenceTypeSchema = z.enum(TRANSACTION_REFERENCE_TYPES);
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
