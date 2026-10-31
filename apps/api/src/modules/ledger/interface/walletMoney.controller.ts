import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import {
  adminWalletOperationView,
  walletOperationView,
  type WalletMoneyUseCase,
} from '../application/useCases/walletMoney.usecase.js';
import type { WalletRechargeTicketPort } from '../domain/walletOperation.port.js';
import { walletRechargeHtml } from './walletRecharge.html.js';

export const idSchema = z.object({ id: z.string().uuid() });
export const moneySchema = z.object({
  amountPaise: z.number().int().positive().max(10000000),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/),
});
export const cashoutSchema = moneySchema.extend({
  destinationUpi: z.string().trim().min(3).max(320),
});
export const resolutionSchema = z.object({
  outcome: z.enum(['PAID', 'REJECTED']),
  detail: z.string().trim().min(5).max(255),
});

export function walletMoneyControllers(
  money: WalletMoneyUseCase,
  tickets: WalletRechargeTicketPort,
  resolveDriverId: (userId: string) => Promise<string | null>,
) {
  const driver = async (userId: string | undefined) => {
    if (!userId) throw AppError.unauthenticated();
    const driverId = await resolveDriverId(userId);
    if (!driverId) throw AppError.forbidden('Driver profile required.');
    return driverId;
  };
  const link = async (
    req: { protocol: string; get(name: string): string | undefined },
    id: string,
    driverId: string,
  ) =>
    `${req.protocol}://${req.get('host')}/api/v1/driver/wallet/recharge-checkout#${await tickets.issue(id, driverId)}`;
  const publicAction = (action: 'session' | 'status') =>
    asyncHandler(async (req, res) => {
      const { ticket } = z.object({ ticket: z.string().min(1).max(2048) }).parse(req.body);
      const scope = await tickets.read(ticket);
      const operation = await money.reconcileRecharge(scope.operationId, scope.driverId);
      sendSuccess(req, res, {
        operation: walletOperationView(operation),
        ...(action === 'session' && operation.status !== 'COMPLETED'
          ? { checkout: await money.checkout(scope.operationId, scope.driverId) }
          : {}),
      });
    });
  return {
    activity: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await money.activity(await driver(req.auth?.userId)));
    }),
    recharge: asyncHandler(async (req, res) => {
      const body = moneySchema.parse(req.body);
      const driverId = await driver(req.auth?.userId);
      const operation = await money.createRecharge(driverId, body.amountPaise, body.idempotencyKey);
      sendSuccess(
        req,
        res,
        {
          operation: walletOperationView(operation),
          checkoutUrl: await link(req, operation.id, driverId),
        },
        'Recharge created',
        201,
      );
    }),
    rechargeStatus: asyncHandler(async (req, res) => {
      const { id } = idSchema.parse(req.params);
      const driverId = await driver(req.auth?.userId);
      const operation = await money.reconcileRecharge(id, driverId);
      sendSuccess(req, res, {
        operation: walletOperationView(operation),
        checkoutUrl: await link(req, id, driverId),
      });
    }),
    cashout: asyncHandler(async (req, res) => {
      const body = cashoutSchema.parse(req.body);
      sendSuccess(
        req,
        res,
        walletOperationView(
          await money.requestCashout(
            await driver(req.auth?.userId),
            body.amountPaise,
            body.destinationUpi,
            body.idempotencyKey,
          ),
        ),
        'Cashout reserved for review',
        201,
      );
    }),
    cashouts: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await money.cashouts());
    }),
    resolve: asyncHandler(async (req, res) => {
      if (!req.auth) throw AppError.unauthenticated();
      const { id } = idSchema.parse(req.params);
      const body = resolutionSchema.parse(req.body);
      sendSuccess(
        req,
        res,
        adminWalletOperationView(
          await money.resolveCashout(id, body.outcome, body.detail, req.auth.userId),
        ),
      );
    }),
    session: publicAction('session'),
    status: publicAction('status'),
    page: asyncHandler(async (_req, res) => {
      const nonce = randomBytes(18).toString('base64');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'nonce-${nonce}' https://*.razorpay.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.razorpay.com; frame-src https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
      );
      res.type('html').send(walletRechargeHtml(nonce));
    }),
  };
}
