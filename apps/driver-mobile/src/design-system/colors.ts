/**
 * Cabzon Driver App — Color Tokens
 * Theme: deep brown, amber, and cream
 */

export const colors = {
  deepBrown: '#3A2414',
  amber: '#FBBF24',
  cream: '#FFF9F0',
  lightCream: '#FFF6E5',
  warmBeige: '#FFE7C7',
  softAmber: '#FFD59A',
  orange: '#FB923C',
  brandBrown: '#B45309',
  cabzonBlue: '#3A2414',
  lightBlue: '#FFE7C7',
  softBlue: '#FFF6E5',
  background: '#FFFFFF',
  white: '#FFFFFF',
  surface: '#FFFFFF',
  border: '#FFE7C7',
  darkNavy: '#3A2414',
  text: '#3A2414',
  secondary: '#705746',
  success: '#166534',
  warning: '#B45309',
  error: '#B42318',
} as const;

export type ColorKey = keyof typeof colors;
