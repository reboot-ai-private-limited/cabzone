import test from 'node:test';
import assert from 'node:assert/strict';
import { getDeviceCoordinates, locationPermissionState } from './device-location.ts';

const pos = (latitude, longitude, accuracy = 20) => ({ coords: { latitude, longitude, accuracy } });
const never = () => new Promise(() => {});
const instantWait = () => Promise.resolve();

function api(overrides = {}) {
  return {
    requestForegroundPermissionsAsync: async () => ({ granted: true }),
    getLastKnownPositionAsync: async () => null,
    getCurrentPositionAsync: async () => pos(26.72712345, 88.43345678),
    ...overrides,
  };
}

test('returns null without asking for a position when permission is denied', async () => {
  let asked = false;
  const result = await getDeviceCoordinates(
    api({
      requestForegroundPermissionsAsync: async () => ({ granted: false }),
      getCurrentPositionAsync: async () => {
        asked = true;
        return pos(1, 1);
      },
    }),
  );
  assert.equal(result, null);
  assert.equal(asked, false);
});

test('uses a recent accurate last-known fix without waiting for a fresh one', async () => {
  let freshCalled = false;
  const result = await getDeviceCoordinates(
    api({
      getLastKnownPositionAsync: async () => pos(26.7141, 88.425, 35),
      getCurrentPositionAsync: async () => {
        freshCalled = true;
        return pos(0, 0);
      },
    }),
  );
  assert.deepEqual(result, { lat: 26.7141, lng: 88.425, accuracyM: 35, source: 'recent' });
  assert.equal(freshCalled, false);
});

test('rounds a fresh fix to five decimals', async () => {
  const result = await getDeviceCoordinates(api());
  assert.deepEqual(result, { lat: 26.72712, lng: 88.43346, accuracyM: 20, source: 'fresh' });
});

test('does not hang when no fresh fix ever arrives: falls back to a stale last-known fix', async () => {
  const calls = [];
  const result = await getDeviceCoordinates(
    api({
      getLastKnownPositionAsync: async (options) => {
        calls.push(options);
        return options.requiredAccuracy === undefined ? pos(26.7, 88.4, 400) : null;
      },
      getCurrentPositionAsync: never,
    }),
    { wait: instantWait },
  );
  assert.deepEqual(result, { lat: 26.7, lng: 88.4, accuracyM: 400, source: 'stale' });
  assert.equal(calls.length, 2);
});

test('returns null (not a hang) when nothing is available at all', async () => {
  const result = await getDeviceCoordinates(
    api({ getCurrentPositionAsync: never }),
    { wait: instantWait },
  );
  assert.equal(result, null);
});

test('a failing fresh lookup and a failing last-known lookup both degrade to null', async () => {
  const result = await getDeviceCoordinates(
    api({
      getLastKnownPositionAsync: async () => {
        throw new Error('no provider');
      },
      getCurrentPositionAsync: async () => {
        throw new Error('timeout');
      },
    }),
  );
  assert.equal(result, null);
});

test('withTimeout returns the value, or the fallback when slow or failing', async () => {
  const { withTimeout } = await import('./device-location.ts');
  const later = () => new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(await withTimeout(Promise.resolve('ok'), 50, 'late', later), 'ok');
  assert.equal(await withTimeout(never(), 50, 'late', instantWait), 'late');
  assert.equal(await withTimeout(Promise.reject(new Error('x')), 50, 'failed', never), 'failed');
});

test('locationPermissionState tells a blocked permission from one that can still be asked', () => {
  assert.equal(locationPermissionState({ granted: true, canAskAgain: false }), 'granted');
  assert.equal(locationPermissionState({ granted: false, canAskAgain: true }), 'ask');
  assert.equal(locationPermissionState({ granted: false }), 'ask');
  assert.equal(locationPermissionState({ granted: false, canAskAgain: false }), 'blocked');
});
