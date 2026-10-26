import { z } from 'zod';
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  TRANSACTION_REFERENCE_TYPES,
  WALLET_OWNER_TYPES,
  WALLET_STATUSES,
  WALLET_TRANSACTION_TYPES,
} from '@cabzone/contracts';

export const rechargeWalletSchema = z.object({
  driverId: z.string().uuid('Invalid driverId UUID'),
  amountPaise: z
    .number()
    .int()
    .min(10000, 'Minimum wallet recharge is Rs. 100 (10000 paise)')
    .max(10000000, 'Maximum single recharge is Rs. 1,00,000 (10000000 paise)'),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const adminAdjustWalletSchema = z
  .object({
    driverId: z.string().uuid('Invalid driverId UUID').optional(),
    riderId: z.string().uuid('Invalid riderId UUID').optional(),
    walletId: z.string().optional(),
    ownerType: z.enum(WALLET_OWNER_TYPES).optional(),
    amountPaise: z.number().int().positive('Amount must be positive'),
    type: z.enum(['CREDIT', 'DEBIT'] as const),
    reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(255),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
  })
  .refine((data) => data.driverId || data.riderId || data.walletId, {
    message: 'Must provide driverId, riderId, or walletId',
  });

export const listWalletsQuerySchema = z.object({
  type: z.enum(['DRIVER', 'RIDER']).optional(),
  search: z.string().trim().optional(),
  status: z.enum(['ALL', 'ACTIVE', 'BLOCKED', 'OWED', 'CREDIT']).optional(),
  balanceFilter: z.enum(['ALL', 'OWING', 'PAYABLE', 'ZERO']).optional(),
  suspendedFilter: z.enum(['ANY', 'SUSPENDED', 'NOT_SUSPENDED']).optional(),
  sortBy: z
    .enum(['DEEPEST_DEBT', 'HIGHEST_BALANCE', 'LIFETIME_EARNINGS', 'RECENT_ENTRY'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const listTransactionsQuerySchema = z.object({
  walletId: z.string().optional(),
  ownerId: z.string().optional(),
  driverId: z.string().optional(),
  riderId: z.string().optional(),
  ownerType: z.enum(WALLET_OWNER_TYPES).optional(),
  type: z.enum(WALLET_TRANSACTION_TYPES).optional(),
  referenceType: z.enum(TRANSACTION_REFERENCE_TYPES).optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const driverMyWalletQuerySchema = z.object({
  txLimit: z.coerce.number().int().min(1).max(100).optional(),
});

export const driverListTransactionsQuerySchema = z.object({
  direction: z.enum(['ALL', 'DEBIT', 'CREDIT']).default('ALL'),
  type: z.enum(WALLET_TRANSACTION_TYPES).optional(),
  referenceType: z.enum(TRANSACTION_REFERENCE_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
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
