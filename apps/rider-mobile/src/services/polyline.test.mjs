import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePolyline } from './polyline.ts';

test('decodePolyline decodes the Google reference example to [lng, lat] pairs', () => {
  const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.deepEqual(points, [
    [-120.2, 38.5],
    [-120.95, 40.7],
    [-126.453, 43.252],
  ]);
});

test('decodePolyline returns an empty list for an empty string', () => {
  assert.deepEqual(decodePolyline(''), []);
});
