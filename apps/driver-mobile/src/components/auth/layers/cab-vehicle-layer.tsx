import React from 'react';
import { Animated, Image, StyleSheet } from 'react-native';

export interface CabVehicleLayerProps {
  anim: Animated.Value;
  screenWidth: number;
  vehicleWidth: number;
}

/**
 * Independent Layer 4: Cab / Car
 * - Enters from the right side of the screen, starting completely outside viewport.
 * - Moves right -> left into final bottom-right position with smooth ease-out.
 * - Settles naturally without bouncing.
 */
export function CabVehicleLayer({ anim, screenWidth, vehicleWidth }: CabVehicleLayerProps) {
  // Start completely off-screen to the right (positive offset larger than vehicle + screen margin)
  const initialOffset = screenWidth * 0.65 + vehicleWidth;

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
        source={require('@/../assets/images/cab.webp')}
        style={{
          width: vehicleWidth * 1.1,
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
    bottom: 2,
    right: -8,
    zIndex: 3,
  },
});
