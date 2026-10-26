import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const exports = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync(new URL('./ride-receipt.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  {
    exports,
    require: () => ({
      formatAssignedDriverSummary: (ride) => ({
        driverName: ride.assignedDriver?.name || 'Your driver',
        vehicleLabel: 'White Maruti Dzire',
        registrationNumber: 'WB74AB1234',
        profilePhotoUrl: null,
      }),
    }),
  },
);
const ride = () => ({
  id: 'ride-1',
  driverId: 'driver-1',
  passenger: { name: 'Aditi' },
  status: 'SETTLED',
  pickup: { address: 'Sevoke Road' },
  drop: { address: 'Hill Cart Road' },
  startedAt: '2026-10-23T10:00:00Z',
  completedAt: '2026-10-23T10:04:00Z',
  createdAt: '2026-10-23T09:40:00Z',
  routeSnapshot: { distanceM: 2200, durationSeconds: 600 },
  agreedFarePaise: 16525,
  proposedFarePaise: 15000,
  suggestedFarePaise: 14700,
});

test('receipt retains paise and uses actual recorded trip duration', () => {
  const receipt = exports.rideReceipt(ride(), []);
  assert.equal(receipt.amount, '₹165.25');
  assert.equal(receipt.duration, '4 min');
  assert.equal(receipt.durationLabel, 'Duration');
  assert.equal(receipt.distance, '2.2 km');
  assert.equal(receipt.status, 'Paid');
  assert.equal(receipt.payment, 'Payment confirmed');
});

test('missing times use an explicitly estimated duration and pending fare is never marked paid', () => {
  const input = { ...ride(), status: 'PAYMENT_PENDING', startedAt: null, completedAt: null };
  const receipt = exports.rideReceipt(input, []);
  assert.equal(receipt.paid, false);
  assert.equal(receipt.status, 'Payment pending');
  assert.equal(receipt.payment, 'Payment not recorded');
  assert.equal(receipt.durationLabel, 'Estimated duration');
  assert.equal(receipt.duration, '10 min');
  assert.equal(receipt.pickupTime, '—');
});

test('test UPI and disputed payments keep their recorded payment context', () => {
  const receipt = exports.rideReceipt({ ...ride(), status: 'PAYMENT_DISPUTED' }, [
    { eventType: 'PAYMENT_CONFIRMED', metadata: { method: 'UPI', mode: 'test' } },
  ]);
  assert.equal(receipt.testPayment, true);
  assert.equal(receipt.status, 'Payment under review');
  assert.equal(receipt.payment, 'UPI · Test payment');
  const html = exports.receiptHtml(receipt, 'data:image/png;base64,test');
  assert.ok(html.includes('NO MONEY CHARGED'));
  assert.ok(html.includes('not a tax invoice'));
});

test('receipt HTML escapes names and addresses and omits internal pricing and OTPs', () => {
  const input = {
    ...ride(),
    pickup: { address: '<script>alert(1)</script>' },
    passenger: { name: 'Aditi & <img src=x onerror=alert(1)>' },
    assignedDriver: { name: 'Driver <script>bad()</script>' },
    pickupOtp: '4321',
  };
  const html = exports.receiptHtml(exports.rideReceipt(input, []), 'data:image/png;base64,test');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Aditi &amp; &lt;img'));
  assert.ok(!html.includes('4321'));
  assert.ok(!html.includes('commission'));
});

test('empty route names and cancelled rides have clear fallbacks', () => {
  const receipt = exports.rideReceipt(
    {
      ...ride(),
      status: 'CANCELLED',
      pickup: { address: '' },
      drop: { address: null },
      startedAt: null,
      completedAt: null,
    },
    [],
  );
  assert.equal(receipt.status, 'Cancelled');
  assert.equal(receipt.paid, false);
  assert.equal(receipt.pickup, 'Pickup location');
  assert.equal(receipt.drop, 'Destination');
});


test('itemizes previous cancellation fee arrears separately from passenger fare on receipt', () => {
  const receipt = exports.rideReceipt({ ...ride(), arrearsPaise: 5000 }, []);
  assert.equal(receipt.amount, '₹165.25');
  assert.equal(receipt.arrearsAmount, '₹50.00');
  assert.equal(receipt.totalAmount, '₹215.25');
  const html = exports.receiptHtml(receipt, 'data:image/png;base64,test');
  assert.ok(html.includes('Previous cancellation fee'));
  assert.ok(html.includes('₹50.00'));
  assert.ok(html.includes('₹215.25'));
});
