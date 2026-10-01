import { describe, expect, it } from 'vitest';
import {
  decodePolyline,
  encodePolyline,
  segmentRouteByStates,
  haversineDistanceM,
  fromPosition,
  type GeoJsonPolygon,
  type Position,
} from '../src/index.js';

describe('Polyline Encoding / Decoding', () => {
  it('decodes and encodes polyline with precision 5', () => {
    // Coordinates [lng, lat]
    const originalPoints: Position[] = [
      [88.3953, 26.7271],
      [88.4, 26.75],
      [88.42, 26.8],
    ];

    const encoded = encodePolyline(originalPoints);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decodePolyline(encoded);
    expect(decoded.length).toBe(originalPoints.length);

    for (let i = 0; i < originalPoints.length; i++) {
      expect(decoded[i]![0]).toBeCloseTo(originalPoints[i]![0], 4);
      expect(decoded[i]![1]).toBeCloseTo(originalPoints[i]![1], 4);
    }
  });

  it('handles empty string gracefully', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});

describe('Route State Segmentation (segmentRouteByStates)', () => {
  // Define two square regions side-by-side:
  // Region WB: lng 88.0 to 88.5, lat 26.0 to 27.0
  // Region BR: lng 88.5 to 89.0, lat 26.0 to 27.0
  const regionWB: GeoJsonPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [88.0, 26.0],
        [88.5, 26.0],
        [88.5, 27.0],
        [88.0, 27.0],
        [88.0, 26.0],
      ],
    ],
  };

  const regionBR: GeoJsonPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [88.5, 26.0],
        [89.0, 26.0],
        [89.0, 27.0],
        [88.5, 27.0],
        [88.5, 26.0],
      ],
    ],
  };

  const regions = [
    { code: 'WB', geometry: regionWB },
    { code: 'BR', geometry: regionBR },
  ];

  it('correctly attributes segments for a route crossing WB -> BR -> WB', () => {
    // Route starts in WB (88.2), enters BR (88.7), returns to WB (88.3)
    const points: Position[] = [
      [88.2, 26.5],
      [88.7, 26.5],
      [88.3, 26.5],
    ];

    const segments = segmentRouteByStates(points, regions);
    expect(segments.length).toBe(3);
    expect(segments[0]!.stateCode).toBe('WB');
    expect(segments[1]!.stateCode).toBe('BR');
    expect(segments[2]!.stateCode).toBe('WB');

    // Total distance must match total route haversine
    const totalDist =
      haversineDistanceM(fromPosition(points[0]!), fromPosition(points[1]!)) +
      haversineDistanceM(fromPosition(points[1]!), fromPosition(points[2]!));

    const segmentDistSum = segments.reduce((sum, s) => sum + s.distanceM, 0);
    expect(segmentDistSum).toBe(Math.round(totalDist));
  });

  it('attributes entire route to a single state when fully contained', () => {
    const points: Position[] = [
      [88.1, 26.2],
      [88.2, 26.3],
      [88.3, 26.4],
    ];

    const segments = segmentRouteByStates(points, regions);
    expect(segments.length).toBe(1);
    expect(segments[0]!.stateCode).toBe('WB');
  });

  it('attributes to UNKNOWN when points fall outside all regions', () => {
    const points: Position[] = [
      [85.0, 25.0],
      [85.5, 25.5],
    ];

    const segments = segmentRouteByStates(points, regions);
    expect(segments.length).toBe(1);
    expect(segments[0]!.stateCode).toBe('UNKNOWN');
  });

  it('returns empty array when fewer than 2 points given', () => {
    expect(segmentRouteByStates([], regions)).toEqual([]);
    expect(segmentRouteByStates([[88.1, 26.1]], regions)).toEqual([]);
  });
});

