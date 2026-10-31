import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(
  readFileSync(new URL('./driver-ride-policy.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } },
).outputText;

const policy = {};
vm.runInNewContext(code, { exports: policy, Date, Math, Number, String });

test('resolveDriverCashAvailability always allows cash or UPI even when rider arrears apply', () => {
  const withArrears = policy.resolveDriverCashAvailability({
    arrearsPaise: 5000,
    pricingSnapshot: { cancellationFeePaise: 5000 },
  });
  assert.equal(withArrears.cashAllowed, true);
  assert.equal(withArrears.arrearsPaise, 5000);
  assert.equal(withArrears.reason, null);

  const lowArrears = policy.resolveDriverCashAvailability({
    arrearsPaise: 2500,
    pricingSnapshot: { cancellationFeePaise: 5000 },
  });
  assert.equal(lowArrears.cashAllowed, true);
  assert.equal(lowArrears.reason, null);
});

test('resolveDriverNoShowStatus enforces arrival state and driverNoShowWaitSeconds threshold', () => {
  const enRoute = policy.resolveDriverNoShowStatus(
    {
      status: 'DRIVER_EN_ROUTE',
      arrivedAt: null,
      updatedAt: '2026-10-28T10:00:00.000Z',
      pricingSnapshot: {
        driverNoShowWaitSeconds: 300,
        driverCompensationPaise: 2500,
        cancellationFeePaise: 5000,
      },
    },
    Date.parse('2026-10-28T10:10:00.000Z'),
  );
  assert.equal(enRoute.canMarkNoShow, false);
  assert.match(enRoute.statusText, /Mark arrival at pickup and wait 5:00/);

  const arrivedEarly = policy.resolveDriverNoShowStatus(
    {
      status: 'DRIVER_ARRIVED',
      arrivedAt: '2026-10-28T10:00:00.000Z',
      updatedAt: '2026-10-28T10:00:00.000Z',
      pricingSnapshot: {
        driverNoShowWaitSeconds: 300,
        driverCompensationPaise: 2500,
        cancellationFeePaise: 5000,
      },
    },
    Date.parse('2026-10-28T10:02:15.000Z'),
  );
  assert.equal(arrivedEarly.canMarkNoShow, false);
  assert.equal(arrivedEarly.elapsedWaitSeconds, 135);
  assert.equal(arrivedEarly.remainingWaitSeconds, 165);
  assert.match(arrivedEarly.statusText, /Wait 2:45 more/);

  const arrivedEligible = policy.resolveDriverNoShowStatus(
    {
      status: 'DRIVER_ARRIVED',
      arrivedAt: '2026-10-28T10:00:00.000Z',
      updatedAt: '2026-10-28T10:00:00.000Z',
      pricingSnapshot: {
        driverNoShowWaitSeconds: 300,
        driverCompensationPaise: 2500,
        cancellationFeePaise: 5000,
      },
    },
    Date.parse('2026-10-28T10:05:05.000Z'),
  );
  assert.equal(arrivedEligible.canMarkNoShow, true);
  assert.match(arrivedEligible.statusText, /No-show wait complete \(5:05\)/);
  assert.match(arrivedEligible.statusText, /₹25\.00 driver compensation/);
});

test('resolveDriverArrearsWalletEffect keeps commission strictly on trip fare and explains cash vs UPI wallet effects', () => {
  const cashEffect = policy.resolveDriverArrearsWalletEffect({
    grossFarePaise: 20000,
    commissionPaise: 1600,
    netEarningsPaise: 18400,
    arrearsPaise: 5000,
    method: 'CASH',
  });
  assert.equal(cashEffect.totalCollectFromRiderPaise, 25000);
  assert.equal(cashEffect.cashWalletDebitPaise, 6600);
  assert.match(cashEffect.summaryNote, /You collect ₹250\.00 cash; -₹66\.00/);

  const upiEffect = policy.resolveDriverArrearsWalletEffect({
    grossFarePaise: 20000,
    commissionPaise: 1600,
    netEarningsPaise: 18400,
    arrearsPaise: 5000,
    method: 'ONLINE_UPI',
  });
  assert.equal(upiEffect.onlineWalletCreditPaise, 18400);
  assert.match(upiEffect.summaryNote, /\+₹184\.00 net trip earnings credited/);
});

test('extractDriverCancellationCompensationPaise accounts for applied and waived fee reversals', () => {
  assert.equal(
    policy.extractDriverCancellationCompensationPaise([
      {
        eventType: 'CANCELLATION_FEE_APPLIED',
        metadata: { driverCompensationPaise: 2500 },
      },
    ]),
    2500,
  );
  assert.equal(
    policy.extractDriverCancellationCompensationPaise([
      {
        eventType: 'CANCELLATION_FEE_APPLIED',
        metadata: { driverCompensationPaise: 2500 },
      },
      {
        eventType: 'CANCELLATION_FEE_WAIVED',
        metadata: { driverCompensationReversedPaise: 2500 },
      },
    ]),
    0,
  );
});
