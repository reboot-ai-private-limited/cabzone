/**
 * Theme layer: Light / Dark / System.
 *
 * Screens keep importing `colors` and building styles with `createStyles(() => ({ ... }))`.
 * - `colors` always reflects the active theme when read at render time.
 * - `createStyles` evaluates its factory with the original light palette and then, in dark mode,
 *   remaps colour values by role (background / border / text). Results are cached per theme, so a
 *   theme change only costs one re-evaluation per stylesheet.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, StatusBar, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { lightColors } from './colors';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedScheme = 'light' | 'dark';

const STORAGE_KEY = 'cabzone.theme.preference';

// ---- Dark value maps (light hex -> dark hex), keyed by the role the colour plays -------------

const BG_MAP: Record<string, string> = {
  '#FFFFFE': '#120E0B', // page background
  '#FFFFFF': '#1D1814', // cards / surfaces
  '#F8FAFC': '#1D1814',
  '#FAF8F5': '#1D1814',
  '#F3F4F6': '#26201B',
  '#F1ECE6': '#26201B',
  '#F3EDE4': '#26201B',
  '#E5E7EB': '#3A322B',
  '#E2E8F0': '#3A322B',
  '#CBD5E1': '#3A322B',
  '#D1D5DB': '#3A322B',
  '#FFFBEB': '#2B2210',
  '#FFFBF2': '#2B2210',
  '#FFF9EC': '#2B2210',
  '#FFF3D6': '#33280F',
  '#FFF0D6': '#33280F',
  '#FEF3C7': '#33280F',
  '#FDE68A': '#4A3A12',
  '#F6E3B4': '#4A3A12',
  '#F6D9B4': '#4A3A12',
  '#F9DDB8': '#4A3A12',
  '#FEF2F2': '#2E1816',
  '#FEE2E2': '#3A1B1B',
  '#FECACA': '#4A2323',
  '#DCFCE7': '#14301C',
  '#ECFDF5': '#102A20',
  '#BBF7D0': '#1B4A2B',
  '#FBBF24': '#A16207', // amber fills carry brown->cream text in dark, so they go bronze
  '#F59E0B': '#A16207',
  '#FFD59A': '#8A5A12',
  '#FB923C': '#9A4A12',
  '#3A2414': '#6B4A2E', // deep brown used as a fill (chips, tags) stays brown but lifts off the page
  '#2A1A0E': '#6B4A2E',
};

const BORDER_MAP: Record<string, string> = {
  '#FFFFFF': '#1D1814',
  '#E5E5E5': '#3A322B',
  '#F0F0F0': '#2A241F',
  '#E5E7EB': '#3A322B',
  '#E2E8F0': '#3A322B',
  '#CBD5E1': '#3A322B',
  '#D1D5DB': '#3A322B',
  '#C4B5A5': '#4A3F35',
  '#FCA5A5': '#7F2D2D',
  '#86EFAC': '#1F6B3A',
  '#FDE68A': '#6B5416',
  '#FCD34D': '#7A5F14',
  '#FBE3A5': '#5A4616',
  '#3A2414': '#8A6A4A',
};

const TEXT_MAP: Record<string, string> = {
  '#3A2414': '#F3E9DD',
  '#705746': '#BFAE9E',
  '#9A8270': '#A8978A',
  '#6B5E54': '#B5A89D',
  '#B45309': '#F59E0B',
  '#8C5A20': '#E0A458',
  '#92400E': '#FBBF24',
  '#53616C': '#A8B3BC',
  '#6B7280': '#A1A1AA',
  '#4B5563': '#CBD5E1',
  '#111827': '#F3F4F6',
  '#12304A': '#9CC5E8',
  '#172B3A': '#A9C4DA',
  '#15803D': '#4ADE80',
  '#166534': '#4ADE80',
  '#065F46': '#6EE7B7',
  '#059669': '#34D399',
  '#991B1B': '#FCA5A5',
  '#B91C1C': '#FCA5A5',
  '#B42318': '#F87171',
  '#DC2626': '#F87171',
  '#7C2D12': '#FDBA74',
};

// Tokens whose light value is a white-ish surface: inline reads in dark mode get the surface colour.
const SURFACE_TOKENS = new Set([
  'cream',
  'lightCream',
  'warmBeige',
  'lightBlue',
  'softBlue',
  'background',
  'surface',
  'surfaceMuted',
]);

type Role = 'bg' | 'border' | 'text';

function roleOf(prop: string): Role | null {
  if (prop === 'backgroundColor') return 'bg';
  if (prop === 'color' || prop === 'tintColor') return 'text';
  if (/^border.*Color$/.test(prop)) return 'border';
  return null;
}

function mapValue(role: Role, value: string): string {
  const key = value.toUpperCase();
  const table = role === 'bg' ? BG_MAP : role === 'border' ? BORDER_MAP : TEXT_MAP;
  return table[key] ?? value;
}

function toDark<T extends Record<string, unknown>>(style: T): T {
  const out: Record<string, unknown> = {};
  for (const [prop, value] of Object.entries(style)) {
    const role = typeof value === 'string' ? roleOf(prop) : null;
    out[prop] = role ? mapValue(role, value as string) : value;
  }
  return out as T;
}

// ---- Module level theme state ----------------------------------------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();

function readStoredPreference(): ThemePreference {
  try {
    const value = SecureStore.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // fall through to the default
  }
  return 'system';
}

function resolve(): ResolvedScheme {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

let preference: ThemePreference = readStoredPreference();
Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
let scheme: ResolvedScheme = resolve();
let version = 0;
let rawLightDepth = 0;

function applyStatusBar() {
  try {
    StatusBar.setBarStyle(scheme === 'dark' ? 'light-content' : 'dark-content', true);
  } catch {
    // not available on every platform
  }
}
applyStatusBar();

function emit() {
  version += 1;
  applyStatusBar();
  listeners.forEach((l) => l());
}

Appearance.addChangeListener(({ colorScheme }) => {
  const next: ResolvedScheme = colorScheme === 'dark' ? 'dark' : 'light';
  if (next !== scheme) {
    scheme = next;
    emit();
  }
});

export function getThemePreference(): ThemePreference {
  return preference;
}

export function setThemePreference(next: ThemePreference) {
  if (next === preference) return;
  preference = next;
  try {
    SecureStore.setItem(STORAGE_KEY, next);
  } catch {
    // preference still applies for this session
  }
  Appearance.setColorScheme(next === 'system' ? 'unspecified' : next);
  scheme = resolve();
  emit();
}

// ---- colors ----------------------------------------------------------------------------------

type Palette = typeof lightColors;

export const colors: Palette = new Proxy(lightColors, {
  get(target, prop: string) {
    const light = target[prop as keyof Palette] as string | undefined;
    if (scheme === 'light' || rawLightDepth > 0 || typeof light !== 'string') return light;
    return SURFACE_TOKENS.has(prop) ? mapValue('bg', light) : mapValue('text', light);
  },
});

// ---- createStyles ----------------------------------------------------------------------------

type StyleMap = Record<string, Record<string, unknown>>;

type AnyStyle = ViewStyle | TextStyle | ImageStyle;

export function createStyles<T extends Record<string, AnyStyle>>(factory: () => T): Readonly<T> {
  let cacheVersion = -1;
  let cache: StyleMap = {};

  const resolveStyles = (): StyleMap => {
    if (cacheVersion !== version) {
      rawLightDepth += 1;
      let raw: StyleMap;
      try {
        raw = factory() as unknown as StyleMap;
      } finally {
        rawLightDepth -= 1;
      }
      if (scheme === 'dark') {
        const mapped: StyleMap = {};
        for (const [name, style] of Object.entries(raw)) mapped[name] = toDark(style);
        cache = mapped;
      } else {
        cache = raw;
      }
      cacheVersion = version;
    }
    return cache;
  };

  return new Proxy({} as T, {
    get: (_t, prop) => resolveStyles()[prop as string],
    has: (_t, prop) => prop in resolveStyles(),
    ownKeys: () => Reflect.ownKeys(resolveStyles()),
    getOwnPropertyDescriptor: (_t, prop) => ({
      enumerable: true,
      configurable: true,
      value: resolveStyles()[prop as string],
    }),
  });
}

// ---- React bindings --------------------------------------------------------------------------

interface ThemeContextValue {
  preference: ThemePreference;
  scheme: ResolvedScheme;
  isDark: boolean;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function useThemeVersion(): number {
  const [v, setV] = useState(version);
  useEffect(() => {
    const listener = () => setV(version);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return v;
}

/** Provides the theme to hooks. Does not remount anything; see ThemeBoundary. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const v = useThemeVersion();
  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      scheme,
      isDark: scheme === 'dark',
      setPreference: setThemePreference,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Remounts its subtree when the theme changes so every screen re-reads its styles.
 * Keep it below your data providers so auth and ride state survive a switch.
 */
export function ThemeBoundary({ children }: { children: React.ReactNode }) {
  const v = useThemeVersion();
  return <React.Fragment key={v}>{children}</React.Fragment>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  const setPreference = useCallback((next: ThemePreference) => setThemePreference(next), []);
  return (
    ctx ?? {
      preference,
      scheme,
      isDark: scheme === 'dark',
      setPreference,
    }
  );
}
