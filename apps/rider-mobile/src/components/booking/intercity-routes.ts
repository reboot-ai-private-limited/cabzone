/**
 * Pure helpers for the city-to-city home sheet (popular destination cards).
 * No React Native imports so they can be tested with `node --test`.
 */

export interface IntercityPreset {
  id: string;
  name: string;
  city?: string | undefined;
  stateCode?: string | undefined;
  category?: string | undefined;
  lat: number;
  lng: number;
}

export interface IntercityDestination {
  id: string;
  /** Card title: the destination city. */
  title: string;
  /** Card caption: the state. */
  caption: string;
  /** Full place name used as the drop address. */
  name: string;
  lat: number;
  lng: number;
  /** Straight-line distance from the pickup, rounded to whole kilometres. */
  distanceKm: number;
}

const STATE_NAMES: Record<string, string> = {
  WB: 'West Bengal',
  SK: 'Sikkim',
  BR: 'Bihar',
  AS: 'Assam',
  JH: 'Jharkhand',
  OD: 'Odisha',
  DL: 'Delhi',
};

export function stateNameFor(code: string | undefined): string {
  if (!code) return '';
  return STATE_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

/** Great-circle distance in kilometres. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "Chowrasta (Darjeeling Mall Road)" -> "Darjeeling" when no city is set. */
function cityLabel(preset: IntercityPreset): string {
  if (preset.city?.trim()) return preset.city.trim();
  return preset.name.split(/[,(]/)[0]!.trim();
}

/**
 * Popular intercity destinations, nearest first. Destinations closer than `minKm` to the pickup are
 * dropped: they are not city-to-city trips (the rider is already there).
 */
export function popularIntercityDestinations(
  presets: readonly IntercityPreset[],
  pickup: { lat: number; lng: number },
  options: { limit?: number; minKm?: number } = {},
): IntercityDestination[] {
  const { limit = 6, minKm = 8 } = options;
  const seen = new Set<string>();
  const out: IntercityDestination[] = [];
  for (const preset of presets) {
    if (preset.category && preset.category !== 'OUTSTATION') continue;
    const city = cityLabel(preset);
    const key = city.toLowerCase();
    if (seen.has(key)) continue;
    const distanceKm = Math.round(haversineKm(pickup, preset));
    if (distanceKm < minKm) continue;
    seen.add(key);
    out.push({
      id: preset.id,
      title: city,
      caption: stateNameFor(preset.stateCode),
      name: preset.name,
      lat: preset.lat,
      lng: preset.lng,
      distanceKm,
    });
  }
  return out.sort((x, y) => x.distanceKm - y.distanceKm).slice(0, limit);
}

export function formatApproxKm(distanceKm: number): string {
  if (distanceKm < 10) return `~${Math.max(0.1, Math.round(distanceKm * 10) / 10)} km`;
  return `~${Math.round(distanceKm)} km`;
}
