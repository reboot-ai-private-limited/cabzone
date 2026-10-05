import { describe, expect, it } from 'vitest';
import { calculateStateDistanceBreakdown } from '../src/modules/routing/infrastructure/stateDistanceBreakdown.js';
import { encodePolyline } from '@cabzone/geo';

describe('calculateStateDistanceBreakdown Unit Tests', () => {
  it('calculates state distance breakdown for interstate route between West Bengal and Bihar', () => {
    const siliguri = { lat: 26.7141, lng: 88.4334 };
    const kishanganj = { lat: 26.0984, lng: 87.9482 };
    const totalDistanceM = 121_260; // ~121.26 km

    const breakdown = calculateStateDistanceBreakdown({
      origin: siliguri,
      destination: kishanganj,
      totalDistanceM,
    });

    expect(breakdown.length).toBe(2);

    const wb = breakdown.find((b) => b.stateCode === 'WB');
    const br = breakdown.find((b) => b.stateCode === 'BR');

    expect(wb).toBeDefined();
    expect(br).toBeDefined();
    expect(wb?.stateName).toBe('West Bengal');
    expect(br?.stateName).toBe('Bihar');

    // Verify distance conservation
    const sumM = breakdown.reduce((acc, b) => acc + b.distanceM, 0);
    expect(sumM).toBe(totalDistanceM);

    // Sum of percentages equals 100%
    const sumPct = Math.round(breakdown.reduce((acc, b) => acc + b.percentage, 0));
    expect(sumPct).toBe(100);

    // Both states have substantial distance portions
    expect(wb!.distanceKm).toBeGreaterThan(40);
    expect(br!.distanceKm).toBeGreaterThan(15);
  });

  it('calculates 100% single state for intra-state trip within West Bengal', () => {
    const siliguri = { lat: 26.7141, lng: 88.4334 };
    const darjeeling = { lat: 27.0410, lng: 88.2663 };
    const totalDistanceM = 65_000;

    const breakdown = calculateStateDistanceBreakdown({
      origin: siliguri,
      destination: darjeeling,
      totalDistanceM,
    });

    expect(breakdown.length).toBe(1);
    expect(breakdown[0]?.stateCode).toBe('WB');
    expect(breakdown[0]?.stateName).toBe('West Bengal');
    expect(breakdown[0]?.distanceM).toBe(totalDistanceM);
    expect(breakdown[0]?.distanceKm).toBe(65);
    expect(breakdown[0]?.percentage).toBe(100);
  });

  it('decodes and calculates state distance from actual Google polyline', () => {
    // Waypoints from Siliguri through border into Kishanganj: [lng, lat]
    const waypoints: [number, number][] = [
      [88.4334, 26.7141], // Siliguri (WB)
      [88.3228, 26.6961], // Bagdogra (WB)
      [88.1906, 26.2644], // Islampur (WB)
      [88.0800, 26.1800], // Near Border (WB/BR)
      [87.9482, 26.0984], // Kishanganj (BR)
    ];

    const polyline = encodePolyline(waypoints);
    const totalDistanceM = 98_000;

    const breakdown = calculateStateDistanceBreakdown({
      origin: { lat: 26.7141, lng: 88.4334 },
      destination: { lat: 26.0984, lng: 87.9482 },
      totalDistanceM,
      polyline,
    });

    expect(breakdown.length).toBe(2);
    expect(breakdown.some((b) => b.stateCode === 'WB')).toBe(true);
    expect(breakdown.some((b) => b.stateCode === 'BR')).toBe(true);

    const sumM = breakdown.reduce((acc, b) => acc + b.distanceM, 0);
    expect(sumM).toBe(totalDistanceM);
  });
});
