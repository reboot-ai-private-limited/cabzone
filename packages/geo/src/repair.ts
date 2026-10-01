import polygonClipping from 'polygon-clipping';
import type { GeoJsonGeometry } from './polygon.js';

type Ring = [number, number][];

/**
 * Repairs a polygon whose rings cross themselves (bow-ties, pinched coastlines, duplicated
 * vertices left by simplification) by re-noding it with a self-union. Real-world state borders
 * from open datasets often need this; MongoDB's 2dsphere index rejects such rings outright.
 *
 * The result is always a MultiPolygon-shaped geometry collapsed back to a Polygon when it has a
 * single part. Returns null when nothing valid is left (a degenerate or empty input).
 */
export function repairPolygonalGeometry(geometry: GeoJsonGeometry): GeoJsonGeometry | null {
  const input =
    geometry.type === 'Polygon'
      ? (geometry.coordinates as unknown as Ring[])
      : (geometry.coordinates as unknown as Ring[][]);

  let parts: Ring[][];
  try {
    parts = polygonClipping.union(input as never) as unknown as Ring[][];
  } catch {
    return null;
  }

  const [first] = parts;
  if (first === undefined) return null;
  if (parts.length === 1) return { type: 'Polygon', coordinates: first };
  return { type: 'MultiPolygon', coordinates: parts };
}
