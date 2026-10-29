import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

for (const app of ['rider-mobile', 'driver-mobile']) {
  const source = readFileSync(
    new URL(`../../../${app}/src/services/location-names.ts`, import.meta.url),
    'utf8',
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText;
  const { locationLabel, createRouteNameResolver } = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  );
  test(`${app}: resolves legacy coordinates, preserves names and shares lookups`, async () => {
    let calls = 0;
    const resolve = createRouteNameResolver(async () => {
      calls++;
      return { formattedAddress: 'Sevoke Road, Siliguri' };
    });
    const point = { lat: 26.7, lng: 88.4, address: 'Pin (26.7000, 88.4000)' };
    const result = await resolve({ items: [{ pickup: point, drop: point }] });
    assert.equal(result.items[0].pickup.address, 'Pickup location');
    await new Promise(setImmediate);
    assert.equal((await resolve({ pickup: point })).pickup.address, 'Sevoke Road, Siliguri');
    assert.equal(calls, 1);
    assert.equal(point.address, 'Pin (26.7000, 88.4000)');
    assert.equal(
      (await resolve({ pickup: { ...point, address: 'Airport Gate 2' } })).pickup.address,
      'Airport Gate 2',
    );
    assert.equal(calls, 1);
  });
  test(`${app}: stalled geocoding never blocks ride data and at most four lookups run at once`, async () => {
    const releases = [];
    let calls = 0;
    const resolve = createRouteNameResolver(() => {
      calls++;
      return new Promise((done) =>
        releases.push(() => done({ formattedAddress: 'Resolved place' })),
      );
    });
    const data = {
      items: Array.from({ length: 20 }, (_, i) => ({
        id: i,
        pickup: { lat: i, lng: 2, address: null },
      })),
    };
    const result = await Promise.race([
      resolve(data),
      new Promise((_, reject) =>
        setImmediate(() => reject(new Error('Ride data waited for geocoding'))),
      ),
    ]);
    assert.equal(result.items.length, 20);
    assert.equal(result.items[0].pickup.address, 'Pickup location');
    assert.equal(calls, 4);
    releases[0]();
    await new Promise(setImmediate);
    assert.equal(calls, 5);
    assert.equal(
      (await resolve({ pickup: data.items[0].pickup })).pickup.address,
      'Resolved place',
    );
    assert.equal(data.items[0].pickup.address, null);
  });
  test(`${app}: lookup failure never exposes coordinates or breaks ride loading`, async () => {
    const resolve = createRouteNameResolver(async () => {
      throw new Error('offline');
    });
    const result = await resolve({
      ride: { pickup: { lat: 1, lng: 2, address: '1.0000, 2.0000' } },
    });
    assert.equal(result.ride.pickup.address, 'Pickup location');
    assert.equal(locationLabel('GPS (1.0000, 2.0000)', 'Current location'), 'Current location');
    assert.equal(locationLabel('12 Station Road', 'Destination'), '12 Station Road');
  });
}
