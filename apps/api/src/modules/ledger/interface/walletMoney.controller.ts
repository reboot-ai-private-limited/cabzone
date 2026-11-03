import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { getRawBody } from '../../../shared/http/rawBody.js';
import { toProviderPayout } from '../infrastructure/razorpayPayout.adapter.js';
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
export const cashoutSchema = moneySchema
  .extend({
    destinationUpi: z.string().trim().min(3).max(320).optional(),
    destinationBank: z
      .object({
        accountNumber: z.string().trim().min(9).max(24),
        ifsc: z.string().trim().min(11).max(11),
        accountHolderName: z.string().trim().min(2).max(100),
      })
      .optional(),
  })
  .refine((body) => Boolean(body.destinationUpi) !== Boolean(body.destinationBank), {
    message: 'Provide either a UPI ID or bank account details.',
  });
export const resolutionSchema = z.object({
  outcome: z.enum(['PAID', 'REJECTED']),
  detail: z.string().trim().min(5).max(255),
});

export function walletMoneyControllers(
  money: WalletMoneyUseCase,
  tickets: WalletRechargeTicketPort,
  resolveDriverId: (userId: string) => Promise<string | null>,
  webhookSecrets: readonly string[] = [],
  isTestMode = true,
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
            body.destinationBank
              ? { type: 'BANK', ...body.destinationBank }
              : { type: 'UPI', upiId: body.destinationUpi ?? '' },
            body.idempotencyKey,
          ),
        ),
        'Cashout requested',
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
    syncCashout: asyncHandler(async (req, res) => {
      const { id } = idSchema.parse(req.params);
      sendSuccess(req, res, adminWalletOperationView(await money.syncCashout(id)));
    }),
    webhook: asyncHandler(async (req, res) => {
      const raw = getRawBody(req);
      const signature = req.get('x-razorpay-signature') ?? '';
      if (!raw || !webhookSecrets.length || !/^[a-f0-9]{64}$/.test(signature))
        throw AppError.forbidden('Invalid wallet notification.');
      const supplied = Buffer.from(signature, 'hex');
      const authentic = webhookSecrets.some((secret) => {
        const expected = createHmac('sha256', secret).update(raw).digest();
        return expected.length === supplied.length && timingSafeEqual(expected, supplied);
      });
      if (!authentic) throw AppError.forbidden('Invalid wallet notification.');

      let event: { event?: unknown; payload?: Record<string, { entity?: Record<string, unknown> }> };
      try {
        event = JSON.parse(raw) as typeof event;
      } catch {
        throw AppError.badRequest('Malformed wallet notification.');
      }
      const type = typeof event.event === 'string' ? event.event : '';
      // Errors propagate as non-2xx so Razorpay redelivers; handlers are idempotent.
      if (type === 'payment.captured' || type === 'order.paid') {
        const orderId =
          (event.payload?.payment?.entity?.order_id as string | undefined) ??
          (event.payload?.order?.entity?.id as string | undefined);
        if (typeof orderId === 'string') await money.handleRechargeEvent(orderId);
      } else if (type.startsWith('payout.')) {
        const entity = event.payload?.payout?.entity;
        const reference = entity?.reference_id;
        if (entity && typeof reference === 'string')
          await money.handlePayoutEvent(reference, toProviderPayout(entity));
      }
      res.sendStatus(200);
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
      res.type('html').send(walletRechargeHtml(nonce, isTestMode));
    }),
  };
}
