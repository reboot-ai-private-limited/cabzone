import React, { useEffect, useState } from 'react';
import { Animated, type ViewStyle } from 'react-native';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export interface CabzonErrorProps {
  children: React.ReactNode;
  triggerKey?: string | number | boolean;
  style?: ViewStyle;
}

export function CabzonError({
  children,
  triggerKey,
  style,
}: CabzonErrorProps) {
  const [shakeAnim] = useState(() => new Animated.Value(0));
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!triggerKey || reducedMotion) return;

    // translateX: 0 -> -4 -> 4 -> -2 -> 2 -> 0 over 250ms
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -4, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -2, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 2, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [triggerKey, reducedMotion, shakeAnim]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [{ translateX: shakeAnim }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
