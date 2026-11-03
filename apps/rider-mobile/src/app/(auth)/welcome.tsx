import React, { useCallback, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography, createStyles } from '@/design-system';
import { WelcomeHero } from '@/components/auth/welcome-hero';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export default function WelcomeScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [exiting, setExiting] = useState(false);
  const exitingRef = useRef(false);
  const [press] = useState(() => new Animated.Value(0));
  const [sections] = useState(() => [
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
  ]);

  useFocusEffect(
    useCallback(() => {
      exitingRef.current = false;
      setExiting(false);
      press.setValue(0);
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
    }, [press, reducedMotion, sections]),
  );

  const animatePress = (toValue: number) => {
    if (reducedMotion || exitingRef.current) return;
    Animated.timing(press, { toValue, duration: 180, useNativeDriver: true }).start();
  };

  const handleContinue = () => {
    if (reducedMotion) {
      router.navigate('/(auth)/phone');
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
        router.navigate('/(auth)/phone');
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
            style={styles.brandLogo}
            resizeMode="contain"
            accessibilityLabel="Cabzone"
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
            <Text accessibilityRole="header" style={styles.headline}>
              Your ride.{'\n'}
              <Text style={styles.highlight}>Your fare.</Text>
            </Text>
            <Text style={styles.description}>
              City rides and outstation trips.{'\n'}Agree on a fare before you go.
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
          <Animated.View
            style={{
              transform: [
                { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) },
              ],
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Get started with your phone number"
              accessibilityHint="Opens phone sign-in for new and returning riders"
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
              onPress={handleContinue}
              onPressIn={() => animatePress(1)}
              onPressOut={() => animatePress(0)}
            >
              <Text style={styles.primaryButtonText}>Continue with phone</Text>
              <Ionicons name="arrow-forward" size={22} color={colors.deepBrown} />
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = createStyles(() => ({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  header: { alignItems: 'center' },
  brandLogo: { width: 150, height: 52 },
  main: { flex: 1, minHeight: 0, justifyContent: 'center', paddingVertical: spacing.lg },
  copy: { alignItems: 'center', flexShrink: 0, paddingTop: spacing.md },
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
    ...typography.body,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.md,
    maxWidth: 330,
  },
  footer: { flexShrink: 0, paddingTop: spacing.sm },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.amber,
    borderRadius: radii.md,
    minHeight: 56,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonPressed: { backgroundColor: colors.amberStrong },
  primaryButtonText: {
    ...typography.bodyBold,
    fontSize: 17,
    color: colors.deepBrown,
    flexShrink: 1,
  },
}));
