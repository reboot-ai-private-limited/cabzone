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

function harness(platformOs = 'android') {
  const hooks = [];
  let cursor = 0;
  let focusCleanup = null;
  let lastFocusCb = null;
  const intervals = new Map();
  let nextInterval = 1;
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
        senderRole: 'DRIVER',
        sequence: sendCalls.length,
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
            addEventListener: () => ({ remove: () => {} }),
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
          useRouter: () => ({ back: () => {} }),
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
    token: 'driver-tok',
    rideId: 'ride-1',
    role: 'DRIVER',
    revision: 0,
    name: 'Subir Roy',
    connected: true,
    rideClosed: false,
  };

  return {
    api,
    props,
    listCalls,
    sendCalls,
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

test('driver chat uses driver quick replies, slow-polls only while disconnected, and wipes on rideClosed prop', async () => {
  const callClicks = [];
  const h = harness('android');
  h.props.onCall = () => callClicks.push(true);
  let tree = h.render();
  await flush();
  tree = h.render();

  assert.ok(byLabel(tree, "Quick reply: I've arrived"));
  byLabel(tree, 'Call passenger').props.onPress();
  assert.equal(callClicks.length, 1);
  assert.equal(h.intervals.size, 0);

  // Disconnecting socket enables 15s fallback catchup poll
  h.props.connected = false;
  h.render();
  assert.equal(h.intervals.size, 1);
  assert.equal([...h.intervals.values()][0].ms, 15_000);

  // Send a message, then flip rideClosed -> immediate wipe & stops fallback timer
  byLabel(tree, 'Quick reply: Arriving shortly').props.onPress();
  tree = h.render();
  byLabel(tree, 'Send message').props.onPress();
  await flush();
  assert.equal(find(h.render(), (n) => n.type === 'FlatList').props.data.length, 1);

  h.props.rideClosed = true;
  h.render();
  tree = h.render();
  assert.equal(h.intervals.size, 0);
  assert.equal(find(tree, (n) => n.type === 'FlatList').props.data.length, 0);
  assert.equal(byLabel(tree, 'Send message'), null);
  assert.equal(byLabel(tree, 'Call passenger'), null);
  h.unmount();
});
