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
import {
  adminAdjustWalletSchema,
  driverListTransactionsQuerySchema,
  driverMyWalletQuerySchema,
  listTransactionsQuerySchema,
  listWalletsQuerySchema,
  reconcileWalletLedgerSchema,
} from './ledger.validation.js';

const operation = z.object({
  id: z.string().uuid(),
  driverId: z.string(),
  kind: z.enum(['RECHARGE', 'CASHOUT']),
  status: z.enum(['CREATED', 'PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED']),
  amountPaise: z.number().int(),
  rechargePaise: z.number().int(),
  earningsPaise: z.number().int(),
  destinationUpi: z.string().nullable(),
  transferReference: z.string().nullable(),
  reason: z.string().nullable(),
  testMode: z.boolean(),
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
  testMode: z.boolean(),
});
const paginatedTransactions = z.object({
  items: z.array(z.any()),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  hasMore: z.boolean(),
});
const ticketQuerySchema = z.object({ ticket: z.string() });
const ticketBodySchema = z.object({ ticket: z.string() });
const response = (schema: z.ZodTypeAny) => ({
  description: 'Wallet result',
  content: { 'application/json': { schema: successResponse(schema) } },
});
const denied = {
  description: 'Invalid request, wrong owner, insufficient funds, or final decision conflict',
  content: { 'application/json': { schema: errorResponse } },
};

let registered = false;

export function registerWalletMoneySwaggerPaths(): void {
  if (registered) return;
  registered = true;

  // Public signed-ticket recharge checkout endpoints
  registry.registerPath({
    method: 'get',
    path: '/v1/driver/wallet/recharge-checkout',
    tags: ['Wallet'],
    summary: 'Render signed-ticket hosted UPI recharge checkout page',
    request: { query: ticketQuerySchema },
    responses: {
      200: { description: 'HTML checkout page' },
      403: denied,
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/driver/wallet/recharge-checkout/session',
    tags: ['Wallet'],
    summary: 'Load Razorpay checkout session for a signed driver recharge ticket',
    request: { body: { content: { 'application/json': { schema: ticketBodySchema } } } },
    responses: { 200: response(z.any()), 403: denied },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/driver/wallet/recharge-checkout/status',
    tags: ['Wallet'],
    summary: 'Poll and reconcile driver recharge capture using a signed recharge ticket',
    request: { body: { content: { 'application/json': { schema: ticketBodySchema } } } },
    responses: { 200: response(z.any()), 403: denied },
  });

  // Driver authenticated wallet routes
  registry.registerPath({
    method: 'get',
    path: '/v1/driver/wallet/me',
    tags: ['Wallet'],
    security: bearerAuth,
    summary: 'Get authenticated driver wallet summary and recent transactions',
    request: { query: driverMyWalletQuerySchema },
    responses: { 200: response(z.any()), 403: denied },
  });
  registry.registerPath({
    method: 'get',
    path: '/v1/driver/wallet/me/transactions',
    tags: ['Wallet'],
    security: bearerAuth,
    summary: 'Paginated ledger transactions for the authenticated driver wallet',
    request: { query: driverListTransactionsQuerySchema },
    responses: { 200: response(paginatedTransactions), 403: denied },
  });
  registry.registerPath({
    method: 'get',
    path: '/v1/driver/wallet/me/activity',
    tags: ['Wallet'],
    security: bearerAuth,
    summary: 'Driver balances and latest 100 wallet requests',
    responses: { 200: response(activity), 403: denied },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/driver/wallet/me/recharges',
    tags: ['Wallet'],
    security: bearerAuth,
    summary: 'Create or resume an idempotent UPI recharge; minimum INR 500; cashouts minimum INR 200, maximum INR 1,00,000',
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
    summary: 'Reserve online earnings then unused recharge funds and pay them out to the driver UPI ID',
    request: { body: { content: { 'application/json': { schema: cashoutSchema } } } },
    responses: { 201: response(operation), 400: denied, 409: denied },
  });

  // Admin finance wallet routes
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/wallets/stats',
    tags: ['Admin Finance'],
    security: bearerAuth,
    summary: 'Finance or super admin: aggregate ledger KPIs and balances',
    responses: { 200: response(z.any()), 403: denied },
  });
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/wallets/transactions',
    tags: ['Admin Finance'],
    security: bearerAuth,
    summary: 'Finance or super admin: paginated global ledger transactions',
    request: { query: listTransactionsQuerySchema },
    responses: { 200: response(paginatedTransactions), 403: denied },
  });
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/wallets',
    tags: ['Admin Finance'],
    security: bearerAuth,
    summary: 'Finance or super admin: list driver and rider wallets with filters',
    request: { query: listWalletsQuerySchema },
    responses: { 200: response(z.any()), 403: denied },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/admin/wallets/adjustments',
    tags: ['Admin Finance'],
    security: bearerAuth,
    summary: 'Finance or super admin: post manual credit or debit wallet adjustment with audit reason',
    request: { body: { content: { 'application/json': { schema: adminAdjustWalletSchema } } } },
    responses: { 200: response(z.any()), 400: denied, 403: denied },
  });
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/wallets/{driverId}',
    tags: ['Admin Finance'],
    security: bearerAuth,
    summary: 'Finance or super admin: inspect wallet summary and ledger entries by owner ID',
    request: { params: z.object({ driverId: z.string() }) },
    responses: { 200: response(z.any()), 403: denied, 404: denied },
  });
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/wallets/cashouts',
    tags: ['Admin Finance'],
    security: bearerAuth,
    summary: 'Finance or super admin: latest 100 pending cashouts',
    responses: { 200: response(z.array(operation)), 403: denied },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/admin/wallets/cashouts/{id}/resolve',
    tags: ['Admin Finance'],
    security: bearerAuth,
    summary:
      'Finance or super admin: manually settle a cashout that was not sent to the payout provider',
    request: {
      params: idSchema,
      body: { content: { 'application/json': { schema: resolutionSchema } } },
    },
    responses: { 200: response(operation), 403: denied, 409: denied },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/admin/wallets/cashouts/{id}/sync',
    tags: ['Admin Finance'],
    security: bearerAuth,
    summary: 'Finance or super admin: refresh a cashout from the payout provider or retry an unsent payout',
    request: { params: idSchema },
    responses: { 200: response(operation), 403: denied, 404: denied },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/driver/wallet/webhook',
    tags: ['Driver Wallet'],
    summary: 'Razorpay payment and payout notifications (HMAC-signed, no bearer token)',
    request: { headers: z.object({ 'x-razorpay-signature': z.string() }) },
    responses: { 200: { description: 'Acknowledged' }, 403: denied },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/admin/wallets/reconcile',
    tags: ['Admin Finance'],
    security: bearerAuth,
    summary:
      'Finance or super admin: audit wallet bucket chains, single-event postings, and recharge/cashout provider parity (or reconcile captured pending recharges)',
    request: { body: { content: { 'application/json': { schema: reconcileWalletLedgerSchema } } } },
    responses: { 200: response(z.any()), 400: denied, 403: denied },
  });
}
