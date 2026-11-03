import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MAP_THEME,
  MAP_THEME_OPTIONS,
  isMapTheme,
  mapThemeSettings,
  normalizeMapTheme,
} from './map-theme.ts';

test('every option is a valid theme and light is the default', () => {
  assert.equal(DEFAULT_MAP_THEME, 'light');
  assert.deepEqual(MAP_THEME_OPTIONS.map((o) => o.id), ['light', 'dark', 'satellite']);
  assert.ok(MAP_THEME_OPTIONS.every((o) => isMapTheme(o.id) && o.label && o.icon));
});

test('normalizeMapTheme keeps valid values and falls back for anything else', () => {
  assert.equal(normalizeMapTheme('dark'), 'dark');
  assert.equal(normalizeMapTheme('satellite'), 'satellite');
  for (const bad of [undefined, null, '', 'sepia', 42, {}]) {
    assert.equal(normalizeMapTheme(bad), 'light');
  }
});

test('light and dark use a custom style on the standard map', () => {
  const light = mapThemeSettings('light');
  const dark = mapThemeSettings('dark');
  assert.equal(light.mapType, 'standard');
  assert.equal(dark.mapType, 'standard');
  assert.ok(light.customMapStyle.length > 0 && dark.customMapStyle.length > 0);
  assert.notDeepEqual(light.customMapStyle, dark.customMapStyle);
  assert.equal(light.userInterfaceStyle, 'light');
  assert.equal(dark.userInterfaceStyle, 'dark');
});

test('satellite uses hybrid imagery with labels and no custom style', () => {
  const sat = mapThemeSettings('satellite');
  assert.equal(sat.mapType, 'hybrid');
  assert.equal(sat.customMapStyle, undefined);
});
