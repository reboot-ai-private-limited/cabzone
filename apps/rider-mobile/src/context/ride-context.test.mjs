import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(
  readFileSync(new URL('./ride-context.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } },
).outputText;

function provider() {
  const states = [];
  let cursor = 0;
  let value;
  const api = { listRides: async () => [] };
  const React = {
    createContext: () => ({ Provider: 'RideProvider' }),
    createElement: (_type, props) => { value = props.value; },
    useState: (initial) => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (next) => {
        states[index] = typeof next === 'function' ? next(states[index]) : next;
      }];
    },
    useRef: (initial) => ({ current: initial }),
    useEffect: () => {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    exports: module.exports,
    Set,
    Date,
    Number,
    Error,
    Promise,
    JSON,
    Math,
    String,
    require: (name) => {
      if (name === 'react') return React;
      if (name === 'react-native') return {};
      if (name === './auth-context') return { useAuth: () => ({ token: 'token-1' }) };
      if (name === '@/services/api') return { riderRidesApi: api, isApiError: (error) => error?.name === 'ApiError' };
      if (name === '@/services/rider-helpers') return {
        extractActiveRideConflictId: (err) =>
          err?.status === 409 && err?.details?.code === 'ACTIVE_RIDE_EXISTS'
            ? err.details.rideId
            : null,
        extractPendingDriverCounters: () => [],
        isRideActive: (status) =>
          status === 'OFFERING' ||
          status === 'PAYMENT_PENDING' ||
          status === 'PAYMENT_UNPAID' ||
          status === 'PAYMENT_CONFIRMED',
      };
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  const render = () => {
    cursor = 0;
    module.exports.RideProvider({ children: null });
    return value;
  };
  return { api, render };
}

test('background sync keeps cached rides on failure and clears its error after recovery', async () => {
  const s = provider();
  const ride = { id: 'ride-1', status: 'SETTLED', createdAt: '2026-10-22T10:00:00Z' };
  s.api.listRides = async () => [ride];
  await s.render().refreshRides();

  s.api.listRides = async () => { throw new Error('Network unavailable'); };
  await assert.doesNotReject(s.render().refreshRides());
  assert.equal(s.render().rideHistory[0].id, 'ride-1');
  assert.ok(s.render().syncError);
  assert.equal(s.render().isLoadingRides, false);

  s.api.listRides = async () => [ride];
  await s.render().refreshRides();
  assert.equal(s.render().syncError, null);
});

test('superseded session work does not become a background error or reject', async () => {
  const s = provider();
  s.api.listRides = async () => {
    const error = new Error('Session changed. Retry the action.');
    error.name = 'ApiError';
    error.code = 'SESSION_CHANGED';
    throw error;
  };
  await assert.doesNotReject(s.render().refreshRides());
  assert.equal(s.render().syncError, null);
});

test('createRide hydrates activeRide when server returns 409 ACTIVE_RIDE_EXISTS, and disputePayment unblocks', async () => {
  const s = provider();
  const existing = { id: 'ride-active-99', status: 'PAYMENT_CONFIRMED', createdAt: '2026-10-22T10:00:00Z' };
  s.api.getRide = async (_token, id) => {
    assert.equal(id, 'ride-active-99');
    return existing;
  };
  s.api.getRideEvents = async () => [];
  s.api.createRide = async () => {
    const err = new Error('ACTIVE_RIDE_EXISTS: Rider already has an active ride.');
    err.name = 'ApiError';
    err.status = 409;
    err.code = 'CONFLICT';
    err.details = { code: 'ACTIVE_RIDE_EXISTS', rideId: 'ride-active-99', status: 'PAYMENT_CONFIRMED' };
    throw err;
  };

  await assert.rejects(
    s.render().createRide({
      quoteToken: 'qt',
      proposedFarePaise: 9000,
      passenger: { name: 'Rider', phoneE164: '+919876543210' },
      vehicleCategory: 'CAB',
      pickup: { lat: 26.71, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
    }),
    /ACTIVE_RIDE_EXISTS/,
  );
  assert.equal(s.render().activeRide?.id, 'ride-active-99');

  // Transitioning active ride to PAYMENT_DISPUTED unblocks the rider immediately (D-043)
  s.api.disputePayment = async () => ({ ...existing, status: 'PAYMENT_DISPUTED' });
  await s.render().disputePayment('ride-active-99', 'Overcharged cash fare');
  assert.equal(s.render().activeRide, null);
});

test('claimCashPaid unblocks activeRide immediately on PAYMENT_CASH_CLAIMED while PAYMENT_UNPAID blocks', async () => {
  const s = provider();
  const pending = { id: 'ride-pay-1', status: 'PAYMENT_PENDING', createdAt: '2026-10-22T10:00:00Z' };
  s.api.listRides = async () => [pending];
  s.api.getRide = async () => pending;
  s.api.getRideEvents = async () => [];
  await s.render().refreshRides();
  assert.equal(s.render().activeRide?.id, 'ride-pay-1');

  s.api.claimCashPaid = async (_token, id) => ({ ...pending, id, status: 'PAYMENT_CASH_CLAIMED' });
  const claimed = await s.render().claimCashPaid('ride-pay-1');
  assert.equal(claimed.status, 'PAYMENT_CASH_CLAIMED');
  assert.equal(s.render().activeRide, null);
  assert.equal(s.render().rideHistory[0].status, 'PAYMENT_CASH_CLAIMED');

  const unpaid = { id: 'ride-unpaid-2', status: 'PAYMENT_UNPAID', createdAt: '2026-10-22T11:00:00Z' };
  s.api.getRide = async () => unpaid;
  s.api.createRide = async () => {
    const err = new Error('ACTIVE_RIDE_EXISTS');
    err.name = 'ApiError';
    err.status = 409;
    err.details = { code: 'ACTIVE_RIDE_EXISTS', rideId: 'ride-unpaid-2', status: 'PAYMENT_UNPAID' };
    throw err;
  };
  await assert.rejects(
    s.render().createRide({
      quoteToken: 'qt',
      proposedFarePaise: 9000,
      passenger: { name: 'Rider', phoneE164: '+919876543210' },
      vehicleCategory: 'CAB',
      pickup: { lat: 26.71, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
    }),
    /ACTIVE_RIDE_EXISTS/,
  );
  assert.equal(s.render().activeRide?.id, 'ride-unpaid-2');
  assert.equal(s.render().activeRide?.status, 'PAYMENT_UNPAID');
});

test('loadOlderRides appends older pages with offset and deduplicates overlapping ride IDs', async () => {
  const s = provider();
  const firstPage = Array.from({ length: 40 }, (_, i) => ({
    id: `ride-${40 - i}`,
    status: 'SETTLED',
    createdAt: new Date(Date.UTC(2026, 9, 25, 12, 40 - i)).toISOString(),
  }));
  const calls = [];
  s.api.listRides = async (_token, opts) => {
    calls.push(opts);
    if (!opts?.offset) return firstPage;
    return [
      firstPage[firstPage.length - 1], // overlap on boundary
      { id: 'ride-0', status: 'CANCELLED', createdAt: '2026-10-25T11:00:00.000Z' },
    ];
  };

  await s.render().refreshRides();
  assert.equal(s.render().hasMoreRides, true);
  assert.equal(s.render().rideHistory.length, 40);

  await s.render().loadOlderRides();
  assert.equal(calls[1]?.limit, 40);
  assert.equal(calls[1]?.offset, 40);
  assert.equal(s.render().rideHistory.length, 41);
  assert.equal(s.render().rideHistory[40].id, 'ride-0');
  assert.equal(s.render().hasMoreRides, false);
});
