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
    require: (name) => {
      if (name === 'react') return React;
      if (name === 'react-native') return {};
      if (name === './auth-context') return { useAuth: () => ({ token: 'token-1' }) };
      if (name === '@/services/api') return { riderRidesApi: api, isApiError: (error) => error?.name === 'ApiError' };
      if (name === '@/services/rider-helpers') return {
        extractPendingDriverCounters: () => [],
        isRideActive: () => false,
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
