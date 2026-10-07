import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, motion } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export interface CabzonLoadingProps {
  size?: number;
  color?: string;
}

export function CabzonLoading({
  size = 28,
  color = colors.cabzonBlue,
}: CabzonLoadingProps) {
  const [rotateAnim] = useState(() => new Animated.Value(0));
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;

    const loop = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 900,
        easing: motion.nativeEasing.smooth,
        useNativeDriver: true,
      }),
    );
    loop.start();

    return () => loop.stop();
  }, [reducedMotion, rotateAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.spinner,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: '#E2E8F0',
            borderTopColor: color,
            transform: [{ rotate }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    borderWidth: 2.5,
  },
});
