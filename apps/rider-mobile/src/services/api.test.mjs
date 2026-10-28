import './location-names.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const locationCode = ts.transpileModule(readFileSync(new URL('./location-names.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const locationNames = await import(`data:text/javascript;base64,${Buffer.from(locationCode).toString('base64')}`);
const code = ts.transpileModule(
  readFileSync(new URL('./api.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } },
).outputText;

const response = (data, status = 200) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => ({ success: status < 400, data, message: status === 401 ? 'Unauthorized' : undefined }),
});

function apiSession() {
  const storage = { access: 'old-access', refresh: 'refresh-1' };
  const calls = [];
  const published = [];
  const module = { exports: {} };
  const runtime = {
    exports: module.exports,
    process: { env: {} },
    URLSearchParams,
    fetch: async (url, options) => {
      const call = {
        url,
        authorization: options.headers.Authorization,
        headers: options.headers,
        body: options.body,
        method: options.method,
      };
      calls.push(call);
      return runtime.respond(call);
    },
    require: (name) => {
      if (name === './location-names' || name === '@/services/location-names') return locationNames;
      if (name === 'expo-constants') return { default: { expoConfig: {} }, __esModule: true };
      if (name === 'react-native') return { Platform: { OS: 'web' } };
      if (name === './storage') return {
        getAccessToken: async () => storage.access,
        getRefreshToken: async () => storage.refresh,
        getOrCreateDeviceId: async () => 'device-1',
        saveAuthTokens: async (access, refresh) => {
          storage.access = access;
          storage.refresh = refresh;
        },
      };
      throw new Error(`Unexpected module: ${name}`);
    },
    respond: async ({ url, authorization }) => {
      if (url.endsWith('/auth/refresh')) return response({ accessToken: 'new-access', refreshToken: 'refresh-2' });
      return authorization === 'Bearer old-access' ? response(null, 401) : response({ id: 'ride-1' });
    },
  };
  vm.runInNewContext(code, runtime);
  module.exports.subscribeAccessToken((token) => published.push(token));
  return { ...module.exports, storage, calls, published, runtime };
}

test('a follow-up request with the pre-refresh token retries with the rotated token', async () => {
  const s = apiSession();
  await s.riderRidesApi.getRide('old-access', 'ride-1');
  const ride = await s.riderRidesApi.getRide('old-access', 'ride-1');
  assert.equal(ride.id, 'ride-1');
  assert.equal(s.calls.filter((call) => call.url.endsWith('/auth/refresh')).length, 1);
  assert.equal(s.calls.at(-1).authorization, 'Bearer new-access');
});

test('simultaneous expired requests share one refresh', async () => {
  const s = apiSession();
  const rides = await Promise.all([
    s.riderRidesApi.getRide('old-access', 'ride-1'),
    s.riderRidesApi.getRide('old-access', 'ride-2'),
  ]);
  assert.equal(rides.length, 2);
  assert.equal(s.calls.filter((call) => call.url.endsWith('/auth/refresh')).length, 1);
});

test('a different login is never used to replay an old request', async () => {
  const s = apiSession();
  s.storage.access = 'other-account-access';
  s.storage.refresh = 'other-account-refresh';
  await assert.rejects(s.riderRidesApi.getRide('old-access', 'ride-1'), /Session changed/);
  assert.equal(s.calls.length, 1);
  assert.equal(s.published.length, 0);
});

test('a login change during refresh cannot overwrite the new credentials', async () => {
  const s = apiSession();
  const respond = s.runtime.respond;
  s.runtime.respond = async (call) => {
    if (call.url.endsWith('/auth/refresh')) {
      s.storage.access = 'other-account-access';
      s.storage.refresh = 'other-account-refresh';
    }
    return respond(call);
  };
  await assert.rejects(s.riderRidesApi.getRide('old-access', 'ride-1'), /Session changed/);
  assert.equal(s.storage.access, 'other-account-access');
  assert.equal(s.published.length, 0);
});

test('rejected refresh ends the current session', async () => {
  const s = apiSession();
  s.runtime.respond = async () => response(null, 401);
  await assert.rejects(s.riderRidesApi.getRide('old-access', 'ride-1'), /Unauthorized/);
  assert.equal(s.published.length, 1);
  assert.equal(s.published[0], null);
});

test('UPI verification sends only proof fields to the authenticated ride endpoint', async () => {
  const s = apiSession();
  s.runtime.respond = async () => response({ paid: true });
  await s.riderRidesApi.verifyUpiPayment('old-access', 'ride/1', {
    type: 'success', orderId: 'order_test', paymentId: 'pay_test', signature: 'a'.repeat(64),
  });
  const call = s.calls.at(-1);
  assert.ok(call.url.endsWith('/rides/ride%2F1/payment/upi/verify'));
  assert.equal(call.authorization, 'Bearer old-access');
  assert.equal(call.method, 'POST');
  assert.deepEqual(JSON.parse(call.body), { orderId: 'order_test', paymentId: 'pay_test', signature: 'a'.repeat(64) });
});

test('cancellation returns the enclosed ride so the active screen retains its pricing snapshot', async () => {
  const s = apiSession();
  const ride = { id: 'ride-1', status: 'CANCELLED', suggestedFarePaise: 8300,
    pricingSnapshot: { minimumFarePaise: 7000, negotiationFloorPercent: 80, negotiationCeilingPercent: 150 } };
  s.runtime.respond = async () => response({ ride, feeBreakdown: { cancellationFeePaise: 0 } });
  const cancelled = await s.riderRidesApi.cancelRide('old-access', 'ride-1', 'RIDER_CHANGED_MIND');
  assert.equal(cancelled.id, 'ride-1');
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.pricingSnapshot.minimumFarePaise, 7000);
  assert.equal(cancelled.suggestedFarePaise, 8300);
  assert.deepEqual(JSON.parse(s.calls.at(-1).body), { reason: 'RIDER_CHANGED_MIND' });
});

test('createRide forwards Idempotency-Key header and surfaces 409 ACTIVE_RIDE_EXISTS details', async () => {
  const s = apiSession();
  s.runtime.respond = async () => ({
    status: 409,
    ok: false,
    json: async () => ({
      success: false,
      statusCode: 409,
      code: 'CONFLICT',
      message: 'ACTIVE_RIDE_EXISTS: Rider already has an active ride.',
      data: {
        code: 'ACTIVE_RIDE_EXISTS',
        rideId: 'ride-existing-1',
        status: 'OFFERING',
        ridePath: '/api/v1/rides/ride-existing-1',
      },
    }),
  });

  await assert.rejects(
    s.riderRidesApi.createRide('old-access', {
      quoteToken: 'qt-1',
      proposedFarePaise: 10000,
      idempotencyKey: 'idem_booking_01',
      passenger: { name: 'Priya', phoneE164: '+919000000003' },
      vehicleCategory: 'CAB',
      pickup: { lat: 26.71, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
    }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'CONFLICT');
      assert.deepEqual(err.details, {
        code: 'ACTIVE_RIDE_EXISTS',
        rideId: 'ride-existing-1',
        status: 'OFFERING',
        ridePath: '/api/v1/rides/ride-existing-1',
      });
      return true;
    },
  );

  const call = s.calls.at(-1);
  assert.equal(call.headers['Idempotency-Key'], 'idem_booking_01');
  assert.equal('idempotencyKey' in JSON.parse(call.body), false);
});
