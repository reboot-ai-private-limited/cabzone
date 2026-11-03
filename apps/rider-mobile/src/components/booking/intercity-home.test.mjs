import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('./intercity-home.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;

function load() {
  const context = {
    exports: {},
    require: (name) => {
      if (name === 'react') {
        return { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
      }
      if (name === 'react-native') {
        return {
          StyleSheet: { create: (styles) => styles },
          Pressable: 'Pressable',
          ScrollView: 'ScrollView',
          Text: 'Text',
          View: 'View',
        };
      }
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name.includes('design-system')) {
        return { createStyles: (factory) => factory(), colors: {}, spacing: {}, radii: {}, typography: {} };
      }
      if (name.includes('intercity-routes')) return { formatApproxKm: (km) => `~${km} km` };
      return {};
    },
  };
  vm.runInNewContext(code, context);
  return context.exports.IntercityHomeContent;
}

const flat = (node, out = []) => {
  if (!node || typeof node !== 'object') return out;
  out.push(node);
  for (const child of [].concat(node.children || []).flat(Infinity)) flat(child, out);
  return out;
};
const byLabel = (tree, label) =>
  flat(tree).find((n) => n.props && n.props.accessibilityLabel === label);
const texts = (tree) =>
  flat(tree)
    .flatMap((n) => [].concat(n.children || []).flat(Infinity))
    .filter((c) => typeof c === 'string');

const destinations = [
  { id: 'kurseong-town', title: 'Kurseong', caption: 'West Bengal', name: 'Kurseong Hill Station', lat: 26.88, lng: 88.28, distanceKm: 22 },
  { id: 'gangtok-mg-marg', title: 'Gangtok', caption: 'Sikkim', name: 'MG Marg, Gangtok (Interstate)', lat: 27.33, lng: 88.61, distanceKm: 107 },
];

function render(overrides = {}) {
  const calls = [];
  const props = {
    pickup: { address: 'Hill Cart Road, Siliguri' },
    destinations,
    locationError: null,
    templates: [],
    onSearch: () => calls.push('search'),
    onEditPickup: () => calls.push('pickup'),
    onChoosePickupOnMap: () => calls.push('pickup-map'),
    onSelectDestination: (d) => calls.push(`dest:${d.title}`),
    onSelectTemplate: (t) => calls.push(`template:${t.id}`),
    onSwitchMode: () => calls.push('switch'),
    ...overrides,
  };
  return { tree: load()(props), calls };
}

test('shows the route as From the pickup To a city, with a city-to-city title', () => {
  const { tree } = render();
  const all = texts(tree);
  assert.ok(all.includes('City to city'));
  assert.ok(all.includes('Hill Cart Road, Siliguri'));
  assert.ok(all.includes('Which city are you going to?'));
});

test('pickup, map pin and destination search all route to their handlers', () => {
  const { tree, calls } = render();
  byLabel(tree, 'Change pickup: Hill Cart Road, Siliguri').props.onPress();
  byLabel(tree, 'Choose pickup on map').props.onPress();
  byLabel(tree, 'Choose your destination city').props.onPress();
  assert.deepEqual(calls, ['pickup', 'pickup-map', 'search']);
});

test('popular route cards show the city and distance and pick that destination', () => {
  const { tree, calls } = render();
  const all = texts(tree);
  assert.ok(all.includes('Kurseong') && all.includes('Gangtok'));
  assert.ok(all.includes('~22 km') && all.includes('~107 km'));
  byLabel(tree, 'Ride to Gangtok, ~107 km').props.onPress();
  assert.deepEqual(calls, ['dest:Gangtok']);
});

test('without destinations the popular routes section is hidden', () => {
  const { tree } = render({ destinations: [] });
  assert.ok(!texts(tree).includes('POPULAR ROUTES'));
});

test('shows location errors and a way back to city rides', () => {
  const { tree, calls } = render({ locationError: 'Location permission denied.' });
  assert.ok(texts(tree).includes('Location permission denied.'));
  byLabel(tree, 'Book a ride within the city instead').props.onPress();
  assert.deepEqual(calls, ['switch']);
});

test('saved routes are listed and selectable', () => {
  const { tree, calls } = render({
    templates: [{ id: 't1', label: 'Home to Darjeeling' }, { id: 't2', label: 'Office' }, { id: 't3', label: 'Third' }],
  });
  const all = texts(tree);
  assert.ok(all.includes('Home to Darjeeling') && all.includes('Office'));
  assert.ok(!all.includes('Third'), 'only two saved routes are shown');
  flat(tree).find((n) => n.props?.accessibilityRole === 'button' && n.children?.flat?.(Infinity)?.some?.((c) => c?.children?.includes?.('Home to Darjeeling')))?.props.onPress();
  assert.deepEqual(calls, ['template:t1']);
});

test('the city rides variant has its own copy, shows the cards slot, and can hide the switch link', () => {
  const { tree, calls } = render({
    variant: 'CITY',
    destinations: [],
    middle: { type: 'Cards', props: {}, children: [] },
    showSwitch: false,
  });
  const all = texts(tree);
  assert.ok(all.includes('City rides'));
  assert.ok(all.includes('Where to?'));
  assert.ok(!all.includes('POPULAR PLACES') && !all.includes('POPULAR ROUTES'));
  assert.ok(!all.includes('City to city'));
  assert.ok(flat(tree).some((n) => n.type === 'Cards'), 'the cards render between the route card and saved routes');
  assert.equal(byLabel(tree, 'Book a city to city ride instead'), undefined);
  byLabel(tree, 'Choose your destination').props.onPress();
  assert.deepEqual(calls, ['search']);
});

test('saved routes come after the cards slot', () => {
  const { tree } = render({
    variant: 'CITY',
    destinations: [],
    middle: { type: 'Cards', props: {}, children: [] },
    templates: [{ id: 't1', label: 'Home to Darjeeling' }],
  });
  const order = flat(tree);
  const cards = order.findIndex((n) => n.type === 'Cards');
  const saved = order.findIndex((n) => (n.children || []).flat(Infinity).includes('Home to Darjeeling'));
  assert.ok(cards > -1 && saved > cards);
});

test('a blocked-location error offers an Open settings button, a plain error does not', () => {
  const plain = render({ locationError: 'Location permission denied.' });
  assert.equal(byLabel(plain.tree, 'Open location settings'), undefined);

  const blocked = render({
    locationError: 'Location is turned off for this app.',
    onOpenLocationSettings: () => blocked.calls.push('settings'),
  });
  byLabel(blocked.tree, 'Open location settings').props.onPress();
  assert.deepEqual(blocked.calls, ['settings']);
});
