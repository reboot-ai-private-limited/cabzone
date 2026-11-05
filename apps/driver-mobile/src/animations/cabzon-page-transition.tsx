import React, { useEffect, useState } from 'react';
import { Animated, type ViewStyle } from 'react-native';
import { motion, createStyles } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export interface CabzonPageTransitionProps {
  children: React.ReactNode;
  pageKey: string | number;
  direction?: 'forward' | 'back';
  style?: ViewStyle;
}

export function CabzonPageTransition({
  children,
  pageKey,
  direction = 'forward',
  style,
}: CabzonPageTransitionProps) {
  const reducedMotion = useReducedMotion();
  const [animValue] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reducedMotion) {
      animValue.setValue(1);
      return;
    }

    animValue.setValue(0);
    Animated.timing(animValue, {
      toValue: 1,
      duration: 320,
      easing: motion.nativeEasing.enter,
      useNativeDriver: true,
    }).start();
  }, [pageKey, direction, reducedMotion, animValue]);

  if (reducedMotion) {
    return <Animated.View style={[styles.container, style]}>{children}</Animated.View>;
  }

  // Forward: new starts at translateX 25% (or ~60px), opacity 0 -> 1
  // Back: new starts at translateX -25% (or -60px), opacity 0 -> 1
  const initialOffset = direction === 'forward' ? 60 : -60;

  const translateX = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [initialOffset, 0],
  });

  const opacity = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateX }],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = createStyles(() => ({
  container: {
    flex: 1,
    width: '100%',
  },
}));
