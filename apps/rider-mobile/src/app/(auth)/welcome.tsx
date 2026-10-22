import React, { useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@/design-system';
import { WelcomeHero } from '@/components/auth/welcome-hero';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export default function WelcomeScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [press] = useState(() => new Animated.Value(0));
  const animatePress = (toValue: number) => {
    if (reducedMotion) return;
    Animated.timing(press, { toValue, duration: 180, useNativeDriver: true }).start();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Image
            source={require('@/assets/brand/cabzone-horizontal.png')}
            style={styles.brandLogo}
            resizeMode="contain"
            accessibilityLabel="Cabzone"
            accessibilityRole="image"
          />
        </View>

        <View style={styles.main}>
          <WelcomeHero />

          <View style={styles.copy}>
            <Text accessibilityRole="header" style={styles.headline}>
              Your ride.{'\n'}
              <Text style={styles.highlight}>Your fare.</Text>
            </Text>
            <Text style={styles.description}>
              City rides and outstation trips.{'\n'}Agree on a fare before you go.
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
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
              onPress={() => router.navigate('/(auth)/phone')}
              onPressIn={() => animatePress(1)}
              onPressOut={() => animatePress(0)}
            >
              <Text style={styles.primaryButtonText}>Continue with phone</Text>
              <Ionicons name="arrow-forward" size={22} color={colors.deepBrown} />
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
});
