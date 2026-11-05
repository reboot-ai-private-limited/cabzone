import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(
  readFileSync(new URL('./ride-proximity.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
const mod = { exports: {} };
vm.runInNewContext(code, { exports: mod.exports, require: () => ({}), Math });
const { proximityInfo, friendlyRideError, distanceMeters } = mod.exports;

const ride = { pickup: { lat: 26.7271, lng: 88.4334 }, drop: { lat: 26.75, lng: 88.46 } };

test('distance is roughly right (about 111 m per 0.001 degree of latitude)', () => {
  const meters = distanceMeters({ lat: 26.7271, lng: 88.4334 }, { lat: 26.7281, lng: 88.4334 });
  assert.ok(meters > 105 && meters < 118, String(meters));
});

test('shows live distance to pickup while en route and flags when inside 200 m', () => {
  const far = proximityInfo('DRIVER_EN_ROUTE', { lat: 26.7301, lng: 88.4334 }, ride);
  assert.match(far.label, /m from pickup$/);
  assert.equal(far.within, false);
  assert.match(far.hint, /within 200 m/);
  const near = proximityInfo('DRIVER_EN_ROUTE', { lat: 26.7275, lng: 88.4334 }, ride);
  assert.equal(near.within, true);
});

test('shows distance to drop during the trip with the 500 m radius', () => {
  const far = proximityInfo('TRIP_STARTED', { lat: 26.7271, lng: 88.4334 }, ride);
  assert.match(far.label, /km from drop$/);
  assert.equal(far.within, false);
  const near = proximityInfo('TRIP_STARTED', { lat: 26.7502, lng: 88.4601 }, ride);
  assert.equal(near.within, true);
});

test('shows nothing without a GPS fix or in other states', () => {
  assert.equal(proximityInfo('DRIVER_EN_ROUTE', null, ride), null);
  assert.equal(proximityInfo('DRIVER_ARRIVED', { lat: 26.7271, lng: 88.4334 }, ride), null);
});

test('turns geofence server errors into plain language', () => {
  assert.equal(
    friendlyRideError(
      'DRIVER_TOO_FAR_FROM_PICKUP: You must be within 200 m of the pickup (currently about 350 m away).',
    ),
    'You are about 350 m from the pickup. Move within 200 m of the pickup to mark arrival.',
  );
  assert.match(
    friendlyRideError(
      'DRIVER_TOO_FAR_FROM_DROP: You must be within 500 m of the drop-off (currently about 1200 m away).',
    ),
    /^You are about 1200 m from the destination\. Get within 500 m/,
  );
  assert.match(
    friendlyRideError('DRIVER_LOCATION_UNAVAILABLE: Turn on location and wait for a GPS fix, then try again.'),
    /Turn on GPS/,
  );
  assert.equal(friendlyRideError('INVALID_RIDE_STATE: Payment must be pending.'), 'Payment must be pending.');
  assert.equal(friendlyRideError('Network request failed'), 'Network request failed');
});
