import React from 'react';
import { Animated, Image, useWindowDimensions, View } from 'react-native';
import { createStyles } from '@/design-system';

export interface CitySkylineLayerProps {
  anim: Animated.Value;
}

/**
 * Independent Layer 2: City Skyline
 * - Enters FIRST: starts around 0% opacity and smoothly fades to 100%.
 * - Adds a very slight upward movement while fading in (~10px).
 * - Remains stationary once settled.
 */
export function CitySkylineLayer({ anim }: CitySkylineLayerProps) {
  const { width } = useWindowDimensions();

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  // Image dimensions: 941 x 1671
  const imageAspect = 1671 / 941;
  const imageHeight = width * imageAspect;

  return (
    <View pointerEvents="none" style={styles.bottomBackdropContainer}>
      <Animated.View
        style={[
          styles.animatedCityWrap,
          {
            opacity: anim,
            transform: [{ translateY }],
          },
        ]}>
        <Image
          source={require('@/../assets/images/signUpCityImage.webp')}
          style={{ width, height: imageHeight }}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = createStyles(() => ({
  bottomBackdropContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  animatedCityWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
}));
