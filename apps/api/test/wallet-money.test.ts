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
    balancePaise: 10000,
    earningsBalancePaise: 20000,
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
    await expect(f.money.createRecharge('driver', 10000, 'interrupted-key')).rejects.toThrow(
      'unavailable',
    );
    const [saved] = await f.operations.list('driver');
    expect(saved?.orderId).toBeNull();
    expect((await f.money.reconcileRecharge(saved!.id, 'driver')).orderId).toBe('order_fixture');
    expect((await f.money.activity('driver')).commissionBalancePaise).toBe(10000);
  });
  it('credits a recharge only after capture and never twice', async () => {
    const f = await fixture();
    const recharge = await f.money.createRecharge('driver', 10000, 'recharge-key');
    expect((await f.money.createRecharge('driver', 10000, 'recharge-key')).id).toBe(recharge.id);
    expect(f.gateway.createOrder).toHaveBeenCalledTimes(1);
    await f.money.reconcileRecharge(recharge.id, 'driver');
    expect((await f.walletRepo.findByDriverId('driver'))?.balancePaise).toBe(10000);
    await expect(f.money.reconcileRecharge(recharge.id, 'other')).rejects.toThrow();
    f.gateway.findCapturedPayment.mockResolvedValue('pay_fixture');
    await f.money.reconcileRecharge(recharge.id, 'driver');
    await f.money.reconcileRecharge(recharge.id, 'driver');
    expect((await f.walletRepo.findByDriverId('driver'))?.balancePaise).toBe(20000);
    expect(await f.walletRepo.findTransactionsByWalletId('wallet')).toHaveLength(1);
    await expect(f.money.createRecharge('driver', 20000, 'recharge-key')).rejects.toThrow(
      'different',
    );
  });

  it('reserves earnings first and unused recharge next; rejection restores each bucket exactly once', async () => {
    const f = await fixture();
    const cashout = await f.money.requestCashout('driver', 25000, 'driver@upi', 'cashout-key');
    expect(cashout).toMatchObject({ status: 'PENDING', earningsPaise: 20000, rechargePaise: 5000 });
    expect((await f.money.activity('driver')).availableCashoutPaise).toBe(5000);
    expect((await f.money.requestCashout('driver', 25000, 'driver@upi', 'cashout-key')).id).toBe(
      cashout.id,
    );
    await expect(
      f.money.requestCashout('driver', 10000, 'driver@upi', 'another-key'),
    ).rejects.toThrow();
    await f.money.resolveCashout(cashout.id, 'REJECTED', 'UPI details need correction', 'admin');
    await f.money.resolveCashout(cashout.id, 'REJECTED', 'UPI details need correction', 'admin');
    expect((await f.money.activity('driver')).availableCashoutPaise).toBe(30000);
    await expect(
      f.money.resolveCashout(cashout.id, 'PAID', 'UTR-fixture', 'admin'),
    ).rejects.toThrow();
  });

  it('records a paid cashout without another debit and rejects invalid amounts, dues, or live mode', async () => {
    const f = await fixture();
    await expect(
      f.money.requestCashout('driver', 40000, 'driver@upi', 'too-much-key'),
    ).rejects.toThrow();
    await expect(f.money.createRecharge('driver', 0, 'zero-key')).rejects.toThrow();
    const cashout = await f.money.requestCashout('driver', 10000, 'driver@upi', 'cashout-key');
    await f.money.resolveCashout(cashout.id, 'PAID', 'test-UTR-1234', 'admin');
    await f.money.resolveCashout(cashout.id, 'PAID', 'test-UTR-1234', 'admin');
    expect((await f.money.activity('driver')).availableCashoutPaise).toBe(20000);
    const wallet = (await f.walletRepo.findByDriverId('driver'))!;
    await f.walletRepo.save({ ...wallet, balancePaise: -100 });
    await expect(
      f.money.requestCashout('driver', 100, 'driver@upi', 'due-cashout'),
    ).rejects.toThrow('dues');
    const disabled = new WalletMoneyUseCase({ ...f, unitOfWork, enabled: false });
    await expect(
      disabled.requestCashout('driver', 100, 'driver@upi', 'disabled-key'),
    ).rejects.toThrow('test mode');
  });
});
