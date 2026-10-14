/**
 * Design tokens — the ONE file shared between web and native.
 *
 * Plain values, no imports. That is what lets @cabzone/mobile-ui consume it without
 * pulling a single web dependency into a React Native bundle. Components cannot be shared
 * across the two (a `div` is not a `View`); the values behind them can and should be.
 *
 * `src/theme.css` mirrors everything here for Tailwind. The two are held together by
 * `tokens.drift.test.ts` rather than by codegen — see docs/engineering/shared-packages.md.
 */

/**
 * Raw palette. A COMPONENT SHOULD NOT USE THESE DIRECTLY — it uses the semantic names in
 * `theme.css` (`--color-text`, `--color-accent-ink`, …), which is the layer where the contrast
 * rules are checked. These exist so `theme.css` and React Native have one source for the values.
 *
 * Deep brown is the readable brand ink; amber is reserved for filled primary actions.
 */
export const colors = {
  // Surfaces
  bg: '#ffffff',
  bgSunken: '#ffffff',
  bgMuted: '#fff6e5',

  // Ink
  fg: '#3a2414',
  muted: '#705746',

  // Brand.
  accent: '#fbbf24',
  accentHover: '#f59e0b',
  accentInk: '#3a2414',

  // Readable links, focus rings, and selected states remain dark enough for white surfaces.
  interactive: '#3a2414',
  interactiveHover: '#b45309',

  // Hairlines are decorative; control boundaries carry meaning and need 3:1 (WCAG 1.4.11).
  border: '#ffe7c7',
  borderStrong: '#8a9281',

  // Compatibility values for the panel's existing Tailwind slate utility classes.
  slate50: '#fff9f0',
  slate100: '#fff6e5',
  slate200: '#ffe7c7',
  slate300: '#ffd59a',
  slate400: '#b99a7c',
  slate500: '#8a705b',
  slate600: '#705746',
  slate700: '#58412f',
  slate800: '#3a2414',
  slate900: '#28180e',
  slate950: '#1c1009',

  // Status
  success: '#1a7f37',
  warning: '#9a6700',
  danger: '#cf222e',

  /** Zone-editor fills, matching docs/LLD/admin-panel.md. Map polygons, not UI colour. */
  zoneCity: '#0b6bcb',
  zonePickupFree: '#1a7f37',
  zonePickupPaid: '#9a6700',
  zoneHill: '#8250df',
  zoneViolation: '#cf222e',
  /**
   * The rubber-band line while a boundary is being traced — NOT the draft polygon itself.
   *
   * Magenta because it is the one hue a basemap never supplies. `interactive` (#3f6212) was
   * doing this job and is a dark olive that all but disappears against Google's green
   * vegetation fill, which is exactly the surface a service boundary gets drawn over. Road grey,
   * water blue, vegetation green and terrain brown are all taken; magenta is legible over every
   * one of them, and over satellite imagery too.
   *
   * Distinct from the placed shape ON PURPOSE. The band is the edge you have not committed to
   * yet; the polygon it becomes is `interactive`. Two colours, two states.
   */
  zoneDraftLine: '#e8368f',
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 } as const;
export const radius = { sm: 4, md: 8, lg: 16, pill: 999 } as const;
export const fontSize = { xs: 12, sm: 14, md: 16, lg: 20, xl: 28 } as const;

/**
 * The panel targets >= 1024px (`lg`). The wide end matters as a CAP, not a target: a table
 * stretched across 3440px puts a row's first and last cell too far apart to read as one row,
 * so the content region takes a max width there.
 */
export const breakpoint = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
  '3xl': 1920,
  '4xl': 2560,
  '5xl': 3440,
} as const;

/**
 * Every foreground/background pair the design language declares, with the minimum ratio it must
 * meet. `theme.contrast.test.ts` walks this list.
 *
 * It lives here rather than in the test file so that adding a colour pairing to the design
 * language is an edit to the design system, not to a test someone can forget exists.
 */
export const contrastPairs = [
  { fg: colors.fg, bg: colors.bg, min: 4.5, name: 'text on surface' },
  { fg: colors.fg, bg: colors.bgSunken, min: 4.5, name: 'text on sunken' },
  { fg: colors.fg, bg: colors.bgMuted, min: 4.5, name: 'text on muted' },
  { fg: colors.muted, bg: colors.bg, min: 4.5, name: 'subtle text on surface' },
  { fg: colors.muted, bg: colors.bgSunken, min: 4.5, name: 'subtle text on sunken' },
  { fg: colors.accentInk, bg: colors.accent, min: 4.5, name: 'ink on accent' },
  { fg: colors.accentInk, bg: colors.accentHover, min: 4.5, name: 'ink on accent hover' },
  { fg: colors.interactive, bg: colors.bg, min: 4.5, name: 'interactive on surface' },
  { fg: colors.interactive, bg: colors.bgSunken, min: 4.5, name: 'interactive on sunken' },
  { fg: colors.interactiveHover, bg: colors.bg, min: 4.5, name: 'interactive hover on surface' },
  { fg: colors.success, bg: colors.bg, min: 4.5, name: 'success on surface' },
  { fg: colors.warning, bg: colors.bg, min: 4.5, name: 'warning on surface' },
  { fg: colors.danger, bg: colors.bg, min: 4.5, name: 'danger on surface' },
  { fg: colors.bg, bg: colors.danger, min: 4.5, name: 'white on danger fill' },
  // Non-text: a control boundary must reach 3:1 against what it sits on (WCAG 1.4.11).
  { fg: colors.borderStrong, bg: colors.bg, min: 3, name: 'control border on surface' },
  { fg: colors.borderStrong, bg: colors.bgSunken, min: 3, name: 'control border on sunken' },
  { fg: colors.interactive, bg: colors.bg, min: 3, name: 'focus ring on surface' },
] as const;
