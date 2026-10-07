/**
 * Cabzon Driver App — Color Tokens
 * Theme: Sky Blue + Light Grey
 */

export const colors = {
  cabzonBlue: '#1597E5',
  lightBlue: '#DDF2FF',
  softBlue: '#EEF8FF',
  background: '#F5F7F8',
  white: '#FFFFFF',
  darkNavy: '#102A43',
  text: '#111827',
  secondary: '#667085',
  success: '#16A34A',
  warning: '#F59E0B',
  error: '#DC2626',
} as const;

export type ColorKey = keyof typeof colors;
