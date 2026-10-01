import { describe, expect, it } from 'vitest';
import type { GeoJsonPolygon } from '@cabzone/geo';
import { Z_CODES } from '@cabzone/geo';
import { MemoryZoneRepository } from '../src/modules/zone/infrastructure/persistence/memoryZone.repository.js';
import { ValidateZoneUseCase, type StateLocator } from '../src/modules/zone/application/useCases/validateZone.usecase.js';
import { CreateZoneUseCase } from '../src/modules/zone/application/useCases/createZone.usecase.js';

describe('Phase 6: Zone Integrity & State Containment', () => {
  const polyWB: GeoJsonPolygon = {
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

  const polyBR: GeoJsonPolygon = {
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

  const mockStateLocator: StateLocator = {
    findContainingPoint: async (pt) => {
      // WB: lng 88.0..88.5, lat 26.0..27.0
      if (pt.lng >= 88.0 && pt.lng < 88.5 && pt.lat >= 26.0 && pt.lat <= 27.0) {
        return {
          stateCode: 'WB',
          status: 'ACTIVE',
          geometry: polyWB,
        };
      }
      // BR (INACTIVE/DISABLED state): lng 88.5..89.0, lat 26.0..27.0
      if (pt.lng >= 88.5 && pt.lng <= 89.0 && pt.lat >= 26.0 && pt.lat <= 27.0) {
        return {
          stateCode: 'BR',
          status: 'INACTIVE', // Disabled state
          geometry: polyBR,
        };
      }
      return null;
    },
  };

  it('accepts a CITY zone fully contained in an ACTIVE state and derives stateCode', async () => {
    const zoneRepo = new MemoryZoneRepository();
    const validator = new ValidateZoneUseCase({ zoneRepo, stateLocator: mockStateLocator });
    const createUseCase = new CreateZoneUseCase({ zoneRepo, validateZoneUseCase: validator });

    const validCityPoly: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [88.1, 26.1],
          [88.3, 26.1],
          [88.3, 26.3],
          [88.1, 26.3],
          [88.1, 26.1],
        ],
      ],
    };

    const res = await validator.execute({
      type: 'CITY',
      geometry: validCityPoly,
    });

    expect(res.valid).toBe(true);
    expect(res.derivedStateCode).toBe('WB');

    const created = await createUseCase.execute({
      name: 'Siliguri Central',
      code: 'SLG_CENTRAL',
      zoneType: 'CITY',
      geometry: validCityPoly,
      stateCode: 'WB',
    });

    expect(created.stateCode).toBe('WB');
  });

  it('rejects a CITY zone straddling across state boundaries with Z-STATE-OUTSIDE', async () => {
    const zoneRepo = new MemoryZoneRepository();
    const validator = new ValidateZoneUseCase({ zoneRepo, stateLocator: mockStateLocator });
    const createUseCase = new CreateZoneUseCase({ zoneRepo, validateZoneUseCase: validator });

    // Poly starts in WB (lng 88.2) and extends into BR (lng 88.7)
    const straddlingPoly: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [88.2, 26.1],
          [88.7, 26.1],
          [88.7, 26.3],
          [88.2, 26.3],
          [88.2, 26.1],
        ],
      ],
    };

    const res = await validator.execute({
      type: 'CITY',
      geometry: straddlingPoly,
      stateCode: 'WB',
    });

    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.code === Z_CODES.Z_STATE_OUTSIDE)).toBe(true);

    await expect(
      createUseCase.execute({
        name: 'Border Crossing Zone',
        code: 'BORDER_CROSS',
        zoneType: 'CITY',
        geometry: straddlingPoly,
        stateCode: 'WB',
      }),
    ).rejects.toThrow(/Z-STATE-OUTSIDE/);
  });

  it('rejects a CITY zone in a disabled/inactive state with Z-STATE-OUTSIDE', async () => {
    const zoneRepo = new MemoryZoneRepository();
    const validator = new ValidateZoneUseCase({ zoneRepo, stateLocator: mockStateLocator });
    const createUseCase = new CreateZoneUseCase({ zoneRepo, validateZoneUseCase: validator });

    // Poly located inside BR, but BR is INACTIVE
    const disabledStatePoly: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [88.6, 26.1],
          [88.8, 26.1],
          [88.8, 26.3],
          [88.6, 26.3],
          [88.6, 26.1],
        ],
      ],
    };

    const res = await validator.execute({
      type: 'CITY',
      geometry: disabledStatePoly,
      stateCode: 'BR',
    });

    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.code === Z_CODES.Z_STATE_OUTSIDE)).toBe(true);

    await expect(
      createUseCase.execute({
        name: 'Disabled State City',
        code: 'DISABLED_CITY',
        zoneType: 'CITY',
        geometry: disabledStatePoly,
        stateCode: 'BR',
      }),
    ).rejects.toThrow(/Z-STATE-OUTSIDE/);
  });
});
