/**
 * Cabzon Driver App — Global Motion Tokens
 * Section 3 & 32 of Driver App UI Animation & Micro-Interaction Spec v1
 */

import { Easing } from 'react-native';

export const motion = {
  duration: {
    fast: 180,
    normal: 300,
    emphasis: 450,
  },
  easing: {
    standard: 'ease-out',
    enter: 'cubic-bezier(0.22, 1, 0.36, 1)',
    exit: 'ease-in',
    smooth: 'ease-in-out',
  },
  // React Native Easing equivalents for animated native driver
  nativeEasing: {
    standard: Easing.out(Easing.ease),
    enter: Easing.bezier(0.22, 1, 0.36, 1),
    exit: Easing.in(Easing.ease),
    smooth: Easing.inOut(Easing.ease),
  },
} as const;

export type MotionDuration = keyof typeof motion.duration;
export type MotionEasing = keyof typeof motion.easing;
