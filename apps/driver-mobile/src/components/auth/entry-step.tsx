import React, { useCallback, useEffect, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { BlobBackground } from './blob-background';

function WelcomeHero() {
  const reducedMotion = useReducedMotion();
  const [space, setSpace] = useState({ width: 340, height: 340 });
  const [focused, setFocused] = useState(true);
  const [entrance] = useState(() => new Animated.Value(1));
  const [float] = useState(() => new Animated.Value(0));

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    entrance.setValue(reducedMotion || !focused ? 1 : 0);
    float.setValue(0);
    if (reducedMotion || !focused) return;
    const enter = Animated.timing(entrance, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const floating = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    enter.start();
    floating.start();
    return () => {
      enter.stop();
      floating.stop();
    };
  }, [entrance, float, focused, reducedMotion]);

  return (
    <View
      style={styles.heroFrame}
      onLayout={({ nativeEvent }) => setSpace(nativeEvent.layout)}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          styles.illustration,
          { transform: [{ scale: Math.min(1, space.width / 340, space.height / 340) }] },
        ]}
      >
        <View style={styles.blob}>{focused ? <BlobBackground size={340} /> : null}</View>
        <Animated.View
          style={{
            opacity: entrance,
            transform: [
              { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
            ],
          }}
        >
          <Animated.Image
            source={require('@/assets/images/cab.webp')}
            resizeMode="contain"
            style={[
              styles.car,
              {
                transform: [
                  { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) },
                ],
              },
            ]}
          />
        </Animated.View>
        <View style={[styles.benefit, styles.hours]}>
          <Ionicons name="time-outline" size={19} color={colors.brandBrown} />
          <Text style={styles.benefitText}>Choose your hours</Text>
        </View>
        <View style={[styles.benefit, styles.fare]}>
          <Ionicons name="pricetag-outline" size={19} color={colors.brandBrown} />
          <Text style={styles.benefitText}>Review the fare</Text>
        </View>
        <View style={[styles.benefit, styles.payment]}>
          <Ionicons name="wallet-outline" size={19} color={colors.brandBrown} />
          <Text style={styles.benefitText}>Cash or UPI</Text>
        </View>
      </View>
    </View>
  );
}

export function EntryStep({ onContinue }: { onContinue: () => void }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Image
            source={require('@/assets/brand/cabzone-horizontal.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Cabzone Driver"
            accessibilityRole="image"
          />
        </View>
        <View style={styles.main}>
          <WelcomeHero />
          <View style={styles.copy}>
            <Text style={styles.headline} accessibilityRole="header">
              Your drive.{'\n'}
              <Text style={styles.highlight}>Your choice.</Text>
            </Text>
            <Text style={styles.description}>
              Review the route and fare.{'\n'}Drive when you’re ready.
            </Text>
          </View>
        </View>
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            onPress={onContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue with your phone number"
            accessibilityHint="Sign in or register as a driver"
          >
            <Text style={styles.buttonText}>Continue with phone</Text>
            <Ionicons name="arrow-forward" size={22} color={colors.deepBrown} />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  header: { alignItems: 'center' },
  logo: { width: 150, height: 52 },
  main: { flex: 1, minHeight: 0, justifyContent: 'center', paddingVertical: 16 },
  copy: { alignItems: 'center', flexShrink: 0, paddingTop: 12 },
  headline: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -1.2,
    textAlign: 'center',
    color: colors.deepBrown,
  },
  highlight: { color: colors.brandBrown },
  description: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 330,
  },
  footer: { flexShrink: 0, paddingTop: 8 },
  button: {
    minHeight: 56,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.amber,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  buttonText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.deepBrown,
    flexShrink: 1,
  },
  pressed: { opacity: 0.9 },
  heroFrame: {
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
    width: 340,
    height: 340,
    alignItems: 'center',
    justifyContent: 'center',
  },
  car: { width: 340, height: 230 },
  benefit: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  benefitText: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.deepBrown },
  hours: { top: 24, left: 0 },
  fare: { top: 64, right: 0 },
  payment: { bottom: 24 },
});
