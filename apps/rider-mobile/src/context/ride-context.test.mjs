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

const ACTIVE_STATUSES = new Set([
  'REQUESTED',
  'OFFERING',
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'TRIP_STARTED',
  'TRIP_COMPLETED',
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
]);

function provider(initialToken = 'token-1') {
  const states = [];
  const refs = [];
  let cursor = 0;
  let refCursor = 0;
  let value;
  const auth = { token: initialToken };
  const api = {
    listRides: async () => [],
    getRide: async (token, id) => ({ id, status: 'OFFERING', version: 1, createdAt: '2026-10-22T10:00:00Z' }),
    getRideEvents: async () => [],
    cancelRide: async (_token, id) => ({ id, status: 'CANCELLED', version: 5, createdAt: '2026-10-22T10:00:00Z' }),
  };
  const React = {
    createContext: () => ({ Provider: 'RideProvider' }),
    createElement: (_type, props) => {
      value = props.value;
    },
    useState: (initial) => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [
        states[index],
        (next) => {
          states[index] = typeof next === 'function' ? next(states[index]) : next;
        },
      ];
    },
    useRef: (initial) => {
      const index = refCursor++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    },
    useEffect: () => {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    exports: module.exports,
    require: (name) => {
      if (name === 'react') return React;
      if (name === 'react-native') return {};
      if (name === './auth-context') return { useAuth: () => auth };
      if (name === '@/services/api') {
        return {
          riderRidesApi: api,
          isApiError: (error) => error?.name === 'ApiError',
        };
      }
      if (name === '@/services/rider-helpers') {
        return {
          extractPendingDriverCounters: () => [],
          isRideActive: (status) => ACTIVE_STATUSES.has(status),
        };
      }
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  const render = () => {
    cursor = 0;
    refCursor = 0;
    module.exports.RideProvider({ children: null });
    return value;
  };
  return { auth, api, render };
}

test('background sync keeps cached rides on failure and clears its error after recovery', async () => {
  const s = provider();
  const ride = { id: 'ride-1', status: 'SETTLED', createdAt: '2026-10-22T10:00:00Z' };
  s.api.listRides = async () => [ride];
  await s.render().refreshRides();

  s.api.listRides = async () => {
    throw new Error('Network unavailable');
  };
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

test('holds isLoadingRides true on cold start until initial ride hydration settles and recovers every active status', async () => {
  const s = provider('token-relaunch');
  // Before refreshRides settles for token-relaunch, BootstrapIndexScreen must wait
  assert.equal(s.render().isLoadingRides, true);

  for (const [idx, status] of [
    'OFFERING',
    'DRIVER_ASSIGNED',
    'DRIVER_EN_ROUTE',
    'DRIVER_ARRIVED',
    'TRIP_STARTED',
    'PAYMENT_PENDING',
    'PAYMENT_CONFIRMED',
  ].entries()) {
    const version = idx + 1;
    const snapshot = {
      id: 'ride-relaunch',
      status,
      version,
      pickupOtp: '4821',
      createdAt: '2026-10-26T10:00:00Z',
    };
    s.api.listRides = async () => [{ ...snapshot, pickupOtp: undefined }];
    s.api.getRide = async () => snapshot;
    await s.render().refreshRides();
    const ctx = s.render();
    assert.equal(ctx.isLoadingRides, false);
    assert.equal(ctx.activeRide?.id, 'ride-relaunch');
    assert.equal(ctx.activeRide?.status, status);
    assert.equal(ctx.activeRide?.pickupOtp, '4821');
  }
});

test('ignores out-of-order lower-version responses and never resurrects a cancelled or settled ride', async () => {
  const s = provider();
  s.api.getRide = async () => ({
    id: 'ride-order',
    status: 'DRIVER_ARRIVED',
    version: 4,
    createdAt: '2026-10-26T10:00:00Z',
  });
  await s.render().refreshRideById('ride-order');
  assert.equal(s.render().activeRide?.status, 'DRIVER_ARRIVED');

  // Stale out-of-order response (version 3) arrives late and must be ignored
  s.api.getRide = async () => ({
    id: 'ride-order',
    status: 'DRIVER_EN_ROUTE',
    version: 3,
    createdAt: '2026-10-26T10:00:00Z',
  });
  await s.render().refreshRideById('ride-order');
  assert.equal(s.render().activeRide?.status, 'DRIVER_ARRIVED');
  assert.equal(s.render().activeRide?.version, 4);

  // Rider cancels ride (version 5) -> activeRide clears and rideHistory reflects CANCELLED
  s.api.cancelRide = async () => ({
    id: 'ride-order',
    status: 'CANCELLED',
    version: 5,
    createdAt: '2026-10-26T10:00:00Z',
  });
  await s.render().cancelRide('ride-order', 'RIDER_CHANGED_MIND');
  assert.equal(s.render().activeRide, null);
  assert.equal(s.render().rideHistory[0]?.status, 'CANCELLED');

  // Late listRides / getRide poll carrying pre-cancel version 4 cannot resurrect activeRide
  s.api.listRides = async () => [
    {
      id: 'ride-order',
      status: 'DRIVER_ARRIVED',
      version: 4,
      createdAt: '2026-10-26T10:00:00Z',
    },
  ];
  await s.render().refreshRides();
  assert.equal(s.render().activeRide, null);
  assert.equal(s.render().rideHistory[0]?.status, 'CANCELLED');
});
