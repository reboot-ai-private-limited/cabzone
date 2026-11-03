import test from 'node:test';
import assert from 'node:assert/strict';
import { splitPlaceLabel } from './ride-route-strip-utils.ts';

test('splitPlaceLabel uses the first segment as the name and keeps the full address as detail', () => {
  assert.deepEqual(splitPlaceLabel('City Centre Mall, Siliguri'), {
    name: 'City Centre Mall',
    detail: 'City Centre Mall, Siliguri',
  });
  assert.deepEqual(splitPlaceLabel('Kurseong Hill Station'), {
    name: 'Kurseong Hill Station',
    detail: 'Kurseong Hill Station',
  });
});

test('splitPlaceLabel trims and tolerates empty or comma-only labels', () => {
  assert.deepEqual(splitPlaceLabel('  New Jalpaiguri (NJP) Railway Station , Siliguri '), {
    name: 'New Jalpaiguri (NJP) Railway Station',
    detail: 'New Jalpaiguri (NJP) Railway Station , Siliguri',
  });
  assert.deepEqual(splitPlaceLabel('   '), { name: '', detail: '' });
  assert.deepEqual(splitPlaceLabel(',Siliguri'), { name: ',Siliguri', detail: ',Siliguri' });
});
