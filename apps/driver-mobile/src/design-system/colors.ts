/**
 * Cabzon Driver App — Color Tokens
 * White surfaces with deep brown and amber accents
 */

export const lightColors = {
  deepBrown: '#3A2414',
  amber: '#FBBF24',
  cream: '#FFFFFF',
  lightCream: '#FFFFFF',
  warmBeige: '#FFFFFF',
  softAmber: '#FFD59A',
  orange: '#FB923C',
  brandBrown: '#B45309',
  cabzonBlue: '#3A2414',
  lightBlue: '#FFFFFF',
  softBlue: '#FFFFFF',
  background: '#FFFFFE', // 1 unit off white so dark mode can tell the page apart from cards
  white: '#FFFFFF',
  surface: '#FFFFFF',
  border: '#E5E5E5',
  darkNavy: '#3A2414',
  text: '#3A2414',
  secondary: '#705746',
  success: '#166534',
  warning: '#B45309',
  error: '#B42318',
} as const;

export type ColorKey = keyof typeof lightColors;
