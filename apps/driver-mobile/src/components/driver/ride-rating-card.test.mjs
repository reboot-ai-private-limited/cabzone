import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(
  readFileSync(new URL('./ride-rating-card.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  },
).outputText;

function createHarness(apiOverrides = {}) {
  const states = [];
  const refs = [];
  const submissions = [];
  let cursor = 0;
  let refCursor = 0;

  const React = {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => ({
      type,
      props: props || {},
      children: children.flat(),
    }),
    useState: (initial) => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [
        states[index],
        (next) => {
          states[index] = typeof next === 'function' ? next(states[index]) : next;
        },
      ];
    },
    useRef: (initial) => {
      const index = refCursor++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    },
    useEffect: () => {},
    useCallback: (fn) => fn,
  };

  const module = { exports: {} };
  vm.runInNewContext(code, {
    exports: module.exports,
    require: (name) => {
      if (name === 'react') return React;
      if (name === 'react-native') {
        return {
          ActivityIndicator: 'ActivityIndicator',
          Pressable: 'Pressable',
          StyleSheet: { create: (styles) => styles },
          Text: 'Text',
          TextInput: 'TextInput',
          View: 'View',
        };
      }
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === '@cabzone/contracts') {
        return {
          DRIVER_TO_RIDER_RATING_TAGS: [
            'POLITE_RIDER',
            'READY_AT_PICKUP',
            'PROMPT_PAYMENT',
            'PAYMENT_FRICTION',
          ],
          RIDE_RATING_TAG_LABELS: {
            POLITE_RIDER: 'Polite rider',
            READY_AT_PICKUP: 'Ready at pickup',
            PROMPT_PAYMENT: 'Prompt payment',
            PAYMENT_FRICTION: 'Payment friction',
            SAFE_DRIVING: 'Safe driving',
          },
        };
      }
      if (name.includes('auth-context')) return { useAuth: () => ({ token: 'tok-driver' }) };
      if (name.includes('services/api')) {
        return {
          ridesApi: {
            getRideRating: async () => null,
            submitRideRating: async (_token, rideId, payload) => {
              submissions.push({ rideId, payload });
              return {
                rideId,
                rideSettledAt: '2026-10-26T10:00:00.000Z',
                windowExpiresAt: '2026-11-02T10:00:00.000Z',
                isWindowExpired: false,
                canSubmit: false,
                myReview: {
                  id: 'rev-d1',
                  rideId,
                  reviewerRole: 'DRIVER',
                  stars: payload.stars,
                  tags: payload.tags || [],
                  comment: payload.comment || null,
                  status: 'HIDDEN',
                  submittedAt: '2026-10-26T10:05:00.000Z',
                  revealedAt: null,
                },
                counterpartyReview: null,
              };
            },
            ...apiOverrides,
          },
        };
      }
      if (name.includes('design-system')) {
        return {
          colors: {},
          typography: { sizes: { xs: 12, sm: 13, label: 14, base: 16 } },
        };
      }
      return {};
    },
  });

  const render = (props) => {
    cursor = 0;
    refCursor = 0;
    return module.exports.RideRatingCard(props);
  };

  return { render, submissions };
}

function collectNodes(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (predicate(node)) out.push(node);
  for (const child of node.children || []) collectNodes(child, predicate, out);
  return out;
}

function collectText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  return (node.children || []).map(collectText).join(' ');
}

test('Driver RideRatingCard submits driver-to-rider stars & tags while preserving double-blind privacy and single-flight submit', async () => {
  const h = createHarness();
  const initialStatus = {
    rideId: 'ride-201',
    rideSettledAt: '2026-10-26T10:00:00.000Z',
    windowExpiresAt: '2026-11-02T10:00:00.000Z',
    isWindowExpired: false,
    canSubmit: true,
    myReview: null,
    counterpartyReview: null,
  };

  let tree = h.render({ rideId: 'ride-201', passengerName: 'Aditi Sen', initialStatus });
  assert.match(collectText(tree), /Rate Aditi Sen/);

  const star5 = collectNodes(
    tree,
    (n) => n.props?.accessibilityLabel === 'Rate 5 out of 5 stars',
  )[0];
  star5.props.onPress();

  tree = h.render({ rideId: 'ride-201', passengerName: 'Aditi Sen', initialStatus });
  const promptChip = collectNodes(
    tree,
    (n) => n.props?.accessibilityLabel === 'Prompt payment',
  )[0];
  promptChip.props.onPress();

  tree = h.render({ rideId: 'ride-201', passengerName: 'Aditi Sen', initialStatus });
  const submitBtn = collectNodes(tree, (n) => n.props?.accessibilityLabel === 'Submit rating')[0];
  submitBtn.props.onPress();
  submitBtn.props.onPress();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(h.submissions.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.submissions[0])), {
    rideId: 'ride-201',
    payload: { stars: 5, tags: ['PROMPT_PAYMENT'] },
  });

  tree = h.render({ rideId: 'ride-201', passengerName: 'Aditi Sen', initialStatus });
  assert.match(collectText(tree), /Your rating for Aditi Sen/);
  assert.match(collectText(tree), /Private/);
});

test('Driver RideRatingCard renders revealed rider review, hides unrevealed rider review, and handles closed window', () => {
  const h = createHarness();
  const tree = h.render({
    rideId: 'ride-202',
    passengerName: 'Aditi Sen',
    initialStatus: {
      rideId: 'ride-202',
      rideSettledAt: '2026-10-18T10:00:00.000Z',
      windowExpiresAt: '2026-10-25T10:00:00.000Z',
      isWindowExpired: true,
      canSubmit: false,
      myReview: null,
      counterpartyReview: {
        id: 'rev-r1',
        rideId: 'ride-202',
        reviewerRole: 'RIDER',
        stars: 5,
        tags: ['SAFE_DRIVING'],
        comment: 'Great ride',
        status: 'REVEALED',
        submittedAt: '2026-10-18T10:05:00.000Z',
        revealedAt: '2026-10-25T10:01:00.000Z',
      },
    },
  });

  const text = collectText(tree);
  assert.match(text, /Rating window closed/);
  assert.match(text, /Rating from Aditi Sen/);
  assert.match(text, /Safe driving/);

  const unrevealedH = createHarness();
  const unrevealedTree = unrevealedH.render({
    rideId: 'ride-203',
    passengerName: 'Aditi Sen',
    initialStatus: {
      rideId: 'ride-203',
      rideSettledAt: '2026-10-26T10:00:00.000Z',
      windowExpiresAt: '2026-11-02T10:00:00.000Z',
      isWindowExpired: false,
      canSubmit: true,
      myReview: null,
      counterpartyReview: {
        id: 'rev-r-hidden',
        rideId: 'ride-203',
        reviewerRole: 'RIDER',
        stars: 1,
        tags: [],
        comment: 'Hidden rider feedback',
        status: 'HIDDEN',
        submittedAt: '2026-10-26T10:05:00.000Z',
        revealedAt: null,
      },
    },
  });
  const unrevealedText = collectText(unrevealedTree);
  assert.doesNotMatch(unrevealedText, /Hidden rider feedback/);
  assert.doesNotMatch(unrevealedText, /Rating from Aditi Sen/);
});
