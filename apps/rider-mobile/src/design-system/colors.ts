/**
 * Cabzone Customer App — Color Tokens
 * White surfaces with amber and deep brown accents
 */

export const colors = {
  deepBrown: '#3A2414',
  amber: '#FBBF24',
  amberStrong: '#F59E0B',
  cream: '#FFFFFF',
  lightCream: '#FFFFFF',
  warmBeige: '#FFFFFF',
  softAmber: '#FFD59A',
  orange: '#FB923C',
  brandBrown: '#B45309',
  background: '#FFFFFF',
  white: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#FFFFFF',
  border: '#E5E5E5',
  borderSubtle: '#F0F0F0',
  text: '#3A2414',
  secondary: '#705746',
  muted: '#9A8270',
  success: '#166534',
  successBg: '#DCFCE7',
  warning: '#B45309',
  warningBg: '#FEF3C7',
  error: '#B42318',
  errorBg: '#FEE2E2',
} as const;

export type ColorKey = keyof typeof colors;
