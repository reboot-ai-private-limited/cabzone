import React, { useCallback, useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { colors, radii, spacing, typography } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { BlobBackground } from './blob-background';

export function WelcomeHero({ exiting = false }: { exiting?: boolean }) {
  const reducedMotion = useReducedMotion();
  const [availableSpace, setAvailableSpace] = useState({ width: 340, height: 340 });
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const [entrances] = useState(() => Array.from({ length: 4 }, () => new Animated.Value(0)));
  const [float] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (exiting) return;
    entrances.forEach((value) => value.setValue(reducedMotion || !focused ? 1 : 0));
    float.setValue(0);
    if (reducedMotion || !focused) return;

    const entrance = Animated.stagger(
      140,
      entrances.map((value) =>
        Animated.spring(value, {
          toValue: 1,
          tension: 40,
          friction: 5.2,
          useNativeDriver: true,
        }),
      ),
    );
    const floating = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    entrance.start();
    floating.start();
    return () => {
      entrance.stop();
      floating.stop();
    };
  }, [entrances, exiting, float, focused, reducedMotion]);

  useEffect(() => {
    if (!exiting || reducedMotion) return;
    float.stopAnimation();
    const exit = Animated.stagger(
      40,
      [...entrances].reverse().map((value) =>
        Animated.timing(value, {
          toValue: 0,
          duration: 210,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    );
    exit.start();
    return () => exit.stop();
  }, [entrances, exiting, float, reducedMotion]);

  const pop = (index: number, exitOffset = -10) => ({
    opacity: entrances[index].interpolate({
      inputRange: [0, 0.25, 1],
      outputRange: [0, 0.85, 1],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        scale: entrances[index].interpolate({
          inputRange: [0, 1],
          outputRange: [exiting ? 0.82 : 0, 1],
        }),
      },
      {
        translateY: entrances[index].interpolate({
          inputRange: [0, 1],
          outputRange: [exiting ? exitOffset : 10, 0],
        }),
      },
    ],
  });
  const drift = (distance: number) => ({
    transform: [
      { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, distance] }) },
    ],
  });

  return (
    <View
      style={styles.frame}
      onLayout={({ nativeEvent }) => setAvailableSpace(nativeEvent.layout)}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <View
        style={[
          styles.illustration,
          {
            transform: [
              { scale: Math.min(1, availableSpace.width / 340, availableSpace.height / 340) },
            ],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.blob,
            {
              opacity: entrances[0],
              transform: [
                {
                  scale: entrances[0].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.88, 1],
                  }),
                },
              ],
            },
          ]}
        >
          {focused && <BlobBackground size={340} />}
        </Animated.View>
        <Animated.View
          style={[
            styles.orbit,
            {
              opacity: entrances[0],
              transform: [
                { rotate: '-18deg' },
                {
                  scale: entrances[0].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View style={[styles.cityPosition, pop(1, -12)]}>
          <Animated.View style={[styles.benefit, drift(-6)]}>
            <Ionicons name="location" size={17} color={colors.brandBrown} />
            <Text style={styles.benefitText}>City to city</Text>
          </Animated.View>
        </Animated.View>
        <Animated.View style={[styles.farePosition, pop(2, -12)]}>
          <Animated.View style={[styles.benefit, drift(6)]}>
            <View style={styles.benefitIcon}>
              <Ionicons name="pricetag" size={18} color={colors.brandBrown} />
            </View>
            <View>
              <Text style={styles.benefitCaption}>Set your fare</Text>
              <Text style={styles.benefitText}>Before you book</Text>
            </View>
          </Animated.View>
        </Animated.View>
        <Animated.View style={[styles.carWrap, pop(0, -16)]}>
          <Animated.View
            style={{
              transform: [
                { scale: float.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) },
              ],
            }}
          >
            <Image
              source={require('@/assets/images/rider-booking-preview.png')}
              style={styles.car}
              resizeMode="contain"
            />
          </Animated.View>
        </Animated.View>
        <Animated.View style={[styles.safetyPosition, pop(3, 12)]}>
          <Animated.View style={[styles.benefit, drift(-4)]}>
            <View style={styles.benefitIcon}>
              <Ionicons name="shield-checkmark" size={18} color={colors.brandBrown} />
            </View>
            <Text style={styles.benefitText}>OTP-verified pickup</Text>
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    minHeight: 0,
    maxHeight: 340,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustration: { width: 340, height: 340, alignItems: 'center', justifyContent: 'center' },
  blob: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 340,
  },
  orbit: {
    position: 'absolute',
    width: '94%',
    height: 180,
    borderWidth: 1,
    borderColor: colors.softAmber,
    borderStyle: 'dashed',
    borderRadius: radii.pill,
    transform: [{ rotate: '-18deg' }],
  },
  carWrap: { width: '100%', marginTop: 12 },
  car: { width: '100%', height: 270 },
  cityPosition: { position: 'absolute', zIndex: 1, left: 0, top: 40 },
  farePosition: { position: 'absolute', zIndex: 1, right: 0, top: 0 },
  safetyPosition: { position: 'absolute', zIndex: 1, bottom: 12, alignSelf: 'center' },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    boxShadow: '0 4px 12px rgba(58, 36, 20, 0.06)',
  },
  benefitIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lightCream,
  },
  benefitCaption: { ...typography.caption, fontSize: 11, color: colors.secondary },
  benefitText: { ...typography.caption, color: colors.deepBrown, fontWeight: '700' },
});
