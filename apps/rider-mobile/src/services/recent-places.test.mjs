import test from 'node:test';
import assert from 'node:assert/strict';
import { placeKey, recentPlacesFromRides, splitPlaceLabel } from './recent-places.ts';

test('splitPlaceLabel separates the place name from the rest of the address', () => {
  assert.deepEqual(splitPlaceLabel('Brinda Apartment, Pritilata Sarani, Ward 39'), {
    name: 'Brinda Apartment',
    address: 'Pritilata Sarani, Ward 39',
  });
  assert.deepEqual(splitPlaceLabel('Shibram Pally'), { name: 'Shibram Pally', address: '' });
});

test('recentPlacesFromRides dedupes by location, includes stops, skips blank addresses, honours the limit', () => {
  const rides = [
    { drop: { lat: 26.7, lng: 88.4, address: 'A, Siliguri' }, stops: [{ lat: 26.71, lng: 88.41, address: 'S1, Siliguri' }] },
    { drop: { lat: 26.7, lng: 88.4, address: 'A, Siliguri' } },
    { drop: { lat: 26.8, lng: 88.5, address: null } },
    { drop: { lat: 26.9, lng: 88.6, address: 'C, Siliguri' } },
  ];
  const places = recentPlacesFromRides(rides, 3);
  assert.deepEqual(places.map((p) => p.name), ['A', 'S1', 'C']);
  assert.equal(places[0].id, placeKey(26.7, 88.4));
  assert.equal(recentPlacesFromRides(rides, 1).length, 1);
});
