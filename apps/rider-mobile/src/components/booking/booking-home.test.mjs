import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('./booking-home.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;

// Exercise the component's actual handlers without loading native map/animation modules in Node.
function screen() {
  const states = [];
  let cursor = 0;
  let gesture;
  const calls = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (initial) => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [
        states[index],
        (value) => {
          states[index] = value;
        },
      ];
    },
    useEffect: () => {},
    useCallback: (callback) => callback,
  };
  const context = {
    exports: {},
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
            timing: () => ({ start() {}, stop() {} }),
          },
          PanResponder: {
            create: (handlers) => {
              gesture = handlers;
              return { panHandlers: {} };
            },
          },
        };
      if (name === 'expo-router')
        return { useRouter: () => ({ navigate: (path) => calls.push(path) }) };
      if (name.includes('use-reduced-motion')) return { useReducedMotion: () => true };
      if (name.includes('design-system'))
        return { colors: {}, spacing: {}, radii: {}, typography: {} };
      return {};
    },
  };
  vm.runInNewContext(code, context);
  const props = {
    pickup: { lat: 26.7271, lng: 88.4334, address: 'City Centre' },
    drop: { lat: 26.7141, lng: 88.425, address: 'Hill Cart Road' },
    bookingStarted: false,
    templates: [],
    activeRide: null,
    passenger: { label: 'For me' },
    onSearch: () => calls.push('search'),
    onEditPickup: () => calls.push('pickup'),
    onLocate: () => calls.push('locate'),
  };
  const render = () => {
    cursor = 0;
    return context.exports.BookingHome(props);
  };
  return {
    props,
    calls,
    render,
    swipe: (dy) => gesture.onPanResponderRelease(null, { dy, vy: 0 }),
  };
}

function find(node, label) {
  if (!node || typeof node !== 'object') return null;
  if (node.props?.accessibilityLabel === label) return node;
  for (const child of (node.children || []).flat(Infinity)) {
    const result = find(child, label);
    if (result) return result;
  }
  return null;
}

test('Home opens destination, pickup, and GPS actions', () => {
  const home = screen();
  const tree = home.render();
  find(tree, 'Choose your destination').props.onPress();
  find(tree, 'Change pickup: City Centre').props.onPress();
  find(tree, 'Use current location for pickup').props.onPress();
  assert.deepEqual(home.calls, ['search', 'pickup', 'locate']);
});

test('sheet expands and collapses by swipe and remains collapsible after choosing a destination', () => {
  const home = screen();
  assert.ok(find(home.render(), 'Expand booking sheet'));
  home.swipe(-80);
  assert.ok(find(home.render(), 'Collapse booking sheet'));
  home.swipe(80);
  assert.ok(find(home.render(), 'Expand booking sheet'));
  home.props.bookingStarted = true;
  home.render(); // React retries a render when incoming booking state changes.
  assert.ok(find(home.render(), 'Collapse booking sheet'));
  home.swipe(80);
  assert.ok(find(home.render(), 'Expand booking sheet'));
});

test('JavaScript map keeps pickup and destination data safe in HTML', () => {
  const htmlSource = readFileSync(new URL('./booking-map-html.ts', import.meta.url), 'utf8');
  const htmlCode = ts.transpileModule(htmlSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const htmlContext = { exports: {}, process: { env: {} } };
  vm.runInNewContext(htmlCode, htmlContext);
  const pickup = { lat: 26.7, lng: 88.4, address: '</script><script>alert(1)</script>' };
  const drop = { lat: 27, lng: 88.6, address: 'Destination' };
  const html = htmlContext.exports.bookingMapHtml(pickup, drop);
  assert.match(html, /maps\.googleapis\.com\/maps\/api\/js/);
  assert.match(html, /fitBounds/);
  assert.ok(!html.includes('</script><script>alert(1)</script>'));
  assert.deepEqual(
    JSON.parse(JSON.stringify(htmlContext.exports.mapSelection('{"lat":26.7,"lng":88.4}'))),
    { lat: 26.7, lng: 88.4 },
  );
  assert.equal(htmlContext.exports.mapSelection('{"lat":91,"lng":88.4}'), null);
  assert.equal(htmlContext.exports.mapSelection('editPickup'), null);

  const mapSource = readFileSync(new URL('./booking-map.web.tsx', import.meta.url), 'utf8');
  const mapCode = ts.transpileModule(mapSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
  const context = {
    exports: {},
    require: (name) => {
      if (name === 'react')
        return {
          createElement: (type, props, ...children) => ({ type, props, children }),
          useRef: () => ({ current: null }),
          useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
          useEffect: () => {},
        };
      if (name === 'react-native') return { StyleSheet: { create: (styles) => styles } };
      if (name === './booking-map-html') return htmlContext.exports;
      return { colors: {}, spacing: {}, typography: {} };
    },
  };
  vm.runInNewContext(mapCode, context);
  const frame = context.exports.default({ pickup, drop, bottomInset: 300, onEditPickup() {} })
    .children[0];
  assert.equal(frame.type, 'iframe');
  assert.ok(frame.props.srcDoc.includes('maps.googleapis.com'));
  assert.ok(frame.props.srcDoc.includes('"lng":88.6'));

  const markers = [];
  let cameraMoves = 0;
  const polylinePaths = [];
  const googleMaps = {
    Map: class {
      constructor() {}
      addListener() {}
    },
    Marker: class {
      constructor(opts) {
        markers.push(opts);
        this.opts = opts;
      }
      setPosition(pos) { this.opts.position = pos; }
      setMap(map) { this.opts.map = map; }
      addListener() {}
    },
    Polyline: class {
      constructor(opts) {
        polylinePaths.push(opts.path);
      }
      setPath(path) { polylinePaths.push(path); }
      setMap() {}
    },
    LatLngBounds: class {
      extend() {}
    },
    SymbolPath: { CIRCLE: 0 },
  };
  const mapRuntime = vm.createContext({
    window: {
      addEventListener() {},
      google: { maps: googleMaps },
    },
    google: { maps: googleMaps },
    document: { getElementById: () => ({ textContent: '', style: {} }) },
    setTimeout() {},
    mapStub: {
      fitBounds: () => { cameraMoves++; },
      panTo: () => {},
      setZoom: () => {},
    },
  });
  const liveMap = htmlContext.exports.bookingMapHtml(pickup, drop, {
    driverLocation: { lat: 26.71, lng: 88.41 },
    routeCoordinates: [
      [88.4, 26.7],
      [88.6, 27],
    ],
    readOnly: true,
  });
  const inlineScript = liveMap.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(
    `${inlineScript};bookingMap=mapStub;window.updateBookingMap(nextPoints);`,
    mapRuntime,
  );
  assert.equal(polylinePaths[0].length, 2);
  assert.ok(markers.some((marker) => marker.title === 'Driver location'));
  assert.equal(cameraMoves, 1);
  vm.runInContext(
    'window.updateBookingMap({...nextPoints,driver:{lat:26.72,lng:88.42}})',
    mapRuntime,
  );
  assert.equal(cameraMoves, 1);
  vm.runInContext('window.updateBookingMap({...nextPoints,cameraVersion:1})', mapRuntime);
  assert.equal(cameraMoves, 2);
});

test('back button calls onBack when booking has started', () => {
  const home = screen();
  home.props.bookingStarted = true;
  home.props.onBack = () => home.calls.push('back');
  const tree = home.render();
  const back = find(tree, 'Go back');
  assert.ok(back);
  back.props.onPress();
  assert.deepEqual(home.calls, ['back']);
});

test('renders full screen map with floating top and bottom cards when booking has started with floating cards', () => {
  const home = screen();
  home.props.bookingStarted = true;
  home.props.topCard = { props: { accessibilityLabel: 'Top floating pickup card' } };
  home.props.bottomCard = { props: { accessibilityLabel: 'Bottom floating fare card' } };
  const tree = home.render();
  assert.ok(find(tree, 'Top floating pickup card'));
  assert.ok(find(tree, 'Bottom floating fare card'));
  assert.ok(find(tree, 'Use current location for pickup'));
});

test('renders passenger pill on 1st page and calls passenger onPress', () => {
  const home = screen();
  home.props.bookingStarted = false;
  home.props.passenger = {
    label: 'For me',
    onPress: () => home.calls.push('passengerModal'),
  };
  const tree = home.render();
  const passengerBtn = find(tree, 'Passenger: For me');
  assert.ok(passengerBtn);
  passengerBtn.props.onPress();
  assert.deepEqual(home.calls, ['passengerModal']);
});
