import React, { useEffect, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { colors, motion, createStyles } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export interface CabzonLaunchProps {
  onFinish: () => void;
}

export function CabzonLaunch({ onFinish }: CabzonLaunchProps) {
  const [logoOpacity] = useState(() => new Animated.Value(0));
  const [logoTranslateY] = useState(() => new Animated.Value(0));
  const [shapeOpacity] = useState(() => new Animated.Value(0));
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      onFinish();
      return;
    }

    // 0ms: logo hidden
    // 100ms: logo fades in
    // 250ms: logo moves upward 8-12px
    // 400ms: subtle blue decorative shape appears
    // 500ms: transition to onboarding
    Animated.sequence([
      Animated.delay(100),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(logoTranslateY, {
          toValue: -10,
          duration: 150,
          easing: motion.nativeEasing.standard,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(150),
          Animated.timing(shapeOpacity, {
            toValue: 1,
            duration: 100,
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.delay(100),
    ]).start(() => {
      onFinish();
    });
  }, [reducedMotion, logoOpacity, logoTranslateY, shapeOpacity, onFinish]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.decorativeShape,
          { opacity: shapeOpacity },
        ]}
      />
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoOpacity,
            transform: [{ translateY: logoTranslateY }],
          },
        ]}
      >
        <Text style={styles.brandTitle}>CABZON</Text>
        <Text style={styles.brandSubtitle}>Driver</Text>
      </Animated.View>
    </View>
  );
}

const styles = createStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decorativeShape: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.lightBlue,
    opacity: 0.5,
  },
  logoContainer: {
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.darkNavy,
    letterSpacing: 2,
  },
  brandSubtitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.cabzonBlue,
    letterSpacing: 4,
    marginTop: 4,
    textTransform: 'uppercase',
  },
}));
