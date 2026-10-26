import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');

const compile = (relPath) =>
  ts.transpileModule(readFileSync(new URL(relPath, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;

const flush = async () => {
  await new Promise(setImmediate);
  await new Promise(setImmediate);
};

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of (node.children ?? []).flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}

function collectText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  return (node.children ?? []).map(collectText).join('');
}

const findButton = (tree, label) =>
  find(
    tree,
    (node) =>
      node.props?.accessibilityRole === 'button' &&
      (node.props?.accessibilityLabel === label || collectText(node).includes(label)),
  );

function makeSummary(overrides = {}) {
  return {
    period: 'TODAY',
    timezone: 'Asia/Kolkata',
    periodStart: '2026-10-25T18:30:00.000Z',
    periodEnd: '2026-10-26T10:00:00.000Z',
    totalAssignedRidesCount: 14,
    completedTripsCount: 12,
    cancelledTripsCount: 1,
    pendingPaymentTripsCount: 1,
    pendingPaymentGrossPaise: 18000,
    disputedTripsCount: 0,
    disputedGrossPaise: 0,
    grossFarePaise: 150000,
    cashGrossPaise: 100000,
    onlineGrossPaise: 50000,
    commissionChargedPaise: 12000,
    commissionRefundedPaise: 800,
    netCommissionPaise: 11200,
    netEarningsPaise: 138800,
    cancellationCompensationPaise: 2500,
    unreconciledRidesCount: 0,
    ...overrides,
  };
}

function makeRideItem(id, grossPaise, netPaise) {
  return {
    id,
    status: 'SETTLED',
    vehicleCategory: 'CAB',
    suggestedFarePaise: grossPaise,
    proposedFarePaise: grossPaise,
    agreedFarePaise: grossPaise,
    pricingSnapshot: { commissionPercent: 8 },
    routeSnapshot: { distanceM: 3500, durationSeconds: 600 },
    pickup: { lat: 26.72, lng: 88.43, address: 'Sevoke Road' },
    drop: { lat: 26.71, lng: 88.42, address: 'Hill Cart Road' },
    settledAt: '2026-10-26T08:00:00.000Z',
    completedAt: '2026-10-26T08:00:00.000Z',
    createdAt: '2026-10-26T07:45:00.000Z',
    driverSettlement: {
      grossPaise,
      commissionChargedPaise: grossPaise - netPaise,
      commissionRefundedPaise: 0,
      netCommissionPaise: grossPaise - netPaise,
      netEarningsPaise: netPaise,
      settledVia: 'CASH',
    },
  };
}

function createHarness(relPath, mocks) {
  const state = [];
  const effects = [];
  const effectDeps = [];
  let cursor = 0;

  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    Fragment: 'Fragment',
    useState: (initial) => {
      const i = cursor++;
      if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
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
    useMemo: (fn) => fn(),
    useEffect: (fn, deps) => {
      const i = cursor++;
      const prev = effectDeps[i];
      const changed =
        !prev || !deps || deps.length !== prev.length || deps.some((d, idx) => !Object.is(d, prev[idx]));
      if (changed) {
        effectDeps[i] = deps;
        effects.push(fn);
      }
    },
  };

  const mod = { exports: {} };
  vm.runInNewContext(compile(relPath), {
    exports: mod.exports,
    module: mod,
    __DEV__: false,
    Error,
    Date,
    Math,
    Number,
    Set,
    Object,
    Promise,
    require: (name) => {
      if (name === 'react') return React;
      if (name === 'react-native') {
        return {
          ActivityIndicator: 'ActivityIndicator',
          Alert: { alert() {} },
          Platform: { OS: 'android' },
          Pressable: 'Pressable',
          RefreshControl: 'RefreshControl',
          ScrollView: 'ScrollView',
          StyleSheet: { create: (v) => v },
          Text: 'Text',
          View: 'View',
        };
      }
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (name === 'expo-router') return { useRouter: () => ({ push() {}, back() {} }) };
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name.includes('design-system')) {
        return {
          colors: {},
          typography: { sizes: {} },
        };
      }
      return mocks(name);
    },
  });

  return {
    exports: mod.exports,
    render() {
      cursor = 0;
      return mod.exports.default();
    },
    runEffects() {
      effects.splice(0).forEach((fn) => fn());
    },
  };
}

test('computeRideEarningsBreakdown prefers server-owned driverSettlement over client percentage estimate', () => {
  const mod = { exports: {} };
  vm.runInNewContext(compile('../../context/duty-context.tsx'), {
    exports: mod.exports,
    module: mod,
    __DEV__: false,
    Date,
    Math,
    Set,
    require: (name) => {
      if (name === 'react') {
        return {
          createContext: () => ({}),
          useCallback: (f) => f,
          useContext: () => ({}),
          useEffect() {},
          useRef: (v) => ({ current: v }),
          useState: (v) => [v, () => {}],
        };
      }
      if (name === 'react-native') return { Alert: {}, Platform: { OS: 'android' } };
      return {};
    },
  });

  // Dispute-refunded ride: server says netCommissionPaise = 0, netEarningsPaise = 10000
  const breakdown = mod.exports.computeRideEarningsBreakdown({
    agreedFarePaise: 10000,
    suggestedFarePaise: 10000,
    pricingSnapshot: { commissionPercent: 8 },
    driverSettlement: {
      grossPaise: 10000,
      commissionChargedPaise: 800,
      commissionRefundedPaise: 800,
      netCommissionPaise: 0,
      netEarningsPaise: 10000,
      settledVia: 'CASH',
    },
  });
  assert.deepEqual({ ...breakdown }, {
    grossPaise: 10000,
    commissionPaise: 0,
    netPaise: 10000,
  });
});

test('DriverEarningsTab renders server-owned period totals and shows unavailable + retry instead of ₹0 on API failure', async () => {
  const calls = [];
  let shouldFail = true;

  const h = createHarness('../../app/(driver)/(tabs)/earnings.tsx', (name) => {
    if (name.includes('auth-context')) return { useAuth: () => ({ token: 'tok-1' }) };
    if (name.includes('duty-context')) {
      return {
        useDuty: () => ({
          walletBalancePaise: null,
          walletTransactions: [],
          summaryError: 'Network offline',
          refreshSummary: async () => {},
        }),
      };
    }
    if (name.includes('services/api')) {
      return {
        ridesApi: {
          getDriverEarnings: async (token, period) => {
            calls.push([token, period]);
            if (shouldFail) throw new Error('Unable to reach Cabzone server');
            return makeSummary({ period });
          },
        },
      };
    }
    return {};
  });

  // 1. Initial failed request -> unavailable card + Retry, NEVER fabricated ₹0.00!
  h.render();
  h.runEffects();
  await flush();
  const errorTree = h.render();
  const errorText = collectText(errorTree);
  assert.ok(errorText.includes('Earnings summary unavailable'));
  assert.ok(!errorText.includes('₹0.00'), 'Must never fabricate ₹0.00 when API fails');

  // 2. Tap Retry -> loads server TODAY summary
  shouldFail = false;
  findButton(errorTree, 'Retry loading earnings').props.onPress();
  await flush();
  const loadedTree = h.render();
  const loadedText = collectText(loadedTree);
  assert.ok(loadedText.includes('₹1388.00'));
  assert.ok(loadedText.includes('1 completed trip awaiting payment'));
  assert.ok(loadedText.includes('Cancellation compensation: +₹25.00'));

  // 3. Switch period to Last 30 Days -> calls server with MONTH
  findButton(loadedTree, 'Last 30 Days').props.onPress();
  h.render();
  h.runEffects();
  await flush();
  assert.deepEqual(calls, [
    ['tok-1', 'TODAY'],
    ['tok-1', 'TODAY'],
    ['tok-1', 'MONTH'],
  ]);
});

test('DriverRidesTab paginates history via server offset and appends Load more trips without duplicates', async () => {
  const historyCalls = [];
  const allItems = [
    makeRideItem('ride-1', 12000, 11040),
    makeRideItem('ride-2', 15000, 13800),
    makeRideItem('ride-3', 20000, 18400),
  ];

  const h = createHarness('../../app/(driver)/(tabs)/rides.tsx', (name) => {
    if (name.includes('auth-context')) return { useAuth: () => ({ token: 'tok-1' }) };
    if (name.includes('duty-context')) {
      return {
        useDuty: () => ({ status: 'OFFLINE', refreshSummary: async () => {} }),
        computeRideEarningsBreakdown: (r) => ({
          grossPaise: r.driverSettlement.grossPaise,
          commissionPaise: r.driverSettlement.netCommissionPaise,
          netPaise: r.driverSettlement.netEarningsPaise,
        }),
      };
    }
    if (name.includes('ride-context')) {
      return {
        ACTIVE_RIDE_STATUSES: new Set(['DRIVER_ASSIGNED', 'TRIP_STARTED']),
        useRide: () => ({
          offers: [],
          activeRide: null,
          isMutatingRide: false,
          refreshOffers: async () => {},
          acceptOffer: async () => null,
          ignoreOffer() {},
          counters: {},
          rejectedCounters: {},
          counterOffer: async () => false,
        }),
      };
    }
    if (name.includes('services/api')) {
      return {
        ridesApi: {
          getDriverEarnings: async () =>
            makeSummary({
              period: 'ALL',
              totalAssignedRidesCount: 125,
              completedTripsCount: 120,
              netEarningsPaise: 1104000,
            }),
          listDriverHistory: async (_tok, params) => {
            historyCalls.push(params);
            if (params.offset === 0) {
              return {
                items: allItems.slice(0, 2),
                total: 3,
                limit: 20,
                offset: 0,
                hasMore: true,
              };
            }
            return {
              items: allItems.slice(2),
              total: 3,
              limit: 20,
              offset: params.offset,
              hasMore: false,
            };
          },
        },
      };
    }
    return {};
  });

  h.render();
  h.runEffects();
  await flush();

  let tree = h.render();
  let text = collectText(tree);
  assert.ok(text.includes('125'));
  assert.ok(text.includes('Showing 2 of 3 trips'));

  const loadMore = findButton(tree, 'Load more trips');
  assert.ok(loadMore, 'Expected Load more trips button');
  await loadMore.props.onPress();
  await flush();

  tree = h.render();
  text = collectText(tree);
  assert.ok(text.includes('Showing 3 of 3 trips'));
  assert.equal(findButton(tree, 'Load more trips'), null);
  assert.equal(historyCalls.length, 2);
  assert.equal(historyCalls[1].offset, 2);
});
