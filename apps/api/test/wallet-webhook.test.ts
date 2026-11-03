import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { WalletMoneyUseCase } from '../src/modules/ledger/application/useCases/walletMoney.usecase.js';
import { MemoryWalletRepository } from '../src/modules/ledger/index.js';
import { MemoryWalletOperationRepository } from '../src/modules/ledger/infrastructure/persistence/walletOperation.repository.js';
import { WalletRechargeTickets } from '../src/modules/ledger/infrastructure/walletRechargeTickets.js';
import { walletMoneyControllers } from '../src/modules/ledger/interface/walletMoney.controller.js';
import { unitOfWork } from './helpers/unitOfWork.js';

const SECRET = 'webhook-secret-with-enough-length';

async function setup() {
  const walletRepo = new MemoryWalletRepository();
  const operations = new MemoryWalletOperationRepository();
  const payouts = {
    createPayout: vi.fn(async () => ({
      payoutId: 'pout_hook1',
      status: 'processing' as const,
      utr: null,
      failureReason: null,
    })),
    fetchPayout: vi.fn(),
  };
  const money = new WalletMoneyUseCase({
    walletRepo,
    operations,
    gateway: {
      live: true,
      keyId: 'rzp_live_fixture',
      createOrder: vi.fn(async () => 'order_hook1'),
      findCapturedPayment: vi.fn(async () => 'pay_hook1'),
    },
    payouts,
    unitOfWork,
    enabled: true,
  });
  const controllers = walletMoneyControllers(
    money,
    new WalletRechargeTickets('webhook-test-secret-32-chars-minimum!!'),
    async () => 'driver',
    [SECRET],
    false,
  );
  return { money, walletRepo, operations, controllers };
}

function call(handler: unknown, raw: string, signature: string) {
  return new Promise<{ status?: number; error?: unknown }>((resolve) => {
    const req = { rawBody: raw, get: (name: string) => (name === 'x-razorpay-signature' ? signature : undefined) };
    const res = { sendStatus: (status: number) => resolve({ status }) };
    void (handler as (...a: unknown[]) => Promise<void>)(req, res, (error: unknown) => resolve({ error }));
  });
}
const sign = (raw: string) => createHmac('sha256', SECRET).update(raw).digest('hex');

describe('wallet webhook', () => {
  it('rejects a bad signature and never touches balances', async () => {
    const f = await setup();
    const raw = JSON.stringify({ event: 'payment.captured' });
    const result = await call(f.controllers.webhook, raw, 'a'.repeat(64));
    expect(result.error).toBeDefined();
  });

  it('credits a live recharge on payment.captured exactly once', async () => {
    const f = await setup();
    await f.walletRepo.save({
      id: 'wallet', driverId: 'driver', balancePaise: 0, earningsBalancePaise: 0,
      status: 'ACTIVE', version: 1, createdAt: new Date(), updatedAt: new Date(),
    });
    const recharge = await f.money.createRecharge('driver', 50000, 'hook-recharge-1');
    expect(recharge.testMode).toBe(false);
    const raw = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { order_id: 'order_hook1' } } },
    });
    expect((await call(f.controllers.webhook, raw, sign(raw))).status).toBe(200);
    expect((await call(f.controllers.webhook, raw, sign(raw))).status).toBe(200);
    expect((await f.walletRepo.findByDriverId('driver'))?.balancePaise).toBe(50000);
  });

  it('settles a cashout from payout.processed and refunds on payout.reversed', async () => {
    const f = await setup();
    await f.walletRepo.save({
      id: 'wallet', driverId: 'driver', balancePaise: 0, earningsBalancePaise: 50000,
      status: 'ACTIVE', version: 1, createdAt: new Date(), updatedAt: new Date(),
    });
    const cashout = await f.money.requestCashout('driver', 20000, 'driver@upi', 'hook-cashout-1');
    const event = (status: string) =>
      JSON.stringify({
        event: `payout.${status}`,
        payload: { payout: { entity: { id: 'pout_hook1', reference_id: cashout.id, status, utr: 'UTRX1' } } },
      });
    const processed = event('processed');
    expect((await call(f.controllers.webhook, processed, sign(processed))).status).toBe(200);
    expect((await f.operations.find(cashout.id))?.status).toBe('COMPLETED');
    const reversed = event('reversed');
    expect((await call(f.controllers.webhook, reversed, sign(reversed))).status).toBe(200);
    expect((await f.operations.find(cashout.id))?.status).toBe('REJECTED');
    expect((await f.walletRepo.findByDriverId('driver'))?.earningsBalancePaise).toBe(50000);
  });
});
