import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(
  readFileSync(new URL('./ongoing-ride-view.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  },
).outputText;

function screen() {
  const states = [];
  const calls = [];
  let cursor = 0;
  let gesture;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
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
    useEffect: () => {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    exports: module.exports,
    require: (name) => {
      if (name === 'react') return React;
      if (name === 'react-native')
        return {
          StyleSheet: { create: (styles) => styles },
          Animated: {
            Value: class {
              interpolate() {}
              setValue() {}
              stopAnimation() {}
            },
            timing: () => ({ start() {} }),
          },
          PanResponder: {
            create: (handlers) => {
              gesture = handlers;
              return { panHandlers: {} };
            },
          },
        };
      if (name === '@cabzone/geo')
        return {
          decodePolyline: () => [
            [88.4, 26.7],
            [88.5, 26.8],
          ],
        };
      if (name === '@cabzone/contracts')
        return { VEHICLE_CATEGORY_REGISTRY: { CAB: { displayName: 'Cab' } } };
      if (name.includes('rider-helpers'))
        return { formatRupeesFromPaise: (value) => `₹${value / 100}` };
      if (name.includes('use-reduced-motion')) return { useReducedMotion: () => true };
      if (name.includes('design-system'))
        return { colors: {}, radii: {}, spacing: {}, typography: {} };
      if (name.includes('booking-map')) return { __esModule: true, default: 'BookingMap' };
      return {};
    },
  });
  const props = {
    ride: {
      id: 'ride-1',
      status: 'DRIVER_ASSIGNED',
      vehicleCategory: 'CAB',
      pickupOtp: '4321',
      pickup: { lat: 26.7, lng: 88.4, address: 'Sevoke Road' },
      drop: { lat: 26.8, lng: 88.5, address: 'Hill Cart Road' },
      routeSnapshot: { distanceM: 2200, polyline: 'route' },
      agreedFarePaise: 8300,
    },
    driverLocation: null,
    connected: true,
    error: null,
    refreshing: false,
    passengerLabel: 'For you',
    ...Object.fromEntries(
      ['Back', 'Safety', 'Share', 'Cancel', 'Refresh'].map((action) => [
        `on${action}`,
        () => calls.push(action),
      ]),
    ),
  };
  return {
    props,
    calls,
    render: () => {
      cursor = 0;
      return module.exports.OngoingRideView(props);
    },
    swipe: (dy) => gesture.onPanResponderRelease(null, { dy, vy: 0 }),
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
const byLabel = (tree, label) => find(tree, (node) => node.props.accessibilityLabel === label);
const byText = (tree, text) => find(tree, (node) => node.children.includes(text));

test('pickup stages show the OTP and let riders open details, share, and use safety', () => {
  const s = screen();
  let tree = s.render();
  assert.ok(byLabel(tree, 'Pickup code 4 3 2 1'));
  byLabel(tree, 'Back to Home').props.onPress();
  byLabel(tree, 'Share trip').props.onPress();
  byLabel(tree, 'Safety options').props.onPress();
  s.swipe(-80);
  tree = s.render();
  assert.ok(byLabel(tree, 'Hide ride details'));
  const cancel = find(tree, (node) => node.props.onPress === s.props.onCancel);
  cancel.props.onPress();
  assert.deepEqual(s.calls, ['Back', 'Share', 'Safety', 'Cancel']);
  s.swipe(80);
  assert.ok(byLabel(s.render(), 'Show ride details'));
});

test('starting the trip hides the pickup code and cancellation while showing the route', () => {
  const s = screen();
  s.props.ride.status = 'TRIP_STARTED';
  s.render();
  s.swipe(-80);
  const tree = s.render();
  assert.equal(byLabel(tree, 'Pickup code 4 3 2 1'), null);
  assert.equal(byText(tree, 'Cancel ride'), null);
  const map = find(tree, (node) => node.type === 'BookingMap');
  assert.equal(map.props.drop.address, 'Hill Cart Road');
  assert.equal(map.props.routeCoordinates.length, 2);
});

test('map controls reveal the route and recenter without editing the booking', () => {
  const s = screen();
  let tree = s.render();
  assert.equal(find(tree, (node) => node.type === 'BookingMap').props.drop, undefined);
  byLabel(tree, 'Show trip route').props.onPress();
  byLabel(tree, 'Recenter map').props.onPress();
  tree = s.render();
  const map = find(tree, (node) => node.type === 'BookingMap');
  assert.equal(map.props.drop.address, 'Hill Cart Road');
  assert.equal(map.props.readOnly, true);
  assert.equal(map.props.cameraVersion, 1);
});
