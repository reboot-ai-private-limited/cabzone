import React from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';

export interface CitySkylineLayerProps {
  anim: Animated.Value;
  height: number;
  maxWidth?: number;
}

/**
 * Independent Layer 2: City Skyline
 * - Enters FIRST: starts around 0% opacity and smoothly fades to 100%.
 * - Adds a very slight upward movement while fading in (~10px).
 * - Remains stationary once settled.
 */
export function CitySkylineLayer({ anim, height, maxWidth = 620 }: CitySkylineLayerProps) {
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  return (
    <View pointerEvents="none" style={[styles.bottomBackdropContainer, { height }]}>
      <Animated.View
        style={[
          styles.animatedCityWrap,
          {
            height,
            opacity: anim,
            transform: [{ translateY }],
          },
        ]}>
        <Image
          source={require('@/../assets/images/signUpCityImage.webp')}
          style={[styles.cityImage, { height, maxWidth }]}
          resizeMode="cover"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomBackdropContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  animatedCityWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  cityImage: {
    width: '100%',
    alignSelf: 'center',
  },
});
