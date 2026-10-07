import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { BlobBackground } from '../blob-background';

export interface BlobHaloLayerProps {
  screenWidth: number;
  screenHeight: number;
  topInset: number;
}

/**
 * Independent Layer 1: Background Blob / Halo
 * - Uses the shared warm morphing BlobBackground with golden dashed orbit rings.
 * - Gentle breathing animation (scale 0.985 -> 1.015).
 * - Stable, calming background anchor for login and signup.
 */
const HALO_SIZE = 400;

export function BlobHaloLayer({ screenWidth, screenHeight, topInset }: BlobHaloLayerProps) {
  const reducedMotion = useReducedMotion();
  const [breatheAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reducedMotion) return;

    // Very gentle, slow breathing cycle (4.5s loop)
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, {
          toValue: 1,
          duration: 2250,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breatheAnim, {
          toValue: 0,
          duration: 2250,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    return () => loop.stop();
  }, [breatheAnim, reducedMotion]);

  const scale = breatheAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.985, 1.015],
  });

  const opacity = breatheAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.93, 1],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.haloContainer,
        {
          top: Math.max(topInset + 30, (screenHeight - HALO_SIZE) / 2 - (screenHeight > 750 ? 25 : 15)),
          left: (screenWidth - HALO_SIZE) / 2,
          opacity: reducedMotion ? 1 : opacity,
          transform: [{ scale: reducedMotion ? 1 : scale }],
        },
      ]}>
      <BlobBackground showOrbits size={HALO_SIZE} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  haloContainer: {
    position: 'absolute',
    width: HALO_SIZE,
    height: HALO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});

