import type { StateFeature } from './useCases/importStateBoundaries.usecase.js';

const NAME_TO_CODE: Record<string, string> = {
  'WEST BENGAL': 'WB',
  BIHAR: 'BR',
  SIKKIM: 'SK',
  ASSAM: 'AS',
};

const NAME_KEYS = ['stateName', 'ST_NM', 'NAME_1', 'STATE', 'name'];

interface RawFeature {
  type?: string;
  properties?: Record<string, unknown> | null;
  geometry?: unknown;
}

/**
 * Accepts a FeatureCollection or a single Feature and returns import-ready features. A feature's
 * state is taken from `stateCode`, or looked up from its name (`stateName`, `ST_NM`, `NAME_1`,
 * `STATE`, `name`) for the launch states. Anything else keeps no code and is rejected upstream.
 */
export function featuresFromGeoJson(input: unknown): StateFeature[] {
  const root = input as { type?: string; features?: RawFeature[] } & RawFeature;
  const raw: RawFeature[] =
    root?.type === 'FeatureCollection' && Array.isArray(root.features)
      ? root.features
      : root?.type === 'Feature'
        ? [root]
        : [];

  return raw.map((f) => {
    const props = f.properties ?? {};
    const name = NAME_KEYS.map((k) => props[k]).find(
      (v): v is string => typeof v === 'string' && v.trim() !== '',
    );
    const explicit = typeof props['stateCode'] === 'string' ? props['stateCode'].trim() : '';
    const code = explicit !== '' ? explicit : name ? NAME_TO_CODE[name.trim().toUpperCase()] : undefined;
    return {
      properties: {
        ...(code ? { stateCode: code } : {}),
        ...(name ? { stateName: name } : {}),
      },
      geometry: f.geometry,
    };
  });
}
