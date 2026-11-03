import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatApproxKm,
  haversineKm,
  popularIntercityDestinations,
  stateNameFor,
} from './intercity-routes.ts';

const SILIGURI = { lat: 26.7271, lng: 88.4334 };

const presets = [
  { id: 'siliguri-city-center', name: 'City Centre Mall, Siliguri', city: 'Siliguri', stateCode: 'WB', category: 'CITY', lat: 26.7271, lng: 88.4334 },
  { id: 'kurseong-town', name: 'Kurseong Hill Station', city: 'Kurseong', stateCode: 'WB', category: 'OUTSTATION', lat: 26.8821, lng: 88.2789 },
  { id: 'darjeeling-mall', name: 'Chowrasta (Darjeeling Mall Road)', city: 'Darjeeling', stateCode: 'WB', category: 'OUTSTATION', lat: 27.041, lng: 88.2663 },
  { id: 'gangtok-mg-marg', name: 'MG Marg, Gangtok (Interstate)', city: 'Gangtok', stateCode: 'SK', category: 'OUTSTATION', lat: 27.3314, lng: 88.6138 },
  { id: 'kalimpong-bazaar', name: 'Kalimpong Main Town', city: 'Kalimpong', stateCode: 'WB', category: 'OUTSTATION', lat: 27.066, lng: 88.4695 },
  { id: 'darjeeling-second', name: 'Darjeeling Station', city: 'Darjeeling', stateCode: 'WB', category: 'OUTSTATION', lat: 27.04, lng: 88.263 },
];

test('haversineKm is about 22 km between Siliguri and Kurseong', () => {
  const km = haversineKm(SILIGURI, { lat: 26.8821, lng: 88.2789 });
  assert.ok(km > 20 && km < 25, `got ${km}`);
  assert.equal(Math.round(haversineKm(SILIGURI, SILIGURI)), 0);
});

test('popular destinations list outstation cities nearest first, one per city', () => {
  const list = popularIntercityDestinations(presets, SILIGURI);
  assert.deepEqual(
    list.map((d) => d.title),
    ['Kurseong', 'Darjeeling', 'Kalimpong', 'Gangtok'].sort(
      (a, b) =>
        list.find((d) => d.title === a).distanceKm - list.find((d) => d.title === b).distanceKm,
    ),
  );
  assert.equal(list.filter((d) => d.title === 'Darjeeling').length, 1);
  assert.ok(!list.some((d) => d.title === 'Siliguri'), 'city presets are not city-to-city trips');
  assert.equal(list.find((d) => d.title === 'Gangtok').caption, 'Sikkim');
  assert.ok(list.every((d, i, all) => i === 0 || all[i - 1].distanceKm <= d.distanceKm));
});

test('destinations that are too close to the pickup are dropped, and the list is capped', () => {
  const nearKurseong = { lat: 26.88, lng: 88.28 };
  const list = popularIntercityDestinations(presets, nearKurseong);
  assert.ok(!list.some((d) => d.title === 'Kurseong'));
  assert.equal(popularIntercityDestinations(presets, SILIGURI, { limit: 2 }).length, 2);
});

test('state names and the distance label are readable', () => {
  assert.equal(stateNameFor('WB'), 'West Bengal');
  assert.equal(stateNameFor('xx'), 'XX');
  assert.equal(stateNameFor(undefined), '');
  assert.equal(formatApproxKm(64.4), '~64 km');
  assert.equal(formatApproxKm(2.34), '~2.3 km');
  assert.equal(formatApproxKm(0.02), '~0.1 km');
});
