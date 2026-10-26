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

const flush = async (turns = 4) => {
  for (let i = 0; i < turns; i++) {
    await new Promise(setImmediate);
  }
};

function makeOffer(rideId, proposedFarePaise = 15000) {
  return {
    rideId,
    vehicleCategory: 'CAB',
    pickup: { lat: 26.72, lng: 88.42, address: 'Sevoke Road' },
    drop: { lat: 26.71, lng: 88.43, address: 'Hill Cart Road' },
    proposedFarePaise,
    distanceToPickupM: 800,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

function harness(initialDuty = 'ONLINE', initialKycVerified = true) {
  const hooks = [];
  let cursor = 0;
  let value;
  const auth = {
    token: 'driver-token',
    user: { id: 'user-1' },
    driver: { id: 'driver-1' },
    isAuthenticated: true,
    isKycVerified: initialKycVerified,
  };
  const duty = { status: initialDuty, refreshSummary: async () => {} };
  const appStateListeners = new Set();
  const appState = {
    currentState: 'active',
    addEventListener: (_type, fn) => {
      appStateListeners.add(fn);
      return { remove: () => appStateListeners.delete(fn) };
    },
  };

  let nextTimerId = 1;
  const intervals = new Map();
  const timeouts = new Map();
  const sockets = [];

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      sockets.push(this);
    }
    ready() {
      this.readyState = FakeWebSocket.OPEN;
      this.onmessage?.({ data: JSON.stringify({ event: 'connection.ready' }) });
    }
    emit(event, data = {}) {
      this.onmessage?.({ data: JSON.stringify({ event, data }) });
    }
    close() {
      if (this.readyState === FakeWebSocket.CLOSED) return;
      this.readyState = FakeWebSocket.CLOSED;
      this.onclose?.();
    }
  }

  let offerCalls = 0;
  const dispatchApi = {
    listOffers: async () => {
      offerCalls += 1;
      return [];
    },
    registerPushToken: async () => {},
  };
  const ridesApi = {
    listMyRides: async () => [],
    getRide: async () => {
      throw new Error('not found');
    },
    getRideEvents: async () => [],
    markArrived: async (token, rideId) => ({ id: rideId, status: 'DRIVER_ARRIVED', version: 4 }),
    confirmPayment: async (_token, rideId) => ({
      ride: { id: rideId, status: 'SETTLED', version: 7 },
      farePaise: 15000,
      commissionPaise: 1200,
      walletBalancePaise: 23800,
    }),
  };

  const React = {
    createContext: () => ({ Provider: 'RideProvider' }),
    createElement: (_type, props) => {
      value = props.value;
    },
    useState: (initial) => {
      const i = cursor++;
      if (!(i in hooks)) {
        hooks[i] = typeof initial === 'function' ? initial() : initial;
      }
      return [
        hooks[i],
        (next) => {
          hooks[i] = typeof next === 'function' ? next(hooks[i]) : next;
        },
      ];
    },
    useRef: (initial) => {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = { current: initial };
      return hooks[i];
    },
    useEffect: (fn, deps) => {
      const i = cursor++;
      const prev = hooks[i];
      const changed =
        !prev ||
        !deps ||
        !prev.deps ||
        deps.length !== prev.deps.length ||
        deps.some((d, idx) => !Object.is(d, prev.deps[idx]));
      hooks[i] = { fn, deps, cleanup: prev?.cleanup, dirty: changed };
    },
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
  };

  const module = { exports: {} };
  vm.runInNewContext(code, {
    exports: module.exports,
    URL,
    Date,
    Set,
    Object,
    Error,
    Number,
    Boolean,
    String,
    Math,
    JSON,
    Promise,
    console,
    WebSocket: FakeWebSocket,
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
    require: (name) => {
      if (name === 'react') return React;
      if (name === 'react-native') {
        return {
          AppState: appState,
          Platform: { OS: 'android' },
          Vibration: { vibrate: () => {} },
        };
      }
      if (name === './auth-context') return { useAuth: () => auth };
      if (name === './duty-context') return { useDuty: () => duty };
      if (name === '@/services/api') {
        return {
          API_BASE_URL: 'http://localhost:3000',
          dispatchApi,
          ridesApi,
          isApiError: () => false,
        };
      }
      if (name === '@/services/push-notifications') {
        return {
          notifyCounterResponseLocal: async () => {},
          notifyIncomingOfferLocal: async () => {},
          registerForPushAsync: async () => null,
          listenForPushTokenChanges: () => ({ remove: () => {} }),
        };
      }
      if (name === '@/services/storage') {
        return { getOrCreateDeviceId: async () => 'device-1' };
      }
      throw new Error(`Unexpected module: ${name}`);
    },
  });

  function renderOnly() {
    cursor = 0;
    module.exports.RideProvider({ children: null });
    return value;
  }

  function render() {
    cursor = 0;
    module.exports.RideProvider({ children: null });
    for (const h of hooks) {
      if (h && typeof h === 'object' && 'dirty' in h && h.dirty) {
        h.dirty = false;
        h.cleanup?.();
        h.cleanup = h.fn();
      }
    }
    return value;
  }

  return {
    auth,
    duty,
    dispatchApi,
    ridesApi,
    sockets,
    intervals,
    timeouts,
    renderOnly,
    render,
    getOfferCalls: () => offerCalls,
    hasOfferPollInterval: () => [...intervals.values()].some((entry) => entry.ms === 3000),
    async tickOfferPoll() {
      for (const entry of [...intervals.values()]) {
        if (entry.ms === 3000) entry.fn();
      }
      await flush();
    },
    async tickActiveRidePoll() {
      for (const entry of [...intervals.values()]) {
        if (entry.ms === 4000) await entry.fn();
      }
      await flush();
    },
    runReconnectTimer() {
      for (const [id, entry] of [...timeouts.entries()]) {
        if (entry.ms >= 1000 && entry.ms <= 30_000) {
          timeouts.delete(id);
          entry.fn();
        }
      }
    },
    setAppState(next) {
      appState.currentState = next;
      for (const fn of [...appStateListeners]) fn(next);
    },
  };
}

test('stops 3s offer polling when WebSocket is connected and fetches once on going ONLINE', async () => {
  const h = harness('OFFLINE');
  h.dispatchApi.listOffers = async () => [makeOffer('ride-preexisting')];

  h.render();
  await flush();
  assert.equal(h.sockets.length, 1);
  assert.equal(h.hasOfferPollInterval(), false);

  // Socket connects while driver is still OFFLINE
  h.sockets[0].ready();
  h.render();
  await flush();
  assert.equal(h.hasOfferPollInterval(), false);
  assert.equal(h.render().offers.length, 0);

  // Driver taps Go Online while socket is already connected: one immediate sync, zero 3s interval
  let onlineCalls = 0;
  h.dispatchApi.listOffers = async () => {
    onlineCalls += 1;
    return [makeOffer('ride-preexisting')];
  };
  h.duty.status = 'ONLINE';
  h.render();
  await flush();
  assert.equal(onlineCalls, 1);
  assert.equal(h.hasOfferPollInterval(), false);
  assert.deepEqual(
    h.render().offers.map((o) => o.rideId),
    ['ride-preexisting'],
  );
});

test('polls every 3s while disconnected and reconciles offers after reconnect without misses or duplicates', async () => {
  const h = harness('ONLINE');
  let serverOffers = [];
  h.dispatchApi.listOffers = async () => serverOffers;

  // Initial mount starts fallback poll until WebSocket reports connection.ready
  h.render();
  await flush();
  assert.equal(h.hasOfferPollInterval(), true);

  h.sockets[0].ready();
  h.render();
  await flush();
  assert.equal(h.hasOfferPollInterval(), false);

  // WebSocket drops: 3s recovery polling resumes and recovers offers missed while offline
  h.sockets[0].close();
  h.render();
  await flush();
  assert.equal(h.hasOfferPollInterval(), true);

  serverOffers = [makeOffer('ride-outage-1')];
  await h.tickOfferPoll();
  assert.deepEqual(
    h.render().offers.map((o) => o.rideId),
    ['ride-outage-1'],
  );

  // Driver declines ride-outage-1; then a disconnected poll is mid-flight right as WS reconnects
  h.render().ignoreOffer('ride-outage-1');
  assert.equal(h.render().activeOffer, null);

  let releaseStalePoll;
  let callIndex = 0;
  h.dispatchApi.listOffers = () => {
    callIndex += 1;
    if (callIndex === 1) {
      return new Promise((resolve) => {
        releaseStalePoll = () => resolve([makeOffer('ride-outage-1')]);
      });
    }
    // Reconnect resync sees both offers (plus a duplicate entry to verify deduplication)
    return Promise.resolve([
      makeOffer('ride-outage-1'),
      makeOffer('ride-after-reconnect'),
      makeOffer('ride-after-reconnect'),
    ]);
  };

  // Start the stale disconnected poll
  void h.tickOfferPoll();
  await flush(1);

  // Reconnect occurs while stale poll is still in flight
  h.runReconnectTimer();
  assert.equal(h.sockets.length, 2);
  h.sockets[1].ready();
  h.render();
  assert.equal(h.hasOfferPollInterval(), false);

  // Release the stale poll and allow the queued reconnect reconciliation to finish
  releaseStalePoll();
  await flush(6);

  const ctx = h.render();
  assert.equal(h.hasOfferPollInterval(), false);
  assert.deepEqual(
    ctx.offers.map((o) => o.rideId),
    ['ride-outage-1', 'ride-after-reconnect'],
  );
  // Declined offer stays ignored; newly recovered offer surfaces as activeOffer
  assert.equal(ctx.activeOffer?.rideId, 'ride-after-reconnect');
});

test('does not run 3s offer polling while backgrounded and recovers on foreground resume', async () => {
  const h = harness('ONLINE');
  let serverOffers = [];
  h.dispatchApi.listOffers = async () => serverOffers;

  h.render();
  h.sockets[0].ready();
  h.render();
  await flush();
  assert.equal(h.hasOfferPollInterval(), false);

  // Backgrounding closes socket intentionally without spinning up 3s HTTP polling
  h.setAppState('background');
  h.render();
  await flush();
  assert.equal(h.hasOfferPollInterval(), false);

  // Returning to foreground resyncs and reconnects cleanly
  serverOffers = [makeOffer('ride-foreground-resume')];
  h.setAppState('active');
  h.render();
  h.sockets[1].ready();
  h.render();
  await flush();

  assert.equal(h.hasOfferPollInterval(), false);
  assert.deepEqual(
    h.render().offers.map((o) => o.rideId),
    ['ride-foreground-resume'],
  );
});

test('holds isCheckingActiveRide true before effects run and recovers active rides even when KYC became restricted mid-trip', async () => {
  const h = harness('OFFLINE', false);
  h.ridesApi.listMyRides = async () => [
    { id: 'ride-midtrip', status: 'PAYMENT_PENDING', version: 6 },
  ];

  // First render before useEffect runs must already signal isCheckingActiveRide = true
  assert.equal(h.renderOnly().isCheckingActiveRide, true);

  h.render();
  await flush();
  const ctx = h.render();
  assert.equal(ctx.isCheckingActiveRide, false);
  assert.equal(ctx.activeRide?.id, 'ride-midtrip');
  assert.equal(ctx.activeRide?.status, 'PAYMENT_PENDING');
  // WebSocket connects so mid-trip restricted driver still receives live payment/cancel updates
  assert.equal(h.sockets.length, 1);
});

test('ignores stale lower-version polls across markArrived and confirmDirectPayment settlement', async () => {
  const h = harness('ONLINE');
  h.ridesApi.listMyRides = async () => [
    { id: 'ride-sync', status: 'DRIVER_EN_ROUTE', version: 3 },
  ];

  h.render();
  await flush();
  assert.equal(h.render().activeRide?.status, 'DRIVER_EN_ROUTE');

  // Driver marks arrived (version 4)
  await h.render().markArrived('ride-sync');
  assert.equal(h.render().activeRide?.status, 'DRIVER_ARRIVED');

  // Late 4s poll returns older version 3 -> must NOT regress activeRide
  h.ridesApi.getRide = async () => ({ id: 'ride-sync', status: 'DRIVER_EN_ROUTE', version: 3 });
  await h.tickActiveRidePoll();
  assert.equal(h.render().activeRide?.status, 'DRIVER_ARRIVED');
  assert.equal(h.render().activeRide?.version, 4);

  // Driver confirms direct cash payment (version 7, SETTLED) -> activeRide clears
  await h.render().confirmDirectPayment('ride-sync');
  assert.equal(h.render().activeRide, null);

  // Late listMyRides carrying version 6 PAYMENT_PENDING must NOT resurrect the settled ride
  h.ridesApi.listMyRides = async () => [
    { id: 'ride-sync', status: 'PAYMENT_PENDING', version: 6 },
  ];
  await h.render().refreshActiveRide();
  assert.equal(h.render().activeRide, null);
});
