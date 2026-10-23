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

function screen(clock = Date.now()) {
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
    Date: class extends Date {
      static now() {
        return clock;
      }
    },
    exports: module.exports,
    require: (name) => {
      if (name === 'react') return React;
      if (name === 'react-native')
        return {
          StyleSheet: { create: (styles) => styles },
          Linking: { openURL: (url) => calls.push(`Dial:${url}`) },
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
        return {
          formatRupeesFromPaise: (value) => `₹${value / 100}`,
          formatAssignedDriverSummary: (ride) => ({
            driverName: ride.assignedDriver?.name || 'Your driver',
            phoneE164: ride.assignedDriver?.phoneE164 || null,
            profilePhotoUrl: ride.assignedDriver?.profilePhotoUrl || null,
            vehicleLabel: ride.assignedDriver?.vehicle
              ? `${ride.assignedDriver.vehicle.color} ${ride.assignedDriver.vehicle.make} ${ride.assignedDriver.vehicle.model}`
              : 'Cab',
            registrationNumber: ride.assignedDriver?.vehicle?.registrationNumber || null,
          }),
        };
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
  assert.equal(byLabel(tree, 'Share trip'), null);
  byLabel(tree, 'Safety options').props.onPress();
  s.swipe(-80);
  tree = s.render();
  assert.ok(byLabel(tree, 'Hide ride details'));
  byLabel(tree, 'Share trip').props.onPress();
  const cancel = find(tree, (node) => node.props.onPress === s.props.onCancel);
  cancel.props.onPress();
  assert.deepEqual(s.calls, ['Back', 'Safety', 'Share', 'Cancel']);
  s.swipe(80);
  assert.ok(byLabel(s.render(), 'Show ride details'));
});

test('assigned driver details display name, vehicle plate, and call action', () => {
  const s = screen();
  s.props.ride.assignedDriver = {
    driverId: 'driver-1',
    name: 'Subrata Ghosh',
    phoneE164: '+919000000012',
    profilePhotoUrl: null,
    vehicle: {
      vehicleId: 'veh-1',
      make: 'Maruti',
      model: 'Dzire',
      color: 'White',
      registrationNumber: 'WB74AB1234',
      vehicleCategory: 'CAB',
    },
  };
  const tree = s.render();
  assert.ok(byText(tree, 'Subrata Ghosh'));
  assert.ok(byText(tree, 'White Maruti Dzire'));
  assert.ok(byText(tree, 'WB74AB1234'));
  assert.ok(byLabel(tree, 'Vehicle number WB74AB1234'));
  assert.ok(byText(tree, 'Contact driver'));
  byLabel(tree, 'Call driver').props.onPress();
  assert.deepEqual(s.calls, ['Dial:tel:+919000000012']);
});

test('approaching driver has a clear status without an invented arrival estimate', () => {
  const s = screen();
  s.props.ride.status = 'DRIVER_EN_ROUTE';
  s.props.driverLocation = { lat: 26.7, lng: 88.4, updatedAt: new Date().toISOString() };
  let tree = s.render();
  assert.ok(byText(tree, 'Your driver is on the way'));
  assert.equal(byText(tree, 'Driver location is live'), null);
  assert.equal(byText(tree, 'Waiting for driver location'), null);
  assert.ok(byLabel(tree, 'Pickup code 4 3 2 1'));
  s.props.driverLocation.updatedAt = new Date(Date.now() - 60_000).toISOString();
  tree = s.render();
  assert.ok(byText(tree, 'Location update delayed · showing last known position'));
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

test('trip underway shows destination, booked distance, elapsed time and sharing in the compact sheet', () => {
  const now = Date.parse('2026-10-23T10:00:00Z');
  const s = screen(now);
  s.props.ride.status = 'TRIP_STARTED';
  s.props.ride.startedAt = new Date(now - 185_000).toISOString();
  const tree = s.render();
  assert.ok(byLabel(tree, 'Show ride details'));
  assert.ok(byText(tree, 'On your way'));
  assert.ok(byText(tree, 'Heading to'));
  assert.ok(byText(tree, 'Hill Cart Road'));
  assert.ok(byText(tree, '2.2 km booked route'));
  assert.ok(byLabel(tree, 'Trip time 3 minutes'));
  assert.ok(byLabel(tree, 'Agreed fare ₹83'));
  byLabel(tree, 'Share trip').props.onPress();
  byLabel(tree, 'Safety options').props.onPress();
  assert.deepEqual(s.calls, ['Share', 'Safety']);
  assert.equal(byLabel(tree, 'Pickup code 4 3 2 1'), null);
  assert.equal(byText(tree, 'Cancel ride'), null);
  const restored = screen(now + 120_000);
  restored.props.ride = s.props.ride;
  assert.ok(byLabel(restored.render(), 'Trip time 5 minutes'));
});

test('trip time handles a fresh start and omits missing, invalid or future timestamps', () => {
  const now = Date.parse('2026-10-23T10:00:00Z');
  const s = screen(now);
  s.props.ride.status = 'TRIP_STARTED';
  s.props.ride.startedAt = new Date(now).toISOString();
  assert.ok(byText(s.render(), 'Trip just started'));
  for (const startedAt of [null, 'invalid', new Date(now + 60_000).toISOString()]) {
    s.props.ride.startedAt = startedAt;
    const tree = s.render();
    assert.equal(
      find(tree, (node) => node.props.accessibilityLabel?.startsWith('Trip time')),
      null,
    );
    assert.ok(byText(tree, 'Hill Cart Road'));
    assert.ok(byLabel(tree, 'Share trip'));
  }
});

test('arrival shows the pickup and elapsed waiting time from the saved arrival timestamp', () => {
  const now = Date.parse('2026-10-23T10:00:00Z');
  const s = screen(now);
  s.props.ride.status = 'DRIVER_ARRIVED';
  s.props.ride.arrivedAt = new Date(now - 125_000).toISOString();
  let tree = s.render();
  assert.ok(byText(tree, 'Your driver is here'));
  assert.ok(byText(tree, 'Meet at your pickup'));
  assert.ok(byText(tree, 'Sevoke Road'));
  assert.ok(byText(tree, '2:05'));
  assert.ok(byLabel(tree, 'Driver waiting for 2 minutes and 5 seconds'));
  assert.ok(byLabel(tree, 'Pickup code 4 3 2 1'));
  byLabel(tree, 'Safety options').props.onPress();
  s.swipe(-80);
  tree = s.render();
  find(tree, (node) => node.props.onPress === s.props.onCancel).props.onPress();
  assert.deepEqual(s.calls, ['Safety', 'Cancel']);

  const restored = screen(now + 60_000);
  restored.props.ride = s.props.ride;
  assert.ok(byText(restored.render(), '3:05'));
  s.props.ride.status = 'TRIP_STARTED';
  tree = s.render();
  assert.equal(byText(tree, 'Driver waiting'), null);
  assert.equal(byLabel(tree, 'Pickup code 4 3 2 1'), null);
});

test('arrival omits the timer for missing, invalid, or future arrival timestamps', () => {
  const now = Date.parse('2026-10-23T10:00:00Z');
  const s = screen(now);
  s.props.ride.status = 'DRIVER_ARRIVED';
  for (const timestamp of [null, 'invalid', new Date(now + 30_000).toISOString()]) {
    s.props.ride.arrivedAt = timestamp;
    const tree = s.render();
    assert.equal(byText(tree, 'Driver waiting'), null);
    assert.ok(byText(tree, 'Meet at your pickup'));
  }
  s.props.ride.status = 'DRIVER_EN_ROUTE';
  s.props.ride.arrivedAt = new Date(now - 60_000).toISOString();
  assert.equal(byText(s.render(), 'Driver waiting'), null);
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
