import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, createStyles } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { BlobBackground } from './blob-background';

function WelcomeHero({ exiting }: { exiting: boolean }) {
  const reducedMotion = useReducedMotion();
  const [space, setSpace] = useState({ width: 340, height: 340 });
  const [focused, setFocused] = useState(true);
  const [entrances] = useState(() => Array.from({ length: 4 }, () => new Animated.Value(1)));
  const [float] = useState(() => new Animated.Value(0));

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    if (exiting) return;
    entrances.forEach((value) => value.setValue(reducedMotion || !focused ? 1 : 0));
    float.setValue(0);
    if (reducedMotion || !focused) return;

    const enter = Animated.stagger(
      110,
      entrances.map((value) =>
        Animated.spring(value, {
          toValue: 1,
          tension: 44,
          friction: 6,
          useNativeDriver: true,
        }),
      ),
    );
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

  const pillAnim = (index: number, driftY: number) => ({
    opacity: entrances[index].interpolate({
      inputRange: [0, 0.3, 1],
      outputRange: [0, 0.85, 1],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        scale: entrances[index].interpolate({
          inputRange: [0, 1],
          outputRange: [0.84, 1],
        }),
      },
      {
        translateY: entrances[index].interpolate({
          inputRange: [0, 1],
          outputRange: [driftY, 0],
        }),
      },
    ],
  });

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
          {focused ? <BlobBackground size={340} /> : null}
        </Animated.View>
        <Animated.View
          style={{
            opacity: entrances[0],
            transform: [
              {
                translateY: entrances[0].interpolate({
                  inputRange: [0, 1],
                  outputRange: [exiting ? -16 : 14, 0],
                }),
              },
              {
                scale: entrances[0].interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.92, 1],
                }),
              },
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
        <Animated.View style={[styles.benefit, styles.hours, pillAnim(1, -10)]}>
          <Ionicons name="time-outline" size={19} color={colors.brandBrown} />
          <Text style={styles.benefitText}>Choose your hours</Text>
        </Animated.View>
        <Animated.View style={[styles.benefit, styles.fare, pillAnim(2, -10)]}>
          <Ionicons name="pricetag-outline" size={19} color={colors.brandBrown} />
          <Text style={styles.benefitText}>Review the fare</Text>
        </Animated.View>
        <Animated.View style={[styles.benefit, styles.payment, pillAnim(3, 12)]}>
          <Ionicons name="wallet-outline" size={19} color={colors.brandBrown} />
          <Text style={styles.benefitText}>Cash or UPI</Text>
        </Animated.View>
      </View>
    </View>
  );
}

export function EntryStep({ onContinue }: { onContinue: () => void }) {
  const reducedMotion = useReducedMotion();
  const [exiting, setExiting] = useState(false);
  const exitingRef = useRef(false);
  const [sections] = useState(() => [
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
  ]);

  useFocusEffect(
    useCallback(() => {
      exitingRef.current = false;
      setExiting(false);
      if (reducedMotion) {
        sections.forEach((v) => v.setValue(1));
        return;
      }
      sections.forEach((v) => v.setValue(0));
      const enter = Animated.stagger(
        90,
        sections.map((v) =>
          Animated.timing(v, {
            toValue: 1,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ),
      );
      enter.start();
      return () => enter.stop();
    }, [reducedMotion, sections]),
  );

  const handleContinuePress = () => {
    if (reducedMotion) {
      onContinue();
      return;
    }
    if (exitingRef.current) return;
    exitingRef.current = true;
    setExiting(true);

    Animated.stagger(
      45,
      [
        Animated.timing(sections[0], {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(sections[1], {
          toValue: 0,
          duration: 230,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(sections[2], {
          toValue: 0,
          duration: 240,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ],
    ).start(({ finished }) => {
      if (finished) {
        onContinue();
      } else {
        exitingRef.current = false;
        setExiting(false);
      }
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View
          style={[
            styles.header,
            {
              opacity: sections[0],
              transform: [
                {
                  translateY: sections[0].interpolate({
                    inputRange: [0, 1],
                    outputRange: [-12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Image
            source={require('@/assets/brand/cabzone-horizontal.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Cabzone Driver"
            accessibilityRole="image"
          />
        </Animated.View>
        <View style={styles.main}>
          <WelcomeHero exiting={exiting} />
          <Animated.View
            style={[
              styles.copy,
              {
                opacity: sections[1],
                transform: [
                  {
                    translateY: sections[1].interpolate({
                      inputRange: [0, 1],
                      outputRange: [14, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.headline} accessibilityRole="header">
              Your drive.{'\n'}
              <Text style={styles.highlight}>Your choice.</Text>
            </Text>
            <Text style={styles.description}>
              Review the route and fare.{'\n'}Drive when you’re ready.
            </Text>
          </Animated.View>
        </View>
        <Animated.View
          style={[
            styles.footer,
            {
              opacity: sections[2],
              transform: [
                {
                  translateY: sections[2].interpolate({
                    inputRange: [0, 1],
                    outputRange: [18, 0],
                  }),
                },
                {
                  scale: sections[2].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.96, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            onPress={handleContinuePress}
            accessibilityRole="button"
            accessibilityLabel="Continue with your phone number"
            accessibilityHint="Sign in or register as a driver"
          >
            <Text style={styles.buttonText}>Continue with phone</Text>
            <Ionicons name="arrow-forward" size={22} color={colors.deepBrown} />
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = createStyles(() => ({
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
}));
