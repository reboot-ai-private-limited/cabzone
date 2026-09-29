import type {
  GeoJsonGeometry,
  Position,
  ZoneType,
  ZoneValidationResult,
  ZoneViolation,
} from '@cabzone/contracts';
import {
  doBoundingBoxesOverlap,
  doSegmentsIntersect,
  fromPosition,
  getBoundingBox,
  isPointInGeometry,
  validateGeometry,
  Z_CODES,
} from '../../domain/index.js';
import type { ZoneRepositoryPort } from '../../domain/index.js';

export interface ValidateZoneInput {
  type: ZoneType;
  geometry: GeoJsonGeometry;
  excludeZoneId?: string | null | undefined;
}

export interface ValidateZoneDeps {
  zoneRepo: ZoneRepositoryPort;
}

/**
 * Checks whether two GeoJSON geometries overlap.
 */
export function doGeometriesOverlap(g1: GeoJsonGeometry, g2: GeoJsonGeometry): boolean {
  // 1. Fast path: check bounding boxes
  const bb1 = getBoundingBox(g1);
  const bb2 = getBoundingBox(g2);
  if (!doBoundingBoxesOverlap(bb1, bb2)) {
    return false;
  }

  const rings1 = extractRings(g1);
  const rings2 = extractRings(g2);

  // 2. Check if any vertex of g1 is inside g2
  for (const ring of rings1) {
    for (const pos of ring) {
      if (isPointInGeometry(fromPosition(pos), g2)) {
        return true;
      }
    }
  }

  // 3. Check if any vertex of g2 is inside g1
  for (const ring of rings2) {
    for (const pos of ring) {
      if (isPointInGeometry(fromPosition(pos), g1)) {
        return true;
      }
    }
  }

  // 4. Check if any edge of g1 intersects any edge of g2
  for (const r1 of rings1) {
    for (let i = 0; i < r1.length - 1; i++) {
      const a1 = r1[i]!;
      const a2 = r1[i + 1]!;

      for (const r2 of rings2) {
        for (let j = 0; j < r2.length - 1; j++) {
          const b1 = r2[j]!;
          const b2 = r2[j + 1]!;

          if (doSegmentsIntersect(a1, a2, b1, b2, false)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function extractRings(g: GeoJsonGeometry): Position[][] {
  if (g.type === 'Polygon') {
    return g.coordinates;
  }
  const rings: Position[][] = [];
  for (const poly of g.coordinates) {
    for (const ring of poly) {
      rings.push(ring);
    }
  }
  return rings;
}

export class ValidateZoneUseCase {
  constructor(private readonly deps: ValidateZoneDeps) {}

  async execute(input: ValidateZoneInput): Promise<ZoneValidationResult> {
    // 1. Geometry structure validation (Z-001 through Z-006)
    const geomValidation = validateGeometry(input.geometry);
    const violations: ZoneViolation[] = [...geomValidation.violations];

    // If base geometry is structurally invalid, return early
    if (!geomValidation.valid) {
      return {
        valid: false,
        violations,
      };
    }

    // 2. Operational conflict validation (Z-007, Z-008) against active zones
    const activeZones = await this.deps.zoneRepo.list({ status: 'ACTIVE' });

    for (const existing of activeZones) {
      // Skip the zone itself if updating
      if (input.excludeZoneId && existing.id === input.excludeZoneId) {
        continue;
      }

      // Z-008: Conflicting CITY configuration
      if (input.type === 'CITY' && existing.zoneType === 'CITY') {
        if (doGeometriesOverlap(input.geometry, existing.geometry)) {
          violations.push({
            code: Z_CODES.Z008_CONFLICTING_CITY,
            severity: 'ERROR',
            message: `Conflicting CITY configuration: Polygon overlaps active city zone "${existing.name}" (${existing.code}).`,
            offendingZoneId: existing.id,
            offendingGeometry: existing.geometry,
          });
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }
}
