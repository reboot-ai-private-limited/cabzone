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
          RIDER_TO_DRIVER_RATING_TAGS: [
            'SAFE_DRIVING',
            'CLEAN_VEHICLE',
            'POLITE_DRIVER',
            'LATE_PICKUP',
          ],
          RIDE_RATING_TAG_LABELS: {
            SAFE_DRIVING: 'Safe driving',
            CLEAN_VEHICLE: 'Clean vehicle',
            POLITE_DRIVER: 'Polite driver',
            LATE_PICKUP: 'Late pickup',
            POLITE_RIDER: 'Polite rider',
          },
        };
      }
      if (name.includes('auth-context')) return { useAuth: () => ({ token: 'tok-rider' }) };
      if (name.includes('services/api')) {
        return {
          riderRidesApi: {
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
                  id: 'rev-1',
                  rideId,
                  reviewerRole: 'RIDER',
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
        return { colors: {}, radii: {}, spacing: {}, typography: {} };
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

test('RideRatingCard lets rider choose stars, preset tags, and submit double-blind rating', async () => {
  const h = createHarness();
  const initialStatus = {
    rideId: 'ride-101',
    rideSettledAt: '2026-10-26T10:00:00.000Z',
    windowExpiresAt: '2026-11-02T10:00:00.000Z',
    isWindowExpired: false,
    canSubmit: true,
    myReview: null,
    counterpartyReview: null,
  };

  let tree = h.render({ rideId: 'ride-101', driverName: 'Subrata Ghosh', initialStatus });
  assert.match(collectText(tree), /Rate your trip with Subrata Ghosh/);
  assert.match(collectText(tree), /Stays private until both of you submit or 7 days pass/);

  const star4 = collectNodes(
    tree,
    (n) => n.props?.accessibilityLabel === 'Rate 4 out of 5 stars',
  )[0];
  assert.ok(star4);
  star4.props.onPress();

  tree = h.render({ rideId: 'ride-101', driverName: 'Subrata Ghosh', initialStatus });
  const safeDrivingChip = collectNodes(
    tree,
    (n) => n.props?.accessibilityLabel === 'Safe driving',
  )[0];
  assert.ok(safeDrivingChip);
  safeDrivingChip.props.onPress();

  tree = h.render({ rideId: 'ride-101', driverName: 'Subrata Ghosh', initialStatus });
  const submitBtn = collectNodes(tree, (n) => n.props?.accessibilityLabel === 'Submit rating')[0];
  assert.equal(submitBtn.props.disabled, false);
  // Rapid synchronous double-tap must only submit once
  submitBtn.props.onPress();
  submitBtn.props.onPress();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(h.submissions.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.submissions[0])), {
    rideId: 'ride-101',
    payload: { stars: 4, tags: ['SAFE_DRIVING'] },
  });

  tree = h.render({ rideId: 'ride-101', driverName: 'Subrata Ghosh', initialStatus });
  assert.match(collectText(tree), /Your rating for Subrata Ghosh/);
  assert.match(collectText(tree), /Private/);
});

test('RideRatingCard shows published mutual ratings, blocks unrevealed counterparty reviews, and handles expired window', () => {
  const revealedHarness = createHarness();
  const revealedTree = revealedHarness.render({
    rideId: 'ride-102',
    driverName: 'Rajesh Barman',
    initialStatus: {
      rideId: 'ride-102',
      rideSettledAt: '2026-10-20T10:00:00.000Z',
      windowExpiresAt: '2026-10-27T10:00:00.000Z',
      isWindowExpired: false,
      canSubmit: false,
      myReview: {
        id: 'rev-r',
        rideId: 'ride-102',
        reviewerRole: 'RIDER',
        stars: 5,
        tags: ['CLEAN_VEHICLE'],
        comment: 'Smooth trip',
        status: 'REVEALED',
        submittedAt: '2026-10-20T10:05:00.000Z',
        revealedAt: '2026-10-20T10:06:00.000Z',
      },
      counterpartyReview: {
        id: 'rev-d',
        rideId: 'ride-102',
        reviewerRole: 'DRIVER',
        stars: 5,
        tags: ['POLITE_RIDER'],
        comment: 'Thank you!',
        status: 'REVEALED',
        submittedAt: '2026-10-20T10:06:00.000Z',
        revealedAt: '2026-10-20T10:06:00.000Z',
      },
    },
  });

  const text = collectText(revealedTree);
  assert.match(text, /Published/);
  assert.match(text, /Rating from Rajesh Barman/);
  assert.match(text, /Polite rider/);

  const unrevealedCounterpartyHarness = createHarness();
  const unrevealedTree = unrevealedCounterpartyHarness.render({
    rideId: 'ride-102b',
    driverName: 'Rajesh Barman',
    initialStatus: {
      rideId: 'ride-102b',
      rideSettledAt: '2026-10-26T10:00:00.000Z',
      windowExpiresAt: '2026-11-02T10:00:00.000Z',
      isWindowExpired: false,
      canSubmit: true,
      myReview: null,
      counterpartyReview: {
        id: 'rev-d-hidden',
        rideId: 'ride-102b',
        reviewerRole: 'DRIVER',
        stars: 2,
        tags: [],
        comment: 'Secret unrevealed note',
        status: 'HIDDEN',
        submittedAt: '2026-10-26T10:06:00.000Z',
        revealedAt: null,
      },
    },
  });
  const unrevealedText = collectText(unrevealedTree);
  assert.doesNotMatch(unrevealedText, /Secret unrevealed note/);
  assert.doesNotMatch(unrevealedText, /Rating from Rajesh Barman/);

  const expiredHarness = createHarness();
  const expiredTree = expiredHarness.render({
    rideId: 'ride-103',
    driverName: 'Rajesh Barman',
    initialStatus: {
      rideId: 'ride-103',
      rideSettledAt: '2026-10-01T10:00:00.000Z',
      windowExpiresAt: '2026-10-08T10:00:00.000Z',
      isWindowExpired: true,
      canSubmit: false,
      myReview: null,
      counterpartyReview: null,
    },
  });
  assert.match(collectText(expiredTree), /Rating window closed/);
});
