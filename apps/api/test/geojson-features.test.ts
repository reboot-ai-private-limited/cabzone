import { describe, expect, it } from 'vitest';
import {
  datasetVersionFromGeoJson,
  featuresFromGeoJson,
} from '../src/modules/stateBoundary/index.js';

const feature = (properties: Record<string, unknown>) => ({
  type: 'Feature',
  properties,
  geometry: null,
});
const collection = (features: unknown[], extra: Record<string, unknown> = {}) => ({
  type: 'FeatureCollection',
  features,
  ...extra,
});

const propsOf = (input: unknown) => featuresFromGeoJson(input).map((f) => f.properties);

describe('featuresFromGeoJson', () => {
  it('reads code and name from the file for any Indian state', () => {
    expect(propsOf(collection([feature({ ST_NM: 'Kerala' })]))).toEqual([
      { stateCode: 'KL', stateName: 'Kerala' },
    ]);
  });

  it('normalises names: case, ampersands, spacing', () => {
    const out = propsOf(
      collection([
        feature({ NAME_1: 'jammu  &  kashmir' }),
        feature({ NAME_1: 'ORISSA' }),
        feature({ NAME_1: 'NCT of Delhi' }),
      ]),
    );
    expect(out.map((p) => p.stateCode)).toEqual(['JK', 'OD', 'DL']);
  });

  it('prefers an explicit code property over the name', () => {
    expect(propsOf(feature({ stateCode: 'wb', ST_NM: 'Something Else' }))).toEqual([
      { stateCode: 'WB', stateName: 'Something Else' },
    ]);
  });

  it('extracts the state from ISO 3166-2 and HASC codes', () => {
    expect(propsOf(feature({ ISO_3166_2: 'IN-BR' }))[0]?.stateCode).toBe('BR');
    expect(propsOf(feature({ HASC_1: 'IN.SK' }))[0]?.stateCode).toBe('SK');
  });

  it('matches property keys case-insensitively', () => {
    expect(propsOf(feature({ st_nm: 'Assam' }))[0]?.stateCode).toBe('AS');
  });

  it('leaves the code empty when it cannot be determined', () => {
    expect(propsOf(feature({ NAME: 'Atlantis' }))).toEqual([{ stateName: 'Atlantis' }]);
    expect(propsOf(feature({ unrelated: 1 }))).toEqual([{}]);
  });
});

describe('datasetVersionFromGeoJson', () => {
  it('takes the version from the collection', () => {
    expect(datasetVersionFromGeoJson(collection([], { version: '2026-01' }))).toBe('2026-01');
    expect(datasetVersionFromGeoJson(collection([], { datasetVersion: 'v7' }))).toBe('v7');
  });

  it('falls back to the first feature, and stringifies numbers', () => {
    expect(datasetVersionFromGeoJson(collection([feature({ version: 3 })]))).toBe('3');
  });

  it('is null when the file states no version', () => {
    expect(datasetVersionFromGeoJson(collection([feature({ ST_NM: 'Assam' })]))).toBeNull();
  });
});
