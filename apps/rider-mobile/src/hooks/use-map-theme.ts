import { useMemo } from 'react';
import { useAuth } from '@/context/auth-context';
import { mapThemeSettings, normalizeMapTheme } from '@/services/map-theme';

/** The rider's saved map theme, as props ready to spread onto a MapView. */
export function useMapTheme() {
  const { preferences } = useAuth();
  const theme = normalizeMapTheme(preferences.mapTheme);
  return useMemo(() => ({ theme, ...mapThemeSettings(theme) }), [theme]);
}
