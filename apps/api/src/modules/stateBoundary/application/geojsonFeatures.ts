import type { StateFeature } from './useCases/importStateBoundaries.usecase.js';

/** Standard codes for every Indian state and UT, keyed by normalised name (see `normalizeName`). */
const NAME_TO_CODE: Record<string, string> = {
  'ANDAMAN AND NICOBAR ISLANDS': 'AN',
  'ANDHRA PRADESH': 'AP',
  'ARUNACHAL PRADESH': 'AR',
  ASSAM: 'AS',
  BIHAR: 'BR',
  CHANDIGARH: 'CH',
  CHHATTISGARH: 'CG',
  'DADRA AND NAGAR HAVELI AND DAMAN AND DIU': 'DN',
  'DADRA AND NAGAR HAVELI': 'DN',
  'DAMAN AND DIU': 'DN',
  DELHI: 'DL',
  'NCT OF DELHI': 'DL',
  GOA: 'GA',
  GUJARAT: 'GJ',
  HARYANA: 'HR',
  'HIMACHAL PRADESH': 'HP',
  'JAMMU AND KASHMIR': 'JK',
  JHARKHAND: 'JH',
  KARNATAKA: 'KA',
  KERALA: 'KL',
  LADAKH: 'LA',
  LAKSHADWEEP: 'LD',
  'MADHYA PRADESH': 'MP',
  MAHARASHTRA: 'MH',
  MANIPUR: 'MN',
  MEGHALAYA: 'ML',
  MIZORAM: 'MZ',
  NAGALAND: 'NL',
  ODISHA: 'OD',
  ORISSA: 'OD',
  PUDUCHERRY: 'PY',
  PONDICHERRY: 'PY',
  PUNJAB: 'PB',
  RAJASTHAN: 'RJ',
  SIKKIM: 'SK',
  'TAMIL NADU': 'TN',
  TELANGANA: 'TS',
  TRIPURA: 'TR',
  'UTTAR PRADESH': 'UP',
  UTTARAKHAND: 'UK',
  UTTARANCHAL: 'UK',
  'WEST BENGAL': 'WB',
};

const NAME_KEYS = [
  'stateName',
  'state_name',
  'ST_NM',
  'NAME_1',
  'STATE',
  'STATE_UT',
  'STNAME',
  'NAME',
];

/** Plain 2-3 letter code properties. */
const PLAIN_CODE_KEYS = ['stateCode', 'state_code', 'ST_CODE', 'STATE_CODE'];
/** Prefixed codes such as `IN-WB` (ISO 3166-2) or `IN.WB` (HASC); the state is the last part. */
const PREFIXED_CODE_KEYS = ['ISO_3166_2', 'ISO3166_2', 'HASC_1'];

const VERSION_KEYS = ['sourceVersion', 'datasetVersion', 'dataset_version', 'version'];

interface RawFeature {
  type?: string;
  properties?: Record<string, unknown> | null;
  geometry?: unknown;
}

type RawRoot = { features?: RawFeature[]; version?: unknown; name?: unknown } & RawFeature;

const nonEmptyString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

/** "Jammu & Kashmir", "jammu and kashmir" and "JAMMU  AND KASHMIR" all become one key. */
function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function codeFromProps(lower: Map<string, unknown>): string | undefined {
  for (const key of PLAIN_CODE_KEYS) {
    const v = nonEmptyString(lower.get(key.toLowerCase()));
    if (v !== undefined && /^[A-Za-z]{2,3}$/.test(v)) return v.toUpperCase();
  }
  for (const key of PREFIXED_CODE_KEYS) {
    const v = nonEmptyString(lower.get(key.toLowerCase()));
    const last = v?.split(/[-.]/).pop();
    if (v !== undefined && /[-.]/.test(v) && last !== undefined && /^[A-Za-z]{2,3}$/.test(last)) {
      return last.toUpperCase();
    }
  }
  return undefined;
}

function rawFeatures(input: unknown): RawFeature[] {
  const root = input as RawRoot | null;
  if (root?.type === 'FeatureCollection' && Array.isArray(root.features)) return root.features;
  if (root?.type === 'Feature') return [root];
  return [];
}

/**
 * Accepts a FeatureCollection or a single Feature and returns import-ready features. Everything is
 * read from the file: the code from a code property (`stateCode`, `ST_CODE`, ISO/HASC), else from
 * the state name (`stateName`, `ST_NM`, `NAME_1`, `STATE`, …) via the standard India table. A
 * feature whose code cannot be determined keeps none and is rejected upstream.
 */
export function featuresFromGeoJson(input: unknown): StateFeature[] {
  return rawFeatures(input).map((f) => {
    const lower = new Map(Object.entries(f.properties ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const name = NAME_KEYS.map((k) => nonEmptyString(lower.get(k.toLowerCase()))).find(
      (v) => v !== undefined,
    );
    const code = codeFromProps(lower) ?? (name ? NAME_TO_CODE[normalizeName(name)] : undefined);
    return {
      properties: {
        ...(code ? { stateCode: code } : {}),
        ...(name ? { stateName: name } : {}),
      },
      geometry: f.geometry,
    };
  });
}

/**
 * Dataset version recorded on each imported state, taken from the file itself: the collection's
 * `version` / `datasetVersion` / `sourceVersion`, or the same property on its first feature.
 */
export function datasetVersionFromGeoJson(input: unknown): string | null {
  const root = input as RawRoot | null;
  const candidates: unknown[] = [
    ...VERSION_KEYS.map((k) => (root as Record<string, unknown> | null)?.[k]),
    ...VERSION_KEYS.map((k) => rawFeatures(input)[0]?.properties?.[k]),
  ];
  for (const c of candidates) {
    const v = typeof c === 'number' ? String(c) : nonEmptyString(c);
    if (v !== undefined) return v.slice(0, 60);
  }
  return null;
}
