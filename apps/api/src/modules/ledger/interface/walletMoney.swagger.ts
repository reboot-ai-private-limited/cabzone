import { z } from 'zod';
import {
  registry,
  bearerAuth,
  successResponse,
  errorResponse,
} from '../../../shared/http/swagger.util.js';
import {
  idSchema,
  moneySchema,
  cashoutSchema,
  resolutionSchema,
} from './walletMoney.controller.js';

const operation = z.object({
  id: z.string().uuid(),
  driverId: z.string(),
  kind: z.enum(['RECHARGE', 'CASHOUT']),
  status: z.enum(['CREATED', 'PENDING', 'COMPLETED', 'REJECTED']),
  amountPaise: z.number().int(),
  rechargePaise: z.number().int(),
  earningsPaise: z.number().int(),
  destinationUpi: z.string().nullable(),
  transferReference: z.string().nullable(),
  reason: z.string().nullable(),
  testMode: z.literal(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
const recharge = z.object({ operation, checkoutUrl: z.string().url() });
const activity = z.object({
  commissionBalancePaise: z.number().int(),
  earningsBalancePaise: z.number().int(),
  availableCashoutPaise: z.number().int(),
  pendingCashoutPaise: z.number().int(),
  cashoutBlockedReason: z.string().nullable(),
  operations: z.array(operation),
  testMode: z.literal(true),
});
const response = (schema: z.ZodTypeAny) => ({
  description: 'Wallet result',
  content: { 'application/json': { schema: successResponse(schema) } },
});
const denied = {
  description: 'Invalid request, wrong owner, insufficient funds, or final decision conflict',
  content: { 'application/json': { schema: errorResponse } },
};

export function registerWalletMoneySwaggerPaths() {
  registry.registerPath({
    method: 'get',
    path: '/v1/driver/wallet/me/activity',
    tags: ['Wallet'],
    security: bearerAuth,
    summary: 'Driver balances and latest 100 test requests',
    responses: { 200: response(activity), 403: denied },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/driver/wallet/me/recharges',
    tags: ['Wallet'],
    security: bearerAuth,
    summary: 'Create or resume an idempotent test UPI recharge; minimum INR 100',
    request: { body: { content: { 'application/json': { schema: moneySchema } } } },
    responses: { 201: response(recharge), 400: denied, 409: denied },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/driver/wallet/me/recharges/{id}/status',
    tags: ['Wallet'],
    security: bearerAuth,
    summary: 'Verify provider capture and credit the owning driver once',
    request: { params: idSchema },
    responses: { 200: response(recharge), 404: denied },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/driver/wallet/me/cashouts',
    tags: ['Wallet'],
    security: bearerAuth,
    summary: 'Reserve online earnings then unused recharge funds for Finance review; test only',
    request: { body: { content: { 'application/json': { schema: cashoutSchema } } } },
    responses: { 201: response(operation), 400: denied, 409: denied },
  });
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/wallets/cashouts',
    tags: ['Wallet'],
    security: bearerAuth,
    summary: 'Finance or super admin: latest 100 pending cashouts',
    responses: { 200: response(z.array(operation)), 403: denied },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/admin/wallets/cashouts/{id}/resolve',
    tags: ['Wallet'],
    security: bearerAuth,
    summary:
      'Finance or super admin: record test transfer or reject and return funds; no payout initiated',
    request: {
      params: idSchema,
      body: { content: { 'application/json': { schema: resolutionSchema } } },
    },
    responses: { 200: response(operation), 403: denied, 409: denied },
  });
}
