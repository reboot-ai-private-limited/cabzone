import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
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
      const call = { url, authorization: options.headers.Authorization, body: options.body, method: options.method };
      calls.push(call);
      return runtime.respond(call);
    },
    require: (name) => {
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
