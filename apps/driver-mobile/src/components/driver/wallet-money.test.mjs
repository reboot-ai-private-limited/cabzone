import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const ts = createRequire(import.meta.url)('typescript');
const compile = (name) =>
  ts.transpileModule(readFileSync(new URL(name, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
const helpers = { exports: {} };
vm.runInNewContext(compile('./wallet-money-helpers.ts'), { exports: helpers.exports });
const flush = () => new Promise(setImmediate);

function screen() {
  const state = [],
    effects = [],
    calls = [];
  let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: (initial) => {
      const i = cursor++;
      if (!(i in state)) state[i] = initial;
      return [
        state[i],
        (value) => {
          state[i] = typeof value === 'function' ? value(state[i]) : value;
        },
      ];
    },
    useRef: (initial) => {
      const i = cursor++;
      if (!(i in state)) state[i] = { current: initial };
      return state[i];
    },
    useCallback: (fn) => fn,
    useEffect: (fn) => effects.push(fn),
  };
  const api = {
    activity: async () => ({
      availableCashoutPaise: 30000,
      earningsBalancePaise: 20000,
      commissionBalancePaise: 10000,
      pendingCashoutPaise: 0,
      operations: [],
    }),
    recharge: async (...args) => {
      calls.push(['recharge', ...args]);
      return { operation: { status: 'CREATED' }, checkoutUrl: 'https://example.test/checkout' };
    },
    cashout: async (...args) => {
      calls.push(['cashout', ...args]);
      return {};
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compile('./wallet-money-panel.tsx'), {
    exports: module.exports,
    Error,
    setInterval: () => 1,
    clearInterval() {},
    require: (name) => {
      if (name === 'react') return React;
      if (name === 'react-native')
        return {
          StyleSheet: { create: (v) => v },
          Platform: { OS: 'android' },
          Linking: { openURL: async (url) => calls.push(['open', url]) },
          AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
        };
      if (name.includes('auth-context')) return { useAuth: () => ({ token: 'token' }) };
      if (name.includes('duty-context'))
        return { useDuty: () => ({ refreshSummary: async () => {} }) };
      if (name.includes('services/api')) return { walletApi: api };
      if (name.includes('wallet-money-helpers')) return helpers.exports;
      return { createStyles: (factory) => factory(), colors: {} };
    },
  });
  return {
    api,
    calls,
    render() {
      cursor = 0;
      return module.exports.WalletMoneyPanel({});
    },
    runEffects() {
      effects.splice(0).forEach((fn) => fn());
    },
  };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of (node.children ?? []).flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}
const button = (tree, text) =>
  find(
    tree,
    (node) =>
      node.props.accessibilityRole === 'button' &&
      find(node, (child) => child.children.includes(text)),
  );
const input = (tree, name) => find(tree, (node) => node.props.accessibilityLabel === name);

test('parses rupees without floating-point rounding or invalid notation', () => {
  for (const [value, paise] of [
    ['100', 10000],
    ['1.01', 101],
    ['0.29', 29],
    ['100000.00', 10000000],
  ])
    assert.equal(helpers.exports.walletAmountPaise(value), paise);
  for (const value of ['', '0', '-1', '1e3', '100.001', '100001', 'NaN'])
    assert.equal(helpers.exports.walletAmountPaise(value), null);
});

test('opens checkout without claiming a credit and creates a new key for another recharge', async () => {
  const s = screen();
  s.render();
  s.runEffects();
  await flush();
  button(s.render(), 'Add money').props.onPress();
  button(s.render(), 'Continue to UPI test checkout').props.onPress();
  await flush();
  assert.equal(s.calls[0][0], 'recharge');
  assert.equal(s.calls[1][0], 'open');
  assert.ok(
    find(s.render(), (node) =>
      node.children.includes('Recharge saved. Your balance updates after payment is verified.'),
    ),
  );
  button(s.render(), 'Add money').props.onPress();
  button(s.render(), 'Continue to UPI test checkout').props.onPress();
  await flush();
  assert.notEqual(s.calls[0][3], s.calls[2][3]);
});

test('blocks invalid cashout amounts, keeps a stable key on retry, and ignores double taps', async () => {
  const s = screen();
  s.render();
  s.runEffects();
  await flush();
  button(s.render(), 'Cash out').props.onPress();
  input(s.render(), 'Amount in rupees').props.onChangeText('400');
  button(s.render(), 'Confirm cashout request').props.onPress();
  await flush();
  assert.equal(s.calls.length, 0);
  input(s.render(), 'Amount in rupees').props.onChangeText('250');
  input(s.render(), 'Cashout UPI ID').props.onChangeText('driver@upi');
  s.api.cashout = async (...args) => {
    s.calls.push(args);
    throw new Error('Connection lost');
  };
  const submit = button(s.render(), 'Confirm cashout request');
  submit.props.onPress();
  submit.props.onPress();
  await flush();
  assert.equal(s.calls.length, 1);
  button(s.render(), 'Confirm cashout request').props.onPress();
  await flush();
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[0][3], s.calls[1][3]);
});
