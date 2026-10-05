/**
 * Reference table for Indian States & Union Territories.
 * Normalizes state names to 2-letter postal/vehicle state codes and vice-versa.
 */
export const INDIA_STATE_CODES: Record<string, string> = {
  'andhra pradesh': 'AP',
  'arunachal pradesh': 'AR',
  assam: 'AS',
  bihar: 'BR',
  chhattisgarh: 'CG',
  goa: 'GA',
  gujarat: 'GJ',
  haryana: 'HR',
  'himachal pradesh': 'HP',
  jharkhand: 'JH',
  karnataka: 'KA',
  kerala: 'KL',
  'madhya pradesh': 'MP',
  maharashtra: 'MH',
  manipur: 'MN',
  meghalaya: 'ML',
  mizoram: 'MZ',
  nagaland: 'NL',
  odisha: 'OD',
  orissa: 'OD',
  punjab: 'PB',
  rajasthan: 'RJ',
  sikkim: 'SK',
  'tamil nadu': 'TN',
  telangana: 'TG',
  tripura: 'TR',
  'uttar pradesh': 'UP',
  uttarakhand: 'UK',
  'west bengal': 'WB',
  'andaman and nicobar islands': 'AN',
  chandigarh: 'CH',
  'dadra and nagar haveli and daman and diu': 'DN',
  delhi: 'DL',
  'national capital territory of delhi': 'DL',
  'jammu and kashmir': 'JK',
  ladakh: 'LA',
  lakshadweep: 'LD',
  puducherry: 'PY',
  pondicherry: 'PY',
};

export const INDIA_STATE_NAMES_BY_CODE: Record<string, string> = {
  AP: 'Andhra Pradesh',
  AR: 'Arunachal Pradesh',
  AS: 'Assam',
  BR: 'Bihar',
  CG: 'Chhattisgarh',
  GA: 'Goa',
  GJ: 'Gujarat',
  HR: 'Haryana',
  HP: 'Himachal Pradesh',
  JH: 'Jharkhand',
  KA: 'Karnataka',
  KL: 'Kerala',
  MP: 'Madhya Pradesh',
  MH: 'Maharashtra',
  MN: 'Manipur',
  ML: 'Meghalaya',
  MZ: 'Mizoram',
  NL: 'Nagaland',
  OD: 'Odisha',
  PB: 'Punjab',
  RJ: 'Rajasthan',
  SK: 'Sikkim',
  TN: 'Tamil Nadu',
  TG: 'Telangana',
  TR: 'Tripura',
  UP: 'Uttar Pradesh',
  UK: 'Uttarakhand',
  WB: 'West Bengal',
  AN: 'Andaman and Nicobar Islands',
  CH: 'Chandigarh',
  DN: 'Dadra and Nagar Haveli and Daman and Diu',
  DL: 'Delhi',
  JK: 'Jammu and Kashmir',
  LA: 'Ladakh',
  LD: 'Lakshadweep',
  PY: 'Puducherry',
};

/** Normalizes a place or state name string to a 2-letter state code. */
export function normalizeIndiaStateName(name: string): string | null {
  const key = name.trim().toLowerCase().replace(/&/g, 'and');
  return INDIA_STATE_CODES[key] ?? null;
}

/** Looks up official state name from a 2-letter state code. */
export function getStateNameFromCode(code: string): string | null {
  return INDIA_STATE_NAMES_BY_CODE[code.trim().toUpperCase()] ?? null;
}
