import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, motion } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export interface CabzonSuccessProps {
  title?: string;
  subtitle?: string;
  onAnimationEnd?: () => void;
}

export function CabzonSuccess({
  title = "You're approved!",
  subtitle = "You're ready to start receiving ride requests.",
  onAnimationEnd,
}: CabzonSuccessProps) {
  const [circleScale] = useState(() => new Animated.Value(0.8));
  const [checkmarkScale] = useState(() => new Animated.Value(0.5));
  const [opacity] = useState(() => new Animated.Value(0));
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      circleScale.setValue(1);
      checkmarkScale.setValue(1);
      opacity.setValue(1);
      onAnimationEnd?.();
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.duration.normal,
        easing: motion.nativeEasing.standard,
        useNativeDriver: true,
      }),
      Animated.timing(circleScale, {
        toValue: 1,
        duration: motion.duration.emphasis,
        easing: motion.nativeEasing.enter,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(100),
        Animated.spring(checkmarkScale, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      onAnimationEnd?.();
    });
  }, [reducedMotion, circleScale, checkmarkScale, opacity, onAnimationEnd]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.circle,
          {
            opacity,
            transform: [{ scale: circleScale }],
          },
        ]}
      >
        <Animated.Text
          style={[
            styles.checkmark,
            {
              transform: [{ scale: checkmarkScale }],
            },
          ]}
        >
          ✓
        </Animated.Text>
      </Animated.View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  circle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.lightBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  checkmark: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.cabzonBlue,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.darkNavy,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
