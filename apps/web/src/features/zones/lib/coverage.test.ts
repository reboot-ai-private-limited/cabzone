import { describe, expect, it } from 'vitest';
import type { GeoJsonPolygon, ZoneDto } from '@cabzone/contracts';
import { pickupCoverageOfCity } from './coverage';

/**
 * The percentage of city area covered by coverage zones.
 */

const box = (west: number, south: number, east: number, north: number): GeoJsonPolygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [west, south],
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
  ],
});

function zone(
  id: string,
  geometry: ZoneDto['geometry'],
  type: ZoneDto['type'] = 'CITY',
): ZoneDto {
  return {
    id,
    type,
    zoneType: type,
    name: id,
    code: id,
    stateCode: 'WB',
    parentCityZoneId: null,
    parent_zone_id: null,
    geometry,
    boundary: geometry.type === 'Polygon' ? geometry : { type: 'Polygon', coordinates: [] },
    bufferDistanceM: null,
    status: 'ACTIVE',
    is_active: true,
    currentPricingConfigId: null,
    version: 1,
    supersedesZoneId: null,
    supersededByZoneId: null,
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-09-28T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z',
    priority: 0,
  };
}

// A degree of longitude is not a degree of latitude, so the fractions below are computed from
// the real areas rather than assumed from the coordinates.
const CITY = zone('city', box(88.0, 26.0, 88.4, 26.4), 'CITY');

describe('pickupCoverageOfCity', () => {
  it('reports the fraction of the city a single pickup zone covers', () => {
    // The western half.
    const coverage = pickupCoverageOfCity(CITY, [zone('west', box(88.0, 26.0, 88.2, 26.4))]);
    expect(coverage).toBe(50);
  });

  /**
   * SUMMING THE INTERSECTIONS IS ONLY CORRECT BECAUSE OF Z-2 — no two active zones of the same
   * type may overlap by more than 100 m², so pickup areas are disjoint and their areas add. If
   * that invariant is ever relaxed this function starts double-counting silently, which is why
   * the disjoint case is asserted rather than assumed.
   */
  it('adds disjoint pickup zones', () => {
    const coverage = pickupCoverageOfCity(CITY, [
      zone('west', box(88.0, 26.0, 88.1, 26.4)),
      zone('east', box(88.3, 26.0, 88.4, 26.4)),
    ]);
    expect(coverage).toBe(50);
  });

  it('counts only the part of a pickup zone that falls inside the city', () => {
    // Straddles the northern boundary — legal since Z-1 was retired, and half of it is outside.
    const coverage = pickupCoverageOfCity(CITY, [zone('straddle', box(88.0, 26.2, 88.4, 26.6))]);
    expect(coverage).toBe(50);
  });

  it('never exceeds 100% when a pickup zone is larger than the city', () => {
    const coverage = pickupCoverageOfCity(CITY, [zone('huge', box(87.0, 25.0, 89.0, 27.0))]);
    expect(coverage).toBe(100);
  });

  /**
   * `null`, not `0`. Zero percent coverage is a catastrophe worth shouting about; no city zone
   * or no pickup zones at all is a screen that has nothing to say yet, and rendering "0%
   * covered" for it would be a false alarm on a fresh install.
   */
  it('returns null when there is nothing to measure', () => {
    expect(pickupCoverageOfCity(undefined, [zone('a', box(88, 26, 88.1, 26.1))])).toBeNull();
    expect(pickupCoverageOfCity(CITY, [])).toBeNull();
  });

  it('returns null rather than a wrong number when a polygon is malformed', () => {
    const broken = zone('broken', { type: 'Polygon', coordinates: [[[88, 26]]] });
    expect(pickupCoverageOfCity(CITY, [broken])).toBeNull();
  });

  it('is 0 when a pickup zone misses the city entirely', () => {
    expect(pickupCoverageOfCity(CITY, [zone('far', box(90.0, 28.0, 90.1, 28.1))])).toBe(0);
  });
});
