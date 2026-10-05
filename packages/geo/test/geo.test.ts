import { describe, expect, it } from 'vitest';
import {
  distancePointToSegmentM,
  distanceToPolygonM,
  fromPosition,
  getBoundingBox,
  getCentroid,
  haversineDistanceM,
  hasRingSelfIntersection,
  findRingSelfIntersection,
  isPointInGeometry,
  isPointInMultiPolygon,
  isPointInPolygon,
  isPointInIndia,
  assertPointInIndia,
  isValidLatitude,
  isValidLongitude,
  normalizeGeoJson,
  toGeoJsonPoint,
  toPosition,
  validateCoordinates,
  validateGeometry,
  computeGeometryAreaM2,
  Z_CODES,
  isRingCounterClockwise,
  normalizeRingWinding,
  ensureRfc7946Winding,
  computeRingAreaM2,
  computePolygonAreaM2,
  MIN_ZONE_AREA_M2,
  MAX_ZONE_AREA_M2,
  type GeoJsonMultiPolygon,
  type GeoJsonPolygon,
  type GeoPoint,
  type Position,
} from '../src/index.js';

describe('@cabzone/geo Engine', () => {
  // Test fixture: Siliguri region polygon
  const siliguriBox: GeoJsonPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [88.4, 26.7],
        [88.5, 26.7],
        [88.5, 26.8],
        [88.4, 26.8],
        [88.4, 26.7],
      ],
    ],
  };

  describe('Coordinate Conversions & Validation', () => {
    it('converts between GeoPoint and GeoJSON Position [lng, lat]', () => {
      const pt: GeoPoint = { lat: 26.7201, lng: 88.3901 };
      const pos = toPosition(pt);
      expect(pos).toEqual([88.3901, 26.7201]);

      const roundTrip = fromPosition(pos);
      expect(roundTrip).toEqual(pt);
    });

    it('creates standard GeoJSON Point object', () => {
      const pt: GeoPoint = { lat: 26.72, lng: 88.39 };
      const geoJsonPt = toGeoJsonPoint(pt);
      expect(geoJsonPt).toEqual({
        type: 'Point',
        coordinates: [88.39, 26.72],
      });
    });

    it('validates coordinate boundaries accurately', () => {
      expect(isValidLatitude(0)).toBe(true);
      expect(isValidLatitude(-90)).toBe(true);
      expect(isValidLatitude(90)).toBe(true);
      expect(isValidLatitude(90.1)).toBe(false);
      expect(isValidLatitude(-90.1)).toBe(false);
      expect(isValidLatitude(NaN)).toBe(false);

      expect(isValidLongitude(0)).toBe(true);
      expect(isValidLongitude(-180)).toBe(true);
      expect(isValidLongitude(180)).toBe(true);
      expect(isValidLongitude(180.1)).toBe(false);
      expect(isValidLongitude(-180.1)).toBe(false);
      expect(isValidLongitude(NaN)).toBe(false);
    });

    it('detects inverted / swapped coordinates (lat > 90 and lng <= 90)', () => {
      // Swapped: lat is 88.39 (valid lng, invalid lat), lng is 26.72 (valid lat)
      const swapped = validateCoordinates({ lat: 88.39, lng: 26.72 });
      expect(swapped.valid).toBe(false);
      expect(swapped.appearsSwapped).toBe(true);
      expect(swapped.error).toContain('swapped');

      const normal = validateCoordinates({ lat: 26.72, lng: 88.39 });
      expect(normal.valid).toBe(true);
      expect(normal.appearsSwapped).toBeUndefined();
    });

    it('calculates realistic haversine distance in meters', () => {
      // Siliguri (26.72, 88.42) to Bagdogra Airport (26.68, 88.32) ~11-12 km
      const siliguri: GeoPoint = { lat: 26.72, lng: 88.42 };
      const bagdogra: GeoPoint = { lat: 26.68, lng: 88.32 };
      const dist = haversineDistanceM(siliguri, bagdogra);

      expect(dist).toBeGreaterThan(10_500);
      expect(dist).toBeLessThan(12_500);
    });

    it('validates Indian sovereign territory boundary with isPointInIndia', () => {
      // Indian domestic coordinates
      expect(isPointInIndia({ lat: 26.7141, lng: 88.4334 }).inside).toBe(true); // Siliguri
      expect(isPointInIndia({ lat: 26.0984, lng: 87.9482 }).inside).toBe(true); // Kishanganj
      expect(isPointInIndia({ lat: 27.3389, lng: 88.6065 }).inside).toBe(true); // Gangtok
      expect(isPointInIndia({ lat: 28.6139, lng: 77.2090 }).inside).toBe(true); // Delhi
      expect(isPointInIndia({ lat: 19.0760, lng: 72.8777 }).inside).toBe(true); // Mumbai
      expect(isPointInIndia({ lat: 8.0883, lng: 77.5385 }).inside).toBe(true);  // Kanyakumari
      expect(isPointInIndia({ lat: 11.6234, lng: 92.7265 }).inside).toBe(true); // Port Blair

      // Foreign neighbouring coordinates
      const kathmandu = isPointInIndia({ lat: 27.7172, lng: 85.3240 }); // Nepal
      expect(kathmandu.inside).toBe(false);
      expect(kathmandu.country).toBe('Nepal');

      const dhaka = isPointInIndia({ lat: 23.8103, lng: 90.4125 }); // Bangladesh
      expect(dhaka.inside).toBe(false);
      expect(dhaka.country).toBe('Bangladesh');

      const thimphu = isPointInIndia({ lat: 27.4728, lng: 89.6393 }); // Bhutan
      expect(thimphu.inside).toBe(false);
      expect(thimphu.country).toBe('Bhutan');

      const lahore = isPointInIndia({ lat: 31.5204, lng: 74.3587 }); // Pakistan
      expect(lahore.inside).toBe(false);
      expect(lahore.country).toBe('Pakistan');

      const colombo = isPointInIndia({ lat: 6.9271, lng: 79.8612 }); // Sri Lanka
      expect(colombo.inside).toBe(false);
      expect(colombo.country).toBe('Sri Lanka');

      // Distant foreign coordinates
      const newYork = isPointInIndia({ lat: 40.7128, lng: -74.0060 });
      expect(newYork.inside).toBe(false);
      expect(newYork.country).toBe('Outside India');

      expect(() => assertPointInIndia({ lat: 27.7172, lng: 85.3240 }, 'Pickup')).toThrow(
        'OUTSIDE_INDIA: Pickup must be within India',
      );
    });
  });


  describe('Geometry Validation Rules (Z-001 through Z-006)', () => {
    it('accepts valid simple closed polygon', () => {
      const res = validateGeometry(siliguriBox);
      expect(res.valid).toBe(true);
      expect(res.violations).toHaveLength(0);
    });

    it('Z-001: rejects null, undefined, or malformed geometry structure', () => {
      expect(validateGeometry(null).valid).toBe(false);
      expect(validateGeometry(null).violations[0]?.code).toBe(Z_CODES.Z001_INVALID_GEOMETRY);

      expect(validateGeometry({ type: 'Polygon', coordinates: [] }).valid).toBe(false);
      expect(validateGeometry({ type: 'Polygon', coordinates: 'not-array' }).valid).toBe(false);
    });

    it('Z-006: rejects unsupported geometry types (e.g. LineString, Point)', () => {
      const lineString = {
        type: 'LineString',
        coordinates: [
          [88.4, 26.7],
          [88.5, 26.8],
        ],
      };
      const res = validateGeometry(lineString);
      expect(res.valid).toBe(false);
      expect(res.violations[0]?.code).toBe(Z_CODES.Z006_UNSUPPORTED_GEOMETRY);
    });

    it('Z-002: rejects open polygon rings (first vertex != last vertex)', () => {
      const openPolygon = {
        type: 'Polygon',
        coordinates: [
          [
            [88.4, 26.7],
            [88.5, 26.7],
            [88.5, 26.8],
            [88.4, 26.8],
            // missing closing [88.4, 26.7]
          ],
        ],
      };
      const res = validateGeometry(openPolygon);
      expect(res.valid).toBe(false);
      expect(res.violations.some((v) => v.code === Z_CODES.Z002_RING_NOT_CLOSED)).toBe(true);
    });

    it('Z-003: rejects polygons with fewer than 3 distinct vertices', () => {
      // 2 distinct vertices (line collapsed back and forth)
      const collapsedLine = {
        type: 'Polygon',
        coordinates: [
          [
            [88.4, 26.7],
            [88.5, 26.7],
            [88.4, 26.7],
            [88.4, 26.7],
          ],
        ],
      };
      const res = validateGeometry(collapsedLine);
      expect(res.valid).toBe(false);
      expect(res.violations.some((v) => v.code === Z_CODES.Z003_MINIMUM_VERTICES)).toBe(true);
    });

    it('Z-004: rejects polygons with coordinates out of bounds', () => {
      const outOfBounds = {
        type: 'Polygon',
        coordinates: [
          [
            [88.4, 26.7],
            [185.0, 26.7], // invalid lng
            [88.5, 26.8],
            [88.4, 26.8],
            [88.4, 26.7],
          ],
        ],
      };
      const res = validateGeometry(outOfBounds);
      expect(res.valid).toBe(false);
      expect(res.violations.some((v) => v.code === Z_CODES.Z004_COORDINATE_OUT_OF_BOUNDS)).toBe(true);
    });

    it('Z-005: rejects self-intersecting / bow-tie polygons', () => {
      // Bow-tie polygon (edges cross in the middle forming an hourglass)
      const bowTie = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [0, 1],
            [1, 0],
            [0, 0],
          ],
        ],
      };
      const res = validateGeometry(bowTie);
      expect(res.valid).toBe(false);
      expect(res.violations.some((v) => v.code === Z_CODES.Z005_SELF_INTERSECTION)).toBe(true);
      expect(hasRingSelfIntersection(bowTie.coordinates[0]! as Position[])).toBe(true);
    });

    it('validates MultiPolygon geometry with multiple disconnected rings', () => {
      const multiPoly: GeoJsonMultiPolygon = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [88.1, 26.1],
              [88.2, 26.1],
              [88.2, 26.2],
              [88.1, 26.2],
              [88.1, 26.1],
            ],
          ],
          [
            [
              [88.5, 26.5],
              [88.6, 26.5],
              [88.6, 26.6],
              [88.5, 26.6],
              [88.5, 26.5],
            ],
          ],
        ],
      };
      const res = validateGeometry(multiPoly);
      expect(res.valid).toBe(true);
      expect(res.violations).toHaveLength(0);
    });

    it('rejects MultiPolygon if any sub-polygon contains an invalid ring', () => {
      const multiWithBadRing = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [88.1, 26.1],
              [88.2, 26.1],
              [88.2, 26.2],
              [88.1, 26.2],
              [88.1, 26.1],
            ],
          ],
          [
            [
              [88.5, 26.5],
              [88.6, 26.5],
              [88.6, 26.6], // unclosed ring
            ],
          ],
        ],
      };
      const res = validateGeometry(multiWithBadRing);
      expect(res.valid).toBe(false);
      expect(res.violations.length).toBeGreaterThan(0);
    });
  });

  describe('GeoJSON Normalization', () => {
    it('normalizes direct Polygon object', () => {
      const normalized = normalizeGeoJson(siliguriBox);
      expect(normalized.type).toBe('Polygon');
      expect((normalized as GeoJsonPolygon).coordinates).toEqual(siliguriBox.coordinates);
    });

    it('normalizes Feature containing a Polygon', () => {
      const feature = {
        type: 'Feature',
        properties: { name: 'Siliguri City' },
        geometry: siliguriBox,
      };
      const normalized = normalizeGeoJson(feature);
      expect(normalized.type).toBe('Polygon');
    });

    it('normalizes FeatureCollection with multiple features into a MultiPolygon', () => {
      const collection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { id: 1 },
            geometry: siliguriBox,
          },
          {
            type: 'Feature',
            properties: { id: 2 },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [89.0, 27.0],
                  [89.1, 27.0],
                  [89.1, 27.1],
                  [89.0, 27.1],
                  [89.0, 27.0],
                ],
              ],
            },
          },
        ],
      };
      const normalized = normalizeGeoJson(collection);
      expect(normalized.type).toBe('MultiPolygon');
      expect((normalized as GeoJsonMultiPolygon).coordinates).toHaveLength(2);
    });

    it('throws descriptive error on invalid GeoJSON root type', () => {
      expect(() => normalizeGeoJson({ type: 'Point', coordinates: [88.4, 26.7] })).toThrow(
        /Unsupported/i,
      );
    });
  });

  describe('Point-in-Polygon & MultiPolygon Containment', () => {
    it('correctly identifies points inside and outside a simple polygon', () => {
      // Siliguri box: lng 88.4 to 88.5, lat 26.7 to 26.8
      const insidePoint: GeoPoint = { lat: 26.75, lng: 88.45 };
      const outsidePoint: GeoPoint = { lat: 26.85, lng: 88.55 };

      expect(isPointInPolygon(insidePoint, siliguriBox)).toBe(true);
      expect(isPointInPolygon(outsidePoint, siliguriBox)).toBe(false);
      expect(isPointInGeometry(insidePoint, siliguriBox)).toBe(true);
      expect(isPointInGeometry(outsidePoint, siliguriBox)).toBe(false);
    });

    it('respects interior holes in a Polygon', () => {
      // 10x10 outer box [0,0] to [10,10], hole [3,3] to [7,7]
      const donutPolygon: GeoJsonPolygon = {
        type: 'Polygon',
        coordinates: [
          // Outer ring
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
          // Hole ring
          [
            [3, 3],
            [7, 3],
            [7, 7],
            [3, 7],
            [3, 3],
          ],
        ],
      };

      const inBody: GeoPoint = { lat: 1, lng: 1 };
      const inHole: GeoPoint = { lat: 5, lng: 5 };
      const outside: GeoPoint = { lat: 12, lng: 12 };

      expect(isPointInPolygon(inBody, donutPolygon)).toBe(true);
      expect(isPointInPolygon(inHole, donutPolygon)).toBe(false); // In the hole = outside
      expect(isPointInPolygon(outside, donutPolygon)).toBe(false);
    });

    it('checks containment across MultiPolygon components', () => {
      const multiPoly: GeoJsonMultiPolygon = {
        type: 'MultiPolygon',
        coordinates: [
          // Island 1: [0,0] to [2,2]
          [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
              [0, 0],
            ],
          ],
          // Island 2: [5,5] to [7,7]
          [
            [
              [5, 5],
              [7, 5],
              [7, 7],
              [5, 7],
              [5, 5],
            ],
          ],
        ],
      };

      expect(isPointInMultiPolygon({ lat: 1, lng: 1 }, multiPoly)).toBe(true);
      expect(isPointInMultiPolygon({ lat: 6, lng: 6 }, multiPoly)).toBe(true);
      // In the water between the two islands
      expect(isPointInMultiPolygon({ lat: 3.5, lng: 3.5 }, multiPoly)).toBe(false);
    });
  });

  describe('Distance & Bounding Calculations', () => {
    it('returns distance 0 if point is inside polygon', () => {
      const inside: GeoPoint = { lat: 26.75, lng: 88.45 };
      expect(distanceToPolygonM(inside, siliguriBox)).toBe(0);
    });

    it('calculates distance to nearest polygon boundary when point is outside', () => {
      // 0.05 degrees North of the top edge (lat 26.8) at lng 88.45
      const northPoint: GeoPoint = { lat: 26.85, lng: 88.45 };
      const dist = distanceToPolygonM(northPoint, siliguriBox);

      // 0.05 degrees latitude is approx 5.5 km
      expect(dist).toBeGreaterThan(5_000);
      expect(dist).toBeLessThan(6_000);
    });

    it('calculates distance point to segment accurately', () => {
      const pt: GeoPoint = { lat: 1, lng: 0.5 };
      const a = [0, 0] as [number, number];
      const b = [1, 0] as [number, number];
      // Point (0.5, 1) is 1 degree latitude North of the segment from (0,0) to (1,0)
      const dist = distancePointToSegmentM(pt, a, b);
      // 1 degree lat ~ 111 km
      expect(dist).toBeGreaterThan(110_000);
      expect(dist).toBeLessThan(112_000);
    });

    it('calculates bounding box and centroid of geometry', () => {
      const bbox = getBoundingBox(siliguriBox);
      expect(bbox).toEqual({
        minLng: 88.4,
        minLat: 26.7,
        maxLng: 88.5,
        maxLat: 26.8,
      });

      const centroid = getCentroid(siliguriBox);
      expect(centroid.lat).toBeCloseTo(26.75, 4);
      expect(centroid.lng).toBeCloseTo(88.45, 4);
    });
  });

  describe('Winding Order & RFC 7946 Compliance (Anti-Inversion)', () => {
    // CCW: (0,0) -> (1,0) -> (1,1) -> (0,1) -> (0,0)
    const ccwRing: Position[] = [
      [88.4, 26.7],
      [88.5, 26.7],
      [88.5, 26.8],
      [88.4, 26.8],
      [88.4, 26.7],
    ];

    // CW (Clockwise reversed)
    const cwRing: Position[] = [
      [88.4, 26.7],
      [88.4, 26.8],
      [88.5, 26.8],
      [88.5, 26.7],
      [88.4, 26.7],
    ];

    it('distinguishes counter-clockwise (CCW) vs clockwise (CW) rings', () => {
      expect(isRingCounterClockwise(ccwRing)).toBe(true);
      expect(isRingCounterClockwise(cwRing)).toBe(false);
    });

    it('normalizes ring winding order accurately', () => {
      const normalizedCcw = normalizeRingWinding(cwRing, true);
      expect(isRingCounterClockwise(normalizedCcw)).toBe(true);

      const normalizedCw = normalizeRingWinding(ccwRing, false);
      expect(isRingCounterClockwise(normalizedCw)).toBe(false);
    });

    it('enforces RFC 7946 winding on polygons (CCW exterior ring, CW hole)', () => {
      // Create a polygon with deliberately clockwise exterior ring
      const deliberateCwPolygon: GeoJsonPolygon = {
        type: 'Polygon',
        coordinates: [
          cwRing, // Exterior (deliberately CW)
          ccwRing, // Hole (deliberately CCW)
        ],
      };

      const normalized = ensureRfc7946Winding(deliberateCwPolygon);

      // Exterior must be normalized to CCW (stops Mongo whole-earth inversion)
      expect(isRingCounterClockwise(normalized.coordinates[0]!)).toBe(true);
      // Interior hole must be normalized to CW
      expect(isRingCounterClockwise(normalized.coordinates[1]!)).toBe(false);
    });

    it('calculates polygon area in square meters', () => {
      const areaM2 = computePolygonAreaM2(ccwRing.length ? [ccwRing] : []);
      // 0.1 deg x 0.1 deg near Siliguri is approx 110-120 km² (110M to 125M m²)
      expect(areaM2).toBeGreaterThan(100_000_000);
      expect(areaM2).toBeLessThan(130_000_000);
    });

    it('rejects sub-hectare polygon with Z-MIN-AREA violation', () => {
      // Tiny micro-polygon: 0.00005 deg x 0.00005 deg (~5 meters x 5 meters = ~25 m² < 10,000 m²)
      const tinyPolygon: GeoJsonPolygon = {
        type: 'Polygon',
        coordinates: [
          [
            [88.40000, 26.70000],
            [88.40005, 26.70000],
            [88.40005, 26.70005],
            [88.40000, 26.70005],
            [88.40000, 26.70000],
          ],
        ],
      };

      const res = validateGeometry(tinyPolygon);
      expect(res.valid).toBe(false);
      expect(res.violations.some((v) => v.code === Z_CODES.Z010_MIN_AREA)).toBe(true);
      expect(res.violations[0]?.message).toContain('below minimum operational threshold');
    });

    it('rejects gigantic polygon (> 100,000 km²) with Z-MAX-AREA violation', () => {
      // Huge polygon spanning 15 deg x 15 deg across India (~ 1,500 km x 1,500 km > 2,000,000 km²)
      const giantPolygon: GeoJsonPolygon = {
        type: 'Polygon',
        coordinates: [
          [
            [75.0, 15.0],
            [90.0, 15.0],
            [90.0, 30.0],
            [75.0, 30.0],
            [75.0, 15.0],
          ],
        ],
      };

      const res = validateGeometry(giantPolygon);
      expect(res.valid).toBe(false);
      expect(res.violations.some((v) => v.code === Z_CODES.Z011_MAX_AREA)).toBe(true);
      expect(res.violations[0]?.message).toContain('exceeds maximum operational ceiling');
    });

    it('skips the operational area limits when enforceOperationalArea is false', () => {
      const giantPolygon: GeoJsonPolygon = {
        type: 'Polygon',
        coordinates: [
          [
            [75.0, 15.0],
            [90.0, 15.0],
            [90.0, 30.0],
            [75.0, 30.0],
            [75.0, 15.0],
          ],
        ],
      };

      expect(validateGeometry(giantPolygon, { enforceOperationalArea: false }).valid).toBe(true);
    });

    it('still applies structural checks when the area limits are skipped', () => {
      const openRing = {
        type: 'Polygon',
        coordinates: [
          [
            [75.0, 15.0],
            [90.0, 15.0],
            [90.0, 30.0],
            [75.0, 30.0],
          ],
        ],
      };

      expect(validateGeometry(openRing, { enforceOperationalArea: false }).valid).toBe(false);
    });
  });
});

describe('ring self-intersection edge cases', () => {
  it('does not flag repeated consecutive vertices on a valid ring', () => {
    const ring: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    expect(hasRingSelfIntersection(ring)).toBe(false);
  });

  it('still flags a real bow-tie, reports where, and works with repeated vertices around it', () => {
    const ring: [number, number][] = [
      [0, 0],
      [1, 1],
      [1, 1],
      [1, 0],
      [0, 1],
      [0, 0],
    ];
    expect(hasRingSelfIntersection(ring)).toBe(true);
    expect(findRingSelfIntersection(ring)).toMatchObject({ edgeA: 0 });
  });

  it('includes the crossing edges in the violation message', () => {
    const res = validateGeometry(
      {
        type: 'Polygon',
        coordinates: [
          [
            [88.0, 26.0],
            [88.2, 26.2],
            [88.2, 26.0],
            [88.0, 26.2],
            [88.0, 26.0],
          ],
        ],
      },
      { enforceOperationalArea: false },
    );
    expect(res.violations[0]?.message).toMatch(/edges \d+ and \d+, near \[/);
  });
});

describe('ring self-intersection: tiny-scale geometry', () => {
  it('does not flag a valid ring whose vertex passes 1e-10 deg from another edge', () => {
    const ring: [number, number][] = [
      [0, 0],
      [1, 1],
      [1, 0],
      [0.5 + 1e-10, 0.5],
      [0.2, 0],
      [0, 0],
    ];
    expect(hasRingSelfIntersection(ring)).toBe(false);
  });

  it('does not flag a sub-metre wiggle at a corner', () => {
    const ring: [number, number][] = [
      [0, 0],
      [1, 0],
      [1 - 1e-11, 1e-11],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    expect(hasRingSelfIntersection(ring)).toBe(false);
  });

  it('still catches a genuine bow-tie at a tiny scale', () => {
    const s = 1e-6;
    const ring: [number, number][] = [
      [88, 26],
      [88 + s, 26 + s],
      [88 + s, 26],
      [88, 26 + s],
      [88, 26],
    ];
    expect(hasRingSelfIntersection(ring)).toBe(true);
  });
});
