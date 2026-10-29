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
const helper = { exports: {} };
vm.runInNewContext(compile('./upi-intent.ts'), { exports: helper.exports, URL, Date, Error });
const intent = () => ({
  kind: 'intent',
  qrId: 'qr_shared',
  upiUrl: 'upi://pay?pa=cabzone%40bank&tr=shared&am=165.00&cu=INR',
  amountPaise: 16500,
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  testMode: false,
});

test('UPI handoff preserves provider reference, payee, and exact fare', () => {
  const session = intent();
  assert.equal(helper.exports.upiPaymentUrl(session, 'android'), session.upiUrl);
  assert.equal(
    helper.exports.upiPaymentUrl(session, 'ios'),
    session.upiUrl.replace('upi://', 'gpay://upi/'),
  );
  for (const override of [
    { upiUrl: 'https://evil.test' },
    { amountPaise: 100 },
    { expiresAt: 'invalid' },
    { expiresAt: new Date(0).toISOString() },
    { testMode: true },
  ]) {
    assert.throws(() => helper.exports.upiPaymentUrl({ ...session, ...override }, 'android'));
  }
});

function screen(extraProps = {}) {
  const state = [],
    effects = [],
    calls = [],
    timers = [];
  let cursor = 0,
    resume;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [
        state[index],
        (value) => {
          state[index] = typeof value === 'function' ? value(state[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
    useEffect: (fn) => effects.push(fn),
  };
  const api = {
    upiPaymentStatus: async () => ({ paid: false }),
    createUpiSession: async () => intent(),
  };
  const linking = {
    openURL: async (url) => {
      calls.push(url);
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compile('./upi-payment-panel.tsx'), {
    exports: module.exports,
    Error,
    setInterval: (fn) => {
      timers.push(fn);
      return 1;
    },
    clearInterval() {},
    require: (name) => {
      if (name === 'react') return React;
      if (name === 'react-native')
        return {
          Linking: linking,
          Platform: { OS: 'android' },
          StyleSheet: { create: (v) => v },
          AppState: {
            currentState: 'active',
            addEventListener: (_, fn) => {
              resume = fn;
              return { remove() {} };
            },
          },
        };
      if (name.includes('auth-context')) return { useAuth: () => ({ token: 'token' }) };
      if (name.includes('services/api')) return { riderRidesApi: api };
      if (name.includes('rider-helpers')) return { formatRupeesFromPaise: (p) => `₹${p / 100}` };
      if (name.includes('upi-intent')) return helper.exports;
      if (name.includes('upi-checkout-html')) return { upiCheckoutHtml: () => '<html></html>' };
      if (name.includes('design-system'))
        return { colors: {}, radii: {}, spacing: {}, typography: {} };
      return {};
    },
  });
  return {
    api,
    linking,
    calls,
    render() {
      cursor = 0;
      return module.exports.UpiPaymentPanel({
        rideId: 'ride',
        amountPaise: 16500,
        onPaid: async () => {
          calls.push('paid');
        },
        ...extraProps,
      });
    },
    effects() {
      effects.splice(0).forEach((fn) => fn());
    },
    resume() {
      resume('active');
    },
    poll() {
      timers[0]();
    },
  };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of (node.children || []).flat(Infinity)) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}
const flush = () => new Promise(setImmediate);
const pay = (tree) => find(tree, (node) => node.props.accessibilityLabel === 'Pay by UPI');

test('launching and returning from UPI never marks payment paid without server confirmation', async () => {
  const s = screen();
  s.render();
  s.effects();
  await flush();
  pay(s.render()).props.onPress();
  await flush();
  assert.deepEqual(s.calls, [intent().upiUrl]);
  s.resume();
  await flush();
  assert.equal(s.calls.includes('paid'), false);
  s.api.upiPaymentStatus = async () => ({ paid: true });
  s.poll();
  await flush();
  assert.equal(s.calls.at(-1), 'paid');
});

test('a cancelled launch leaves payment pending and retry enabled', async () => {
  const s = screen();
  s.linking.openURL = async () => {
    throw new Error('Cancelled');
  };
  pay(s.render()).props.onPress();
  await flush();
  const tree = s.render();
  assert.equal(pay(tree).props.disabled, false);
  assert.ok(
    find(tree, (node) =>
      node.children.some(
        (child) => typeof child === 'string' && child.includes('No UPI app opened'),
      ),
    ),
  );
  assert.deepEqual(s.calls, []);
});

test('test sessions use simulated checkout without opening a real UPI app', async () => {
  const s = screen();
  s.api.createUpiSession = async () => ({
    kind: 'checkout',
    checkout: { orderId: 'order_test', testMode: true },
  });
  pay(s.render()).props.onPress();
  await flush();
  assert.deepEqual(s.calls, []);
  assert.ok(find(s.render(), (node) => node.props.visible === true));
});

test('test mode explains why it opens checkout instead of a real UPI app', async () => {
  const s = screen();
  s.api.upiPaymentStatus = async () => ({ paid: false, method: 'UPI', testMode: true });
  s.render();
  s.effects();
  await flush();
  assert.ok(find(s.render(), (node) => node.props.accessibilityLabel === 'Open UPI test checkout'));
  assert.deepEqual(s.calls, []);
});

test('rider can request cash but cannot confirm receiving it', async () => {
  const s = screen();
  s.api.switchToCash = async () => ({ paid: false, method: 'CASH', testMode: true });
  find(s.render(), (node) => node.props.accessibilityLabel === 'Change payment').props.onPress();
  find(s.render(), (node) => node.props.accessibilityLabel === 'Switch to cash').props.onPress();
  await flush();
  const tree = s.render();
  assert.equal(pay(tree), null);
  assert.ok(
    find(tree, (node) =>
      node.children.includes('Pay your driver in cash. Waiting for the driver to confirm receipt.'),
    ),
  );
  assert.deepEqual(s.calls, []);
});

test('reopening the payment panel restores cash selection without opening UPI', async () => {
  const s = screen();
  s.api.upiPaymentStatus = async () => ({ paid: false, method: 'CASH', testMode: true });
  s.render();
  s.effects();
  await flush();
  assert.equal(pay(s.render()), null);
  assert.deepEqual(s.calls, []);
});

test('itemizes fare + previous cancellation fee and hides cash option when cashAllowed is false', () => {
  const s = screen({
    amountPaise: 21500,
    farePaise: 16500,
    arrearsPaise: 5000,
    cashAllowed: false,
    cashBlockedReason:
      'Cash is unavailable while ₹50 in previous cancellation fees is due. Pay by UPI to clear arrears.',
  });
  const tree = s.render();
  assert.equal(
    find(tree, (node) => node.props.accessibilityLabel === 'Change payment'),
    null,
  );
  assert.ok(
    find(tree, (node) => node.children?.includes('Previous cancellation fee')),
  );
  assert.ok(
    find(tree, (node) =>
      node.children?.some(
        (child) => typeof child === 'string' && child.includes('Cash is unavailable while ₹50'),
      ),
    ),
  );
});
