/**
 * Map themes the rider can pick in Profile. Pure data so it can be tested with `node --test`;
 * the maps apply it through `mapThemeSettings`.
 */

export type MapTheme = 'light' | 'dark' | 'satellite';

export const DEFAULT_MAP_THEME: MapTheme = 'light';

export interface MapThemeOption {
  id: MapTheme;
  label: string;
  /** Ionicons name for the picker. */
  icon: 'sunny-outline' | 'moon-outline' | 'earth-outline';
}

export const MAP_THEME_OPTIONS: readonly MapThemeOption[] = [
  { id: 'light', label: 'Light', icon: 'sunny-outline' },
  { id: 'dark', label: 'Dark', icon: 'moon-outline' },
  { id: 'satellite', label: 'Satellite', icon: 'earth-outline' },
];

export function isMapTheme(value: unknown): value is MapTheme {
  return value === 'light' || value === 'dark' || value === 'satellite';
}

/** Anything unknown (old saved data, bad values) falls back to the default theme. */
export function normalizeMapTheme(value: unknown): MapTheme {
  return isMapTheme(value) ? value : DEFAULT_MAP_THEME;
}

type StyleRule = { featureType?: string; elementType?: string; stylers: Record<string, string>[] };

// Explicit light style: Google Maps otherwise follows the phone's dark mode on Android.
export const GOOGLE_MAPS_LIGHT_STYLE: StyleRule[] = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d8efd3' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#fde9b0' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9e4f5' }] },
];

export const GOOGLE_MAPS_DARK_STYLE: StyleRule[] = [
  { elementType: 'geometry', stylers: [{ color: '#0d1829' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8fa0b5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1829' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0f233a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e2e42' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#162233' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#253d5a' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#18283b' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b2848' }] },
];

export interface MapThemeSettings {
  mapType: 'standard' | 'hybrid';
  /** Undefined for satellite: a custom style would hide the imagery. */
  customMapStyle: StyleRule[] | undefined;
  userInterfaceStyle: 'light' | 'dark';
}

export function mapThemeSettings(theme: MapTheme): MapThemeSettings {
  switch (theme) {
    case 'dark':
      return { mapType: 'standard', customMapStyle: GOOGLE_MAPS_DARK_STYLE, userInterfaceStyle: 'dark' };
    case 'satellite':
      // Hybrid keeps road and place labels on the imagery so pickups stay readable.
      return { mapType: 'hybrid', customMapStyle: undefined, userInterfaceStyle: 'dark' };
    case 'light':
    default:
      return { mapType: 'standard', customMapStyle: GOOGLE_MAPS_LIGHT_STYLE, userInterfaceStyle: 'light' };
  }
}
