/**
 * Cabzon Driver App — Typography Tokens
 */

import { Platform } from 'react-native';

export const typography = {
  fontFamily: Platform.select({
    ios: 'System',
    android: 'Roboto',
    default: 'System',
  }),
  sizes: {
    xs: 12,
    sm: 13,
    base: 15,
    lg: 18,
    xl: 22,
    xxl: 28,
  },
  weights: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  } as const,
  lineHeights: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
} as const;
