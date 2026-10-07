import React from 'react';
import { Animated, Image, StyleSheet } from 'react-native';

export interface TotoVehicleLayerProps {
  anim: Animated.Value;
  screenWidth: number;
  vehicleWidth: number;
}

/**
 * Independent Layer 3: Toto / Auto-rickshaw
 * - Enters from the left side of the screen, starting completely outside viewport.
 * - Moves left -> right into final bottom-left position with smooth ease-out.
 * - Settles naturally without bouncing.
 */
export function TotoVehicleLayer({ anim, screenWidth, vehicleWidth }: TotoVehicleLayerProps) {
  // Start completely off-screen to the left (negative offset larger than vehicle + screen margin)
  const initialOffset = -(screenWidth * 0.65 + vehicleWidth);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [initialOffset, 0],
  });

  const opacity = anim.interpolate({
    inputRange: [0, 0.08, 1],
    outputRange: [0, 1, 1],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateX }],
        },
      ]}>
      <Image
        source={require('@/../assets/images/e-rickshaw.webp')}
        style={{
          width: vehicleWidth,
          height: vehicleWidth * 0.67,
        }}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 4,
    left: -8,
    zIndex: 3,
  },
});
