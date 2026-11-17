import { describe, expect, it, vi } from 'vitest';
import { WalletMoneyUseCase } from '../src/modules/ledger/application/useCases/walletMoney.usecase.js';
import { MemoryWalletRepository } from '../src/modules/ledger/index.js';
import { MemoryWalletOperationRepository } from '../src/modules/ledger/infrastructure/persistence/walletOperation.repository.js';
import { unitOfWork } from './helpers/unitOfWork.js';

async function fixture() {
  const walletRepo = new MemoryWalletRepository();
  await walletRepo.save({
    id: 'wallet',
    driverId: 'driver',
    // Single wallet: one balance (recharge + online earnings, less commission).
    balancePaise: 300000,
    earningsBalancePaise: 0,
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const operations = new MemoryWalletOperationRepository();
  const gateway = {
    live: false,
    keyId: 'rzp_test_fixture',
    createOrder: vi.fn(async () => 'order_fixture'),
    findCapturedPayment: vi.fn(async (): Promise<string | null> => null),
  };
  const money = new WalletMoneyUseCase({
    walletRepo,
    operations,
    gateway,
    unitOfWork,
    enabled: true,
  });
  return { walletRepo, operations, gateway, money };
}

describe('Wallet money movement', () => {
  it('resumes an interrupted order creation without losing the recharge request', async () => {
    const f = await fixture();
    f.gateway.createOrder.mockRejectedValueOnce(new Error('Provider temporarily unavailable'));
    await expect(f.money.createRecharge('driver', 100000, 'interrupted-key')).rejects.toThrow(
      'unavailable',
    );
    const [saved] = await f.operations.list('driver');
    expect(saved?.orderId).toBeNull();
    expect((await f.money.reconcileRecharge(saved!.id, 'driver')).orderId).toBe('order_fixture');
    expect((await f.money.activity('driver')).commissionBalancePaise).toBe(300000);
  });
  it('credits a recharge only after capture and never twice', async () => {
    const f = await fixture();
    const recharge = await f.money.createRecharge('driver', 100000, 'recharge-key');
    expect((await f.money.createRecharge('driver', 100000, 'recharge-key')).id).toBe(recharge.id);
    expect(f.gateway.createOrder).toHaveBeenCalledTimes(1);
    await f.money.reconcileRecharge(recharge.id, 'driver');
    expect((await f.walletRepo.findByDriverId('driver'))?.balancePaise).toBe(300000);
    await expect(f.money.reconcileRecharge(recharge.id, 'other')).rejects.toThrow();
    f.gateway.findCapturedPayment.mockResolvedValue('pay_fixture');
    await f.money.reconcileRecharge(recharge.id, 'driver');
    await f.money.reconcileRecharge(recharge.id, 'driver');
    expect((await f.walletRepo.findByDriverId('driver'))?.balancePaise).toBe(400000);
    expect(await f.walletRepo.findTransactionsByWalletId('wallet')).toHaveLength(1);
    await expect(f.money.createRecharge('driver', 200000, 'recharge-key')).rejects.toThrow(
      'different',
    );
  });

  it('reserves the cashout from the single balance; rejection restores it exactly once', async () => {
    const f = await fixture();
    const cashout = await f.money.requestCashout('driver', 250000, 'driver@upi', 'cashout-key');
    expect(cashout).toMatchObject({ status: 'PENDING', earningsPaise: 0, rechargePaise: 250000 });
    expect((await f.money.activity('driver')).availableCashoutPaise).toBe(50000);
    expect((await f.money.requestCashout('driver', 250000, 'driver@upi', 'cashout-key')).id).toBe(
      cashout.id,
    );
    await expect(
      f.money.requestCashout('driver', 100000, 'driver@upi', 'another-key'),
    ).rejects.toThrow();
    await f.money.resolveCashout(cashout.id, 'REJECTED', 'UPI details need correction', 'admin');
    await f.money.resolveCashout(cashout.id, 'REJECTED', 'UPI details need correction', 'admin');
    expect((await f.money.activity('driver')).availableCashoutPaise).toBe(300000);
    await expect(
      f.money.resolveCashout(cashout.id, 'PAID', 'UTR-fixture', 'admin'),
    ).rejects.toThrow();
  });

  it('records a paid cashout without another debit and rejects invalid amounts, dues, or a disabled wallet', async () => {
    const f = await fixture();
    await expect(
      f.money.requestCashout('driver', 400000, 'driver@upi', 'too-much-key'),
    ).rejects.toThrow();
    await expect(f.money.createRecharge('driver', 0, 'zero-key')).rejects.toThrow();
    const cashout = await f.money.requestCashout('driver', 100000, 'driver@upi', 'cashout-key');
    await f.money.resolveCashout(cashout.id, 'PAID', 'test-UTR-1234', 'admin');
    await f.money.resolveCashout(cashout.id, 'PAID', 'test-UTR-1234', 'admin');
    expect((await f.money.activity('driver')).availableCashoutPaise).toBe(200000);
    const wallet = (await f.walletRepo.findByDriverId('driver'))!;
    await f.walletRepo.save({ ...wallet, balancePaise: -100 });
    await expect(
      f.money.requestCashout('driver', 20000, 'driver@upi', 'due-cashout'),
    ).rejects.toThrow('dues');
    const disabled = new WalletMoneyUseCase({ ...f, unitOfWork, enabled: false });
    await expect(
      disabled.requestCashout('driver', 20000, 'driver@upi', 'disabled-key'),
    ).rejects.toThrow('not enabled');
  });
});

describe('Automated cashout payouts', () => {
  const payout = (status: string, extra: object = {}) => ({
    payoutId: 'pout_fixture1',
    status: status as never,
    utr: null,
    failureReason: null,
    ...extra,
  });
  async function payoutFixture() {
    const f = await fixture();
    const payouts = {
      createPayout: vi.fn(async () => payout('processing')),
      fetchPayout: vi.fn(async () => payout('processed', { utr: 'UTR123456' })),
    };
    const money = new WalletMoneyUseCase({
      walletRepo: f.walletRepo,
      operations: f.operations,
      gateway: f.gateway,
      payouts,
      unitOfWork,
      enabled: true,
    });
    return { ...f, money, payouts };
  }

  it('sends the payout once and settles it from the provider webhook', async () => {
    const f = await payoutFixture();
    const cashout = await f.money.requestCashout('driver', 100000, 'driver@upi', 'payout-key-1');
    expect(cashout.status).toBe('PROCESSING');
    expect(f.payouts.createPayout).toHaveBeenCalledTimes(1);
    // replay with the same key must not create a second payout
    await f.money.requestCashout('driver', 100000, 'driver@upi', 'payout-key-1');
    expect(f.payouts.createPayout).toHaveBeenCalledTimes(1);
    await f.money.handlePayoutEvent(cashout.id, payout('processed', { utr: 'UTR123456' }));
    await f.money.handlePayoutEvent(cashout.id, payout('processed', { utr: 'UTR123456' }));
    const done = (await f.operations.find(cashout.id))!;
    expect(done.status).toBe('COMPLETED');
    expect(done.transferReference).toBe('UTR123456');
    expect((await f.money.activity('driver')).availableCashoutPaise).toBe(200000);
  });

  it('returns the funds exactly once when the payout fails or is reversed', async () => {
    const f = await payoutFixture();
    const cashout = await f.money.requestCashout('driver', 100000, 'driver@upi', 'payout-key-2');
    await f.money.handlePayoutEvent(cashout.id, payout('failed', { failureReason: 'Invalid UPI' }));
    await f.money.handlePayoutEvent(cashout.id, payout('failed', { failureReason: 'Invalid UPI' }));
    const failed = (await f.operations.find(cashout.id))!;
    expect(failed.status).toBe('REJECTED');
    expect(failed.reason).toBe('Invalid UPI');
    expect((await f.money.activity('driver')).availableCashoutPaise).toBe(300000);
  });

  it('refunds immediately when the provider rejects the payout outright', async () => {
    const f = await payoutFixture();
    const { PayoutRejectedError } = await import('../src/modules/ledger/domain/walletOperation.port.js');
    f.payouts.createPayout.mockRejectedValueOnce(new PayoutRejectedError('Invalid VPA'));
    const cashout = await f.money.requestCashout('driver', 100000, 'driver@upi', 'payout-key-3');
    expect(cashout.status).toBe('REJECTED');
    expect((await f.money.activity('driver')).availableCashoutPaise).toBe(300000);
  });

  it('keeps an unreachable provider pending and retries through sync without double paying', async () => {
    const f = await payoutFixture();
    f.payouts.createPayout.mockRejectedValueOnce(new Error('network down'));
    const cashout = await f.money.requestCashout('driver', 100000, 'driver@upi', 'payout-key-4');
    expect(cashout.status).toBe('PENDING');
    expect((await f.money.activity('driver')).pendingCashoutPaise).toBe(100000);
    expect((await f.money.syncCashout(cashout.id)).status).toBe('PROCESSING');
    expect((await f.money.syncCashout(cashout.id)).status).toBe('COMPLETED');
  });

  it('does not let Finance settle a payout the provider is already handling', async () => {
    const f = await payoutFixture();
    const cashout = await f.money.requestCashout('driver', 100000, 'driver@upi', 'payout-key-5');
    await expect(
      f.money.resolveCashout(cashout.id, 'PAID', 'manual-ref-1', 'admin'),
    ).rejects.toThrow('payment provider');
  });

  it('pays out to a bank account by IMPS, validates details and hides the account number from the driver', async () => {
    const f = await payoutFixture();
    const bank = { type: 'BANK' as const, accountNumber: '123456789012', ifsc: 'hdfc0001234', accountHolderName: ' Raju  Das ' };
    await expect(
      f.money.requestCashout('driver', 100000, { ...bank, ifsc: 'BAD' }, 'bank-key-bad1'),
    ).rejects.toThrow('IFSC');
    await expect(
      f.money.requestCashout('driver', 100000, { ...bank, accountNumber: '12ab' }, 'bank-key-bad2'),
    ).rejects.toThrow('account number');
    const cashout = await f.money.requestCashout('driver', 100000, bank, 'bank-key-1');
    expect(f.payouts.createPayout).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: {
          type: 'BANK',
          accountNumber: '123456789012',
          ifsc: 'HDFC0001234',
          accountHolderName: 'Raju Das',
        },
      }),
    );
    const { walletOperationView, adminWalletOperationView } = await import(
      '../src/modules/ledger/application/useCases/walletMoney.usecase.js'
    );
    const saved = (await f.operations.find(cashout.id))!;
    expect(walletOperationView(saved)).toMatchObject({
      destinationType: 'BANK',
      destinationUpi: null,
      destinationLabel: 'Bank ****9012 (HDFC0001234)',
    });
    expect(JSON.stringify(walletOperationView(saved))).not.toContain('123456789012');
    expect(adminWalletOperationView(saved).destinationLabel).toContain('123456789012');
    // same key, different account -> rejected
    await expect(
      f.money.requestCashout('driver', 100000, { ...bank, accountNumber: '999999999999' }, 'bank-key-1'),
    ).rejects.toThrow('different payment details');
  });
});

describe('Single wallet', () => {
  it('lets online earnings offset commission dues so the net balance can be cashed out', async () => {
    const f = await fixture();
    const wallet = (await f.walletRepo.findByDriverId('driver'))!;
    // ₹300 balance after ₹350 online earnings and ₹50 cash-ride commission: no dues, cashout allowed.
    await f.walletRepo.save({ ...wallet, balancePaise: 30000 });
    const activity = await f.money.activity('driver');
    expect(activity.cashoutBlockedReason).toBeNull();
    expect(activity.availableCashoutPaise).toBe(30000);
    await expect(f.money.requestCashout('driver', 30000, 'driver@upi', 'net-cashout-key')).resolves.toMatchObject({
      status: 'PENDING',
      rechargePaise: 30000,
      earningsPaise: 0,
    });
  });
});
