import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(readFileSync(new URL('./ride-payment-qr.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
function screen() {
  const state = [], effects = [], calls = [];
  let cursor = 0;
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (initial) => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], (value) => { state[index] = value; }]; },
    useRef: (initial) => { const index = cursor++; if (!(index in state)) state[index] = { current: initial }; return state[index]; },
    useCallback: (fn) => fn, useEffect: (fn) => effects.push(fn) };
  const api = { getPaymentQr: async () => { calls.push('qr'); return { paid: false, imageDataUrl: 'data:image/png;base64,test', expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() }; }, checkUpiPayment: async () => ({ paid: false }) };
  const module = { exports: {} };
  vm.runInNewContext(code, { exports: module.exports, Error, setInterval: () => 1, clearInterval() {}, require: (name) => {
    if (name === 'react') return React;
    if (name === 'react-native') return { StyleSheet: { create: (v) => v }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } };
    if (name.includes('auth-context')) return { useAuth: () => ({ token: 'token' }) };
    if (name.includes('services/api')) return { ridesApi: api };
    return { colors: {} };
  } });
  return { api, calls, render() { cursor = 0; return module.exports.RidePaymentQr({ rideId: 'ride', amountPaise: 16500, onPaid: async () => calls.push('paid') }); }, runEffects() { effects.splice(0).forEach((fn) => fn()); } };
}
function find(node, predicate) { if (!node || typeof node !== 'object') return null; if (predicate(node)) return node; for (const child of (node.children || []).flat(Infinity)) { const result = find(child, predicate); if (result) return result; } return null; }
const label = (tree, value) => find(tree, (node) => node.props.accessibilityLabel === value);
const flush = () => new Promise(setImmediate);

test('pending payment has QR and status actions; QR failure permits retry', async () => {
  const s = screen(); let tree = s.render();
  assert.ok(label(tree, 'Show payment QR')); assert.ok(label(tree, 'Check payment status'));
  s.api.getPaymentQr = async () => { throw new Error('Network unavailable'); };
  await label(tree, 'Show payment QR').props.onPress(); await flush();
  tree = s.render(); assert.equal(label(tree, 'Show payment QR').props.disabled, false);
  assert.ok(find(tree, (node) => node.children.includes('Network unavailable')));
  s.api.getPaymentQr = async () => ({ paid: false, imageDataUrl: 'data:image/png;base64,test', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  label(tree, 'Show payment QR').props.onPress(); await flush();
  assert.ok(label(s.render(), 'Refresh payment QR'));
});

test('status only advances the driver after backend confirmation', async () => {
  const s = screen();
  label(s.render(), 'Check payment status').props.onPress(); await flush();
  assert.deepEqual(s.calls, []);
  s.api.checkUpiPayment = async () => ({ paid: true });
  label(s.render(), 'Check payment status').props.onPress(); await flush();
  assert.deepEqual(s.calls, ['paid']);
});

test('a background status request cannot block showing the QR', async () => {
  const s = screen(); let finish;
  s.api.checkUpiPayment = () => new Promise((resolve) => { finish = resolve; });
  s.render(); s.runEffects();
  label(s.render(), 'Show payment QR').props.onPress(); await flush();
  assert.deepEqual(s.calls, ['qr']);
  assert.ok(label(s.render(), 'Refresh payment QR'));
  finish({ paid: false }); await flush();
});
