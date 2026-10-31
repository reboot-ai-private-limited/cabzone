import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function transpile(relativePath) {
  return ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
}

const sheetCode = transpile('./ride-payment-qr-sheet.tsx');
const cardCode = transpile('./ride-payment-qr.tsx');

function createHarness({ screenWidth = 360 } = {}) {
  const states = new Map();
  let componentStack = [];
  const pendingEffects = [];
  const cleanups = new Map();
  const prevDeps = new Map();
  const intervals = new Map();
  const timeouts = new Map();
  let nextTimerId = 1;
  const vibrations = [];
  const calls = [];
  let nowMs = Date.parse('2026-10-30T11:00:00.000Z');

  const RealDate = Date;
  const MockDate = Object.assign(
    function (...args) {
      return args.length === 0 ? new RealDate(nowMs) : new RealDate(...args);
    },
    {
      now: () => nowMs,
      parse: (s) => RealDate.parse(s),
      UTC: RealDate.UTC,
    },
  );
  MockDate.prototype = RealDate.prototype;

  function currentScope() {
    return componentStack[componentStack.length - 1];
  }

  const QRCodeComponent = function QRCodeMock(props) {
    return { type: 'QRCode', props: props || {}, children: [] };
  };

  function expandElement(type, props, children) {
    const mergedProps = { ...(props || {}) };
    if (children.length > 0 && mergedProps.children === undefined) {
      mergedProps.children = children.length === 1 ? children[0] : children;
    }
    if (typeof type === 'function') {
      const compId = `${type.name || 'Anon'}:${componentStack.map((s) => `${s.id}#${s.childIdx}`).join('/')}`;
      if (componentStack.length > 0) {
        componentStack[componentStack.length - 1].childIdx += 1;
      }
      componentStack.push({ id: compId, hookIdx: 0, childIdx: 0 });
      try {
        const rendered = type(mergedProps);
        return {
          type: type.name || 'Component',
          props: mergedProps,
          children: rendered ? [rendered] : [],
        };
      } finally {
        componentStack.pop();
      }
    }
    return { type, props: mergedProps, children };
  }

  let stateDirty = false;

  const React = {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => expandElement(type, props, children),
    useState: (initial) => {
      const scope = currentScope();
      const key = `${scope.id}:state:${scope.hookIdx++}`;
      if (!states.has(key)) {
        states.set(key, typeof initial === 'function' ? initial() : initial);
      }
      const setter = (next) => {
        const prev = states.get(key);
        const resolved = typeof next === 'function' ? next(prev) : next;
        if (!Object.is(prev, resolved)) {
          states.set(key, resolved);
          stateDirty = true;
        }
      };
      return [states.get(key), setter];
    },
    useRef: (initial) => {
      const scope = currentScope();
      const key = `${scope.id}:ref:${scope.hookIdx++}`;
      if (!states.has(key)) {
        states.set(key, { current: initial });
      }
      return states.get(key);
    },
    useCallback: (fn, deps) => {
      const scope = currentScope();
      const key = `${scope.id}:cb:${scope.hookIdx++}`;
      const prev = states.get(key);
      if (!prev || depsChanged(prev.deps, deps)) {
        states.set(key, { fn, deps });
        return fn;
      }
      return prev.fn;
    },
    useEffect: (fn, deps) => {
      const scope = currentScope();
      const key = `${scope.id}:effect:${scope.hookIdx++}`;
      pendingEffects.push({ key, fn, deps });
    },
  };

  const defaultRide = {
    id: 'ride-1',
    status: 'PAYMENT_PENDING',
    version: 3,
    agreedFarePaise: 16500,
    suggestedFarePaise: 16500,
    proposedFarePaise: 16500,
  };

  const api = {
    createPaymentQr: async (_token, rideId) => {
      calls.push(`create:${rideId}`);
      return {
        ride: { ...defaultRide, id: rideId },
        qr: {
          state: 'PENDING',
          upiUri: 'upi://pay?pa=cabzone@upi&am=165.00&cu=INR',
          imageUrl: 'https://rzp.io/i/poster-test',
          expiresAt: new RealDate(nowMs + 15 * 60_000).toISOString(),
          amountPaise: 16500,
          lines: [{ label: 'Trip fare', amountPaise: 16500 }],
        },
      };
    },
    pollPaymentQr: async (_token, rideId) => {
      calls.push(`poll:${rideId}`);
      return {
        ride: { ...defaultRide, id: rideId },
        qr: {
          state: 'PENDING',
          upiUri: 'upi://pay?pa=cabzone@upi&am=165.00&cu=INR',
          imageUrl: 'https://rzp.io/i/poster-test',
          expiresAt: new RealDate(nowMs + 15 * 60_000).toISOString(),
          amountPaise: 16500,
          lines: [{ label: 'Trip fare', amountPaise: 16500 }],
        },
      };
    },
    switchToCash: async (_token, rideId) => {
      calls.push(`cash:${rideId}`);
      return { paid: false, method: 'CASH', testMode: true, requiresReview: false };
    },
    checkUpiPayment: async (_token, rideId) => {
      calls.push(`checkUpi:${rideId}`);
      return { paid: false, testMode: true, requiresReview: false };
    },
  };

  const rnMock = {
    ActivityIndicator: 'ActivityIndicator',
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    Dimensions: { get: () => ({ width: screenWidth, height: 800 }) },
    Image: 'Image',
    Modal: 'Modal',
    Platform: { OS: 'android' },
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    StyleSheet: {
      absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
      create: (v) => v,
    },
    Text: 'Text',
    Vibration: {
      vibrate: (pattern) => vibrations.push(pattern),
    },
    View: 'View',
  };

  const sandboxBase = {
    Date: MockDate,
    Error,
    Math,
    Number,
    Object,
    Promise,
    String,
    Boolean,
    Array,
    setInterval: (fn, ms) => {
      const id = nextTimerId++;
      intervals.set(id, { fn, ms });
      return id;
    },
    clearInterval: (id) => {
      intervals.delete(id);
    },
    setTimeout: (fn, ms) => {
      const id = nextTimerId++;
      timeouts.set(id, { fn, ms });
      return id;
    },
    clearTimeout: (id) => {
      timeouts.delete(id);
    },
  };

  const sheetModule = { exports: {} };
  vm.runInNewContext(sheetCode, {
    ...sandboxBase,
    module: sheetModule,
    exports: sheetModule.exports,
    require: (name) => {
      if (name === 'react') return React;
      if (name === 'react-native') return rnMock;
      if (name === 'react-native-qrcode-svg') return { __esModule: true, default: QRCodeComponent };
      if (name.includes('auth-context')) return { useAuth: () => ({ token: 'token-123' }) };
      if (name.includes('services/api')) return { ridesApi: api };
      if (name.includes('design-system'))
        return {
          colors: {
            deepBrown: '#3A2414',
            amber: '#FBBF24',
            white: '#FFFFFF',
            border: '#E5E5E5',
            secondary: '#705746',
            brandBrown: '#B45309',
            error: '#B42318',
          },
        };
      throw new Error(`Unexpected require in sheet: ${name}`);
    },
  });

  const cardModule = { exports: {} };
  vm.runInNewContext(cardCode, {
    ...sandboxBase,
    module: cardModule,
    exports: cardModule.exports,
    require: (name) => {
      if (name === 'react') return React;
      if (name === 'react-native') return rnMock;
      if (name.includes('ride-payment-qr-sheet')) return sheetModule.exports;
      if (name.includes('auth-context')) return { useAuth: () => ({ token: 'token-123' }) };
      if (name.includes('services/api')) return { ridesApi: api };
      if (name.includes('design-system'))
        return {
          colors: {
            deepBrown: '#3A2414',
            amber: '#FBBF24',
            white: '#FFFFFF',
            border: '#E5E5E5',
            secondary: '#705746',
            brandBrown: '#B45309',
            error: '#B42318',
          },
        };
      throw new Error(`Unexpected require in card: ${name}`);
    },
  });

  function depsChanged(prev, next) {
    if (!prev || !next) return true;
    if (prev.length !== next.length) return true;
    for (let i = 0; i < prev.length; i++) {
      if (!Object.is(prev[i], next[i])) return true;
    }
    return false;
  }

  function flushEffects(seenKeys) {
    const batch = pendingEffects.splice(0);
    // Clean up effects for components that unmounted during this render pass
    for (const [key, cleanup] of [...cleanups.entries()]) {
      if (!seenKeys.has(key)) {
        cleanups.delete(key);
        prevDeps.delete(key);
        if (typeof cleanup === 'function') cleanup();
      }
    }
    for (const item of batch) {
      if (depsChanged(prevDeps.get(item.key), item.deps)) {
        const priorCleanup = cleanups.get(item.key);
        if (typeof priorCleanup === 'function') priorCleanup();
        prevDeps.set(item.key, item.deps);
        const nextCleanup = item.fn();
        if (typeof nextCleanup === 'function') {
          cleanups.set(item.key, nextCleanup);
        } else {
          cleanups.delete(item.key);
        }
      }
    }
  }

  function renderRoot(Component, props) {
    let tree;
    for (let pass = 0; pass < 4; pass++) {
      stateDirty = false;
      pendingEffects.length = 0;
      componentStack = [];
      tree = expandElement(Component, props, []);
      const seenKeys = new Set(pendingEffects.map((e) => e.key));
      flushEffects(seenKeys);
      if (!stateDirty) break;
    }
    return tree;
  }

  return {
    api,
    calls,
    intervals,
    timeouts,
    vibrations,
    sheetExports: sheetModule.exports,
    cardExports: cardModule.exports,
    advanceClock(ms) {
      nowMs += ms;
    },
    getNowIso(offsetMs = 0) {
      return new RealDate(nowMs + offsetMs).toISOString();
    },
    renderCard(overrides = {}) {
      return renderRoot(cardModule.exports.RidePaymentQr, {
        rideId: 'ride-1',
        amountPaise: 16500,
        onPaid: async () => calls.push('paid'),
        onCashReceived: async () => calls.push('cashConfirmed'),
        ...overrides,
      });
    },
    renderSheet(overrides = {}) {
      return renderRoot(sheetModule.exports.RidePaymentQrSheet, {
        visible: true,
        rideId: 'ride-1',
        onRide: (r) => calls.push(`onRide:${r.status}`),
        onClose: () => calls.push('onClose'),
        onCash: () => calls.push('onCash'),
        ...overrides,
      });
    },
    unmountAll() {
      for (const cleanup of cleanups.values()) {
        if (typeof cleanup === 'function') cleanup();
      }
      cleanups.clear();
      prevDeps.clear();
    },
    fireIntervals(msFilter) {
      for (const [, entry] of [...intervals.entries()]) {
        if (msFilter === undefined || entry.ms === msFilter) {
          entry.fn();
        }
      }
    },
    fireTimeouts(msFilter) {
      for (const [id, entry] of [...timeouts.entries()]) {
        if (msFilter === undefined || entry.ms === msFilter) {
          timeouts.delete(id);
          entry.fn();
        }
      }
    },
  };
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of (node.children || []).flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}

function findAll(node, predicate, acc = []) {
  if (!node || typeof node !== 'object') return acc;
  if (predicate(node)) acc.push(node);
  for (const child of (node.children || []).flat(Infinity)) {
    findAll(child, predicate, acc);
  }
  return acc;
}

const byLabel = (tree, value) =>
  find(tree, (node) => node.props && node.props.accessibilityLabel === value);
const hasText = (tree, text) =>
  find(tree, (node) =>
    (node.children || []).flat(Infinity).some((c) => typeof c === 'string' && c.includes(text)),
  );
const flush = () => new Promise(setImmediate);

test('Lazy QR: mounting RidePaymentQr never generates or polls /payment-qr until Show QR is tapped', async () => {
  const h = createHarness({ screenWidth: 360 });
  let rejectFirst = true;
  h.api.createPaymentQr = async (_token, rideId) => {
    h.calls.push(`create:${rideId}`);
    if (rejectFirst) {
      rejectFirst = false;
      throw new Error('Could not generate a UPI QR code right now.');
    }
    return {
      ride: { id: rideId, status: 'PAYMENT_PENDING', version: 3 },
      qr: {
        state: 'PENDING',
        upiUri: 'upi://pay?pa=cabzone@upi&am=215.00&cu=INR',
        imageUrl: 'https://rzp.io/i/poster',
        expiresAt: h.getNowIso(15 * 60_000),
        amountPaise: 21500,
        lines: [
          { label: 'Trip fare', amountPaise: 16500 },
          { label: 'Prior cancellation fee', amountPaise: 5000 },
        ],
      },
    };
  };

  let tree = h.renderCard({ amountPaise: 21500, farePaise: 16500, arrearsPaise: 5000 });
  assert.ok(byLabel(tree, 'Show QR'));
  assert.ok(byLabel(tree, 'Cash received'));
  // Zero QR endpoints called before tapping Show QR, even if timers fire
  assert.deepEqual(h.calls, []);
  assert.equal(h.intervals.size, 0);
  h.fireIntervals();
  await flush();
  assert.deepEqual(h.calls, []);

  // Tap Show QR -> opens sheet -> triggers createPaymentQr
  byLabel(tree, 'Show QR').props.onPress();
  tree = h.renderCard({ amountPaise: 21500, farePaise: 16500, arrearsPaise: 5000 });
  // Before async resolves, spinner copy is shown
  assert.ok(hasText(tree, 'Making the QR code…'));

  await flush();
  tree = h.renderCard({ amountPaise: 21500, farePaise: 16500, arrearsPaise: 5000 });
  assert.ok(hasText(tree, 'Could not generate a UPI QR code right now.'));
  assert.ok(byLabel(tree, 'Try again'));

  // Tap Try again -> succeeds and renders SVG QR + multi-line breakdown
  byLabel(tree, 'Try again').props.onPress();
  await flush();
  tree = h.renderCard({ amountPaise: 21500, farePaise: 16500, arrearsPaise: 5000 });

  const qrSvg = find(tree, (n) => n.type === 'QRCode');
  assert.ok(qrSvg);
  assert.equal(qrSvg.props.value, 'upi://pay?pa=cabzone@upi&am=215.00&cu=INR');
  assert.equal(qrSvg.props.ecl, 'M');
  assert.equal(qrSvg.props.color, '#000000');
  assert.equal(qrSvg.props.backgroundColor, '#FFFFFF');
  assert.equal(qrSvg.props.size, 296); // min(360 - 64, 300)

  assert.ok(hasText(tree, 'Customer pays ₹215'));
  assert.ok(hasText(tree, 'Trip fare'));
  assert.ok(hasText(tree, 'Prior cancellation fee'));
  assert.ok(hasText(tree, 'Waiting for payment…'));
  assert.ok(hasText(tree, '15:00'));

  h.unmountAll();
});

test('image_url fallback crops Razorpay tall poster (~674x1644) without distorting aspect ratio and updates on Image onLoad', async () => {
  const h = createHarness({ screenWidth: 400 });
  const { computePosterCrop, RAZORPAY_POSTER_INITIAL_RATIO } = h.sheetExports;

  const initialCrop = computePosterCrop(246, RAZORPAY_POSTER_INITIAL_RATIO);
  assert.ok(Math.abs(initialCrop.imageWidth - 300) < 0.01); // 246 / 0.82 = 300
  assert.ok(
    Math.abs(initialCrop.imageHeight / initialCrop.imageWidth - 1644 / 674) < 0.0001,
    'aspect ratio must never be distorted',
  );
  assert.ok(Math.abs(initialCrop.marginTop + initialCrop.imageHeight * 0.17) < 0.01);
  assert.ok(Math.abs(initialCrop.marginBottom + initialCrop.imageHeight * 0.1) < 0.01);
  assert.ok(Math.abs(initialCrop.marginLeft + initialCrop.imageWidth * 0.09) < 0.01);
  assert.ok(Math.abs(initialCrop.marginRight + initialCrop.imageWidth * 0.09) < 0.01);

  h.api.createPaymentQr = async (_token, rideId) => ({
    ride: { id: rideId, status: 'PAYMENT_PENDING', version: 3 },
    qr: {
      state: 'PENDING',
      upiUri: null,
      imageUrl: 'https://rzp.io/i/tall-poster.png',
      expiresAt: h.getNowIso(15 * 60_000),
      amountPaise: 16500,
      lines: [{ label: 'Trip fare', amountPaise: 16500 }],
    },
  });

  let tree = h.renderSheet();
  await flush();
  tree = h.renderSheet();

  assert.equal(find(tree, (n) => n.type === 'QRCode'), null);
  const img = byLabel(tree, 'UPI payment QR poster');
  assert.ok(img);
  assert.equal(img.props.resizeMode, 'contain');
  const ratioBefore = img.props.style.height / img.props.style.width;
  assert.ok(Math.abs(ratioBefore - 1644 / 674) < 0.0001);

  // Simulate Image onLoad reporting actual 680x1700 (ratio = 2.5)
  img.props.onLoad({ nativeEvent: { source: { width: 680, height: 1700 } } });
  tree = h.renderSheet();
  const updatedImg = byLabel(tree, 'UPI payment QR poster');
  const ratioAfter = updatedImg.props.style.height / updatedImg.props.style.width;
  assert.ok(Math.abs(ratioAfter - 2.5) < 0.0001);

  h.unmountAll();
});

test('polls every 2s ONLY while PENDING, ignores failed polls, shows PAID green check + haptic, and closes after 1.6s', async () => {
  const h = createHarness();
  let pollAttempt = 0;
  h.api.pollPaymentQr = async (_token, rideId) => {
    pollAttempt += 1;
    h.calls.push(`poll#${pollAttempt}`);
    if (pollAttempt === 1) {
      throw new Error('Transient offline error');
    }
    return {
      ride: { id: rideId, status: 'SETTLED', version: 4 },
      qr: {
        state: 'PAID',
        upiUri: null,
        imageUrl: null,
        expiresAt: h.getNowIso(10 * 60_000),
        amountPaise: 16500,
        lines: [{ label: 'Trip fare', amountPaise: 16500 }],
      },
    };
  };

  let tree = h.renderSheet();
  await flush();
  tree = h.renderSheet();

  // 2000ms poll interval must be active while PENDING
  const activePollTimers = [...h.intervals.values()].filter((i) => i.ms === 2000);
  assert.equal(activePollTimers.length, 1);

  // Poll #1 throws -> ignored, stays PENDING
  h.fireIntervals(2000);
  await flush();
  tree = h.renderSheet();
  assert.ok(hasText(tree, 'Waiting for payment…'));

  // Poll #2 returns PAID -> stops 2s poll, shows ₹165 received, vibrates once, schedules 1600ms close
  h.fireIntervals(2000);
  await flush();
  tree = h.renderSheet();

  assert.ok(hasText(tree, '₹165 received'));
  assert.ok(byLabel(tree, 'Payment received check'));
  assert.equal(h.vibrations.length, 1);
  assert.equal(
    [...h.intervals.values()].filter((i) => i.ms === 2000).length,
    0,
    'must stop 2s polling once PAID',
  );
  assert.ok(h.calls.includes('onRide:SETTLED'));
  assert.ok(!h.calls.includes('onClose'));

  // Fire 1600ms auto-close timeout
  h.fireTimeouts(1600);
  assert.ok(h.calls.includes('onClose'));

  h.unmountAll();
});

test('local countdown reaching 0 marks QR EXPIRED, covers QR so it never looks scannable, and offers Generate new QR', async () => {
  const h = createHarness();
  h.api.createPaymentQr = async (_token, rideId) => {
    h.calls.push(`create:${rideId}`);
    return {
      ride: { id: rideId, status: 'PAYMENT_PENDING', version: 3 },
      qr: {
        state: 'PENDING',
        upiUri: 'upi://pay?pa=cabzone@upi&am=165.00&cu=INR',
        imageUrl: 'https://rzp.io/i/poster',
        expiresAt: h.getNowIso(2_000),
        amountPaise: 16500,
        lines: [{ label: 'Trip fare', amountPaise: 16500 }],
      },
    };
  };
  h.api.pollPaymentQr = async (_token, rideId) => {
    h.calls.push(`expiryPoll:${rideId}`);
    return {
      ride: { id: rideId, status: 'PAYMENT_PENDING', version: 3 },
      qr: {
        state: 'EXPIRED',
        upiUri: null,
        imageUrl: null,
        expiresAt: h.getNowIso(0),
        amountPaise: 16500,
        lines: [{ label: 'Trip fare', amountPaise: 16500 }],
      },
    };
  };

  let tree = h.renderSheet();
  await flush();
  tree = h.renderSheet();
  assert.ok(find(tree, (n) => n.type === 'QRCode'));

  // Advance clock past expiry and tick 1s countdown
  h.advanceClock(3_000);
  h.fireIntervals(1000);
  tree = h.renderSheet();

  // Expired QR must NEVER render QRCode or Image!
  assert.equal(find(tree, (n) => n.type === 'QRCode'), null);
  assert.equal(byLabel(tree, 'UPI payment QR poster'), null);
  assert.ok(byLabel(tree, 'QR expired'));
  assert.ok(hasText(tree, 'QR expired'));
  assert.ok(byLabel(tree, 'Generate new QR'));
  await flush();
  assert.ok(h.calls.includes('expiryPoll:ride-1'));

  // Tapping "Generate new QR" creates a fresh live QR
  h.api.createPaymentQr = async (_token, rideId) => {
    h.calls.push(`recreate:${rideId}`);
    return {
      ride: { id: rideId, status: 'PAYMENT_PENDING', version: 3 },
      qr: {
        state: 'PENDING',
        upiUri: 'upi://pay?pa=cabzone@upi&am=165.00&cu=INR&attempt=2',
        imageUrl: null,
        expiresAt: h.getNowIso(15 * 60_000),
        amountPaise: 16500,
        lines: [{ label: 'Trip fare', amountPaise: 16500 }],
      },
    };
  };
  byLabel(tree, 'Generate new QR').props.onPress();
  await flush();
  tree = h.renderSheet();
  const freshQr = find(tree, (n) => n.type === 'QRCode');
  assert.ok(freshQr);
  assert.equal(freshQr.props.value, 'upi://pay?pa=cabzone@upi&am=165.00&cu=INR&attempt=2');

  h.unmountAll();
});

test('Cash received settles in 1 confirmation step, supports PAYMENT_CASH_CLAIMED, and exposes Rider didn\'t pay escape hatch', async () => {
  const h = createHarness();
  let tree = h.renderCard({
    rideStatus: 'PAYMENT_CASH_CLAIMED',
    farePaise: 16500,
    arrearsPaise: 5000,
    commissionPaise: 1320,
    amountPaise: 21500,
    onMarkUnpaid: async () => h.calls.push('markedUnpaid'),
  });

  assert.ok(hasText(tree, 'Passenger marked cash paid'));
  assert.ok(hasText(tree, 'Rider prior cancellation fee'));
  assert.ok(byLabel(tree, 'Cash received'));
  assert.ok(byLabel(tree, "Rider didn't pay"));

  // Direct 1-step cash confirmation without touching /payment-qr or /payment/cash
  byLabel(tree, 'Cash received').props.onPress();
  tree = h.renderCard({
    rideStatus: 'PAYMENT_CASH_CLAIMED',
    amountPaise: 21500,
    onMarkUnpaid: async () => h.calls.push('markedUnpaid'),
  });
  byLabel(tree, 'Confirm cash received').props.onPress();
  await flush();
  assert.deepEqual(h.calls, ['cashConfirmed', 'paid']);

  // Escape hatch: Rider didn't pay -> Confirm rider didn't pay
  byLabel(tree, "Rider didn't pay").props.onPress();
  tree = h.renderCard({
    rideStatus: 'PAYMENT_CASH_CLAIMED',
    amountPaise: 21500,
    onMarkUnpaid: async () => h.calls.push('markedUnpaid'),
  });
  byLabel(tree, "Confirm rider didn't pay").props.onPress();
  await flush();
  assert.equal(h.calls.at(-1), 'markedUnpaid');

  // Explicit cashAllowed=false prop still respected if passed
  const hBlocked = createHarness();
  const blockedTree = hBlocked.renderCard({
    amountPaise: 21500,
    cashAllowed: false,
    cashBlockedReason: 'Cash disabled override.',
  });
  assert.equal(byLabel(blockedTree, 'Cash received'), null);
  assert.equal(findAll(blockedTree, (n) => n.props?.accessibilityLabel === 'Cash received').length, 0);
  assert.ok(hasText(blockedTree, 'Cash disabled override.'));

  hBlocked.unmountAll();
  h.unmountAll();
});
