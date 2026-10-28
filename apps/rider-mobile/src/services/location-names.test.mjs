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
    assert.equal(result.items[0].pickup.address, 'Sevoke Road, Siliguri');
    assert.equal(calls, 1);
    assert.equal(point.address, 'Pin (26.7000, 88.4000)');
    assert.equal(
      (await resolve({ pickup: { ...point, address: 'Airport Gate 2' } })).pickup.address,
      'Airport Gate 2',
    );
    assert.equal(calls, 1);
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
