import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

// Chat history is bounded to 24h, so fixture timestamps must be relative to now.
const FIXTURE_BASE_MS = Date.now() - 60 * 60 * 1000;
const isoAt = (minute) => new Date(FIXTURE_BASE_MS + minute * 60_000).toISOString();

const require = createRequire(import.meta.url);
const ts = require('typescript');

function transpileCjs(url, jsx = false) {
  return ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      ...(jsx ? { jsx: ts.JsxEmit.React } : {}),
      esModuleInterop: true,
    },
  }).outputText;
}

const communicationExports = {};
vm.runInNewContext(
  transpileCjs(new URL('../../../../../packages/contracts/src/communication.ts', import.meta.url)),
  { exports: communicationExports, Object, Array },
);

const chatHelperExports = {};
vm.runInNewContext(transpileCjs(new URL('../../services/ride-chat.ts', import.meta.url)), {
  exports: chatHelperExports,
  crypto,
  Date,
  Math,
  Map,
  Array,
  Object,
  Error,
  Number,
  String,
  require: (name) => {
    if (name === './api') return { isApiError: (err) => err?.name === 'ApiError' };
    throw new Error(`Unexpected ride-chat helper import: ${name}`);
  },
});

const screenCode = transpileCjs(new URL('./ride-chat-screen.tsx', import.meta.url), true);

const flush = async (turns = 6) => {
  for (let i = 0; i < turns; i++) await new Promise(setImmediate);
};

function harness(role = 'RIDER', platformOs = 'android') {
  const hooks = [];
  let cursor = 0;
  let focusCleanup = null;
  let lastFocusCb = null;
  const appStateListeners = new Set();
  const intervals = new Map();
  let nextInterval = 1;
  const backCalls = [];
  const listCalls = [];
  const sendCalls = [];

  const api = {
    list: async (_token, _rideId, q) => {
      listCalls.push(q);
      return { messages: [], hasMore: false };
    },
    send: async (_token, _rideId, clientMessageId, text) => {
      sendCalls.push({ clientMessageId, text });
      return {
        id: `msg-${sendCalls.length}`,
        rideId: 'ride-1',
        clientMessageId,
        senderRole: role,
        sequence: 10 + sendCalls.length,
        text,
        createdAt: isoAt(0),
      };
    },
  };

  const React = {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (initial) => {
      const idx = cursor++;
      if (!hooks[idx]) {
        hooks[idx] = { value: typeof initial === 'function' ? initial() : initial };
      }
      const cell = hooks[idx];
      return [
        cell.value,
        (next) => {
          cell.value = typeof next === 'function' ? next(cell.value) : next;
        },
      ];
    },
    useRef: (initial) => {
      const idx = cursor++;
      if (!hooks[idx]) hooks[idx] = { current: initial };
      return hooks[idx];
    },
    useCallback: (fn, deps) => {
      const idx = cursor++;
      const prev = hooks[idx];
      if (!prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps[i]))) {
        hooks[idx] = { fn, deps };
      }
      return hooks[idx].fn;
    },
    useEffect: (fn, deps) => {
      const idx = cursor++;
      const prev = hooks[idx];
      if (!prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps[i]))) {
        prev?.cleanup?.();
        const cleanup = fn();
        hooks[idx] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : null };
      }
    },
  };

  const module = { exports: {} };
  vm.runInNewContext(screenCode, {
    exports: module.exports,
    Object,
    Array,
    Map,
    Date,
    Error,
    Promise,
    Set,
    setInterval: (fn, ms) => {
      const id = nextInterval++;
      intervals.set(id, { fn, ms });
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    require: (name) => {
      if (name === 'react') return React;
      if (name === 'react-native') {
        return {
          AppState: {
            currentState: 'active',
            addEventListener: (_t, fn) => {
              appStateListeners.add(fn);
              return { remove: () => appStateListeners.delete(fn) };
            },
          },
          FlatList: 'FlatList',
          KeyboardAvoidingView: 'KeyboardAvoidingView',
          Platform: { OS: platformOs },
          Pressable: 'Pressable',
          StyleSheet: { create: (s) => s },
          Text: 'Text',
          TextInput: 'TextInput',
          View: 'View',
        };
      }
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (name === 'expo-router') {
        return {
          useRouter: () => ({ back: () => backCalls.push(true) }),
          useFocusEffect: (cb) => {
            if (cb !== lastFocusCb) {
              focusCleanup?.();
              lastFocusCb = cb;
              const cleanup = cb();
              focusCleanup = typeof cleanup === 'function' ? cleanup : null;
            }
          },
        };
      }
      if (name === '@cabzone/contracts') return communicationExports;
      if (name === '@/services/api') return { rideChatApi: api };
      if (name === '@/services/ride-chat') return chatHelperExports;
      if (name === '@/design-system') return { colors: {}, createStyles: (factory) => factory() };
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      throw new Error(`Unexpected module: ${name}`);
    },
  });

  const props = {
    token: 'tok-1',
    rideId: 'ride-1',
    role,
    revision: 0,
    name: role === 'RIDER' ? 'Subrata Ghosh' : 'Subir Roy',
    connected: true,
    rideClosed: false,
    onOpen: () => {},
  };

  return {
    api,
    props,
    listCalls,
    sendCalls,
    backCalls,
    intervals,
    render: () => {
      cursor = 0;
      return module.exports.RideChatScreen(props);
    },
    unmount: () => {
      focusCleanup?.();
      for (const h of hooks) h?.cleanup?.();
    },
  };
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of (node.children || []).flat(Infinity)) {
    const hit = find(child, predicate);
    if (hit) return hit;
  }
  return null;
}
const byLabel = (tree, label) => find(tree, (n) => n.props?.accessibilityLabel === label);

test('loads bounded history, renders quick replies + KeyboardAvoidingView, paginates older, and queues mid-sync catchup', async () => {
  const openEvents = [];
  const h = harness('RIDER', 'ios');
  h.props.onOpen = () => openEvents.push(true);

  let releaseFirst;
  h.api.list = (_t, _r, q) => {
    h.listCalls.push(q);
    if (h.listCalls.length === 1) {
      return new Promise((resolve) => {
        releaseFirst = () =>
          resolve({
            messages: [
              {
                id: 'm2',
                rideId: 'ride-1',
                clientMessageId: 'c2',
                senderRole: 'DRIVER',
                sequence: 2,
                text: 'On the way',
                createdAt: isoAt(1),
              },
            ],
            hasMore: true,
          });
      });
    }
    if (q.after === 2) {
      return Promise.resolve({
        messages: [
          {
            id: 'm3',
            rideId: 'ride-1',
            clientMessageId: 'c3',
            senderRole: 'DRIVER',
            sequence: 3,
            text: 'Arrived outside',
            createdAt: isoAt(2),
          },
        ],
        hasMore: false,
      });
    }
    if (q.before === 2) {
      return Promise.resolve({
        messages: [
          {
            id: 'm1',
            rideId: 'ride-1',
            clientMessageId: 'c1',
            senderRole: 'RIDER',
            sequence: 1,
            text: 'Waiting at gate',
            createdAt: isoAt(0),
          },
        ],
        hasMore: false,
      });
    }
    return Promise.resolve({ messages: [], hasMore: false });
  };

  let tree = h.render();
  const kav = find(tree, (n) => n.type === 'KeyboardAvoidingView');
  assert.equal(kav.props.behavior, 'padding');
  assert.ok(byLabel(tree, "Quick reply: I'm at pickup"));

  // Revision increments while initial list is still in flight -> must queue catch-up instead of dropping!
  h.props.revision = 1;
  h.render();
  releaseFirst();
  await flush();

  tree = h.render();
  assert.deepEqual(JSON.parse(JSON.stringify(h.listCalls)), [{}, { after: 2 }]);
  assert.ok(openEvents.length >= 1);

  const flatList = find(tree, (n) => n.type === 'FlatList');
  assert.deepEqual([...flatList.props.data].map((m) => m.sequence), [3, 2]);
  const renderedBubble = flatList.props.renderItem({ item: flatList.props.data[0] });
  const bubbleText = find(renderedBubble, (n) => n.children?.includes('Arrived outside'));
  assert.equal(bubbleText.props.selectable, false);

  // Load older page via ListFooterComponent
  byLabel(flatList.props.ListFooterComponent, 'Load earlier messages').props.onPress();
  await flush();
  tree = h.render();
  const updatedList = find(tree, (n) => n.type === 'FlatList');
  assert.deepEqual([...updatedList.props.data].map((m) => m.sequence), [3, 2, 1]);
  assert.equal(updatedList.props.ListFooterComponent, undefined);
  h.unmount();
});

test('retries failed sends with the exact same clientMessageId, survives token rotation, and wipes memory on closure', async () => {
  const callClicks = [];
  const h = harness('RIDER', 'android');
  h.props.onCall = () => callClicks.push(true);
  let failSend = true;
  h.api.send = async (_token, _rideId, clientMessageId, text) => {
    h.sendCalls.push({ clientMessageId, text });
    if (failSend) {
      throw new Error('Network timeout');
    }
    return {
      id: 'm-sent',
      rideId: 'ride-1',
      clientMessageId,
      senderRole: 'RIDER',
      sequence: 5,
      text,
      createdAt: isoAt(5),
    };
  };

  let tree = h.render();
  await flush();
  tree = h.render();
  assert.equal(find(tree, (n) => n.type === 'KeyboardAvoidingView').props.behavior, 'height');
  byLabel(tree, 'Call driver').props.onPress();
  assert.equal(callClicks.length, 1);

  byLabel(tree, 'Quick reply: Please wait').props.onPress();
  tree = h.render();
  byLabel(tree, 'Send message').props.onPress();
  await flush();

  tree = h.render();
  const header = find(tree, (n) => n.type === 'FlatList').props.ListHeaderComponent;
  assert.ok(header);
  const firstKey = h.sendCalls[0].clientMessageId;

  failSend = false;
  byLabel(header, 'Retry message').props.onPress();
  await flush();
  assert.equal(h.sendCalls.length, 2);
  assert.equal(h.sendCalls[1].clientMessageId, firstKey);

  // SESSION_CHANGED during background token rotation must NOT wipe chat or mark it closed
  h.api.list = async () => {
    const err = new Error('Session changed. Retry the action.');
    err.name = 'ApiError';
    err.code = 'SESSION_CHANGED';
    err.status = 401;
    throw err;
  };
  h.props.revision = 2;
  h.render();
  await flush();
  tree = h.render();
  assert.ok(byLabel(tree, 'Send message'));
  assert.equal(find(tree, (n) => n.type === 'FlatList').props.data.length, 1);

  // 409 COMMUNICATION_CLOSED immediately wipes message buffer and composer
  h.api.list = async () => {
    const err = new Error('COMMUNICATION_CLOSED: Ride communication is unavailable.');
    err.name = 'ApiError';
    err.code = 'CONFLICT';
    err.status = 409;
    throw err;
  };
  h.props.revision = 3;
  h.render();
  await flush();
  tree = h.render();
  const closedList = find(tree, (n) => n.type === 'FlatList');
  assert.equal(closedList.props.data.length, 0);
  assert.equal(byLabel(tree, 'Send message'), null);
  assert.equal(byLabel(tree, 'Call driver'), null);
  assert.ok(closedList.props.ListEmptyComponent.children.includes('Chat is closed for this ride.'));
  h.unmount();
});
