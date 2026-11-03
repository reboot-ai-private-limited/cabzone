import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth-context';
import { useRide } from '@/context/ride-context';
import { colors, radii, spacing, typography, createStyles } from '@/design-system';

export default function BootstrapIndexScreen() {
  const router = useRouter();
  const {
    isBootstrapping,
    bootstrapError,
    token,
    needsNameSetup,
    retryBootstrap,
    logout,
  } = useAuth();
  const { activeRide, isLoadingRides } = useRide();

  useEffect(() => {
    if (isBootstrapping || bootstrapError) return;

    if (!token) {
      router.replace('/(auth)/welcome');
      return;
    }

    if (activeRide) {
      router.replace(`/(rider)/ride/${activeRide.id}`);
      return;
    }

    if (needsNameSetup) {
      router.replace('/(onboarding)/name');
      return;
    }

    if (!isLoadingRides) {
      router.replace('/(rider)/(tabs)/home');
    }
  }, [
    activeRide,
    bootstrapError,
    isBootstrapping,
    isLoadingRides,
    needsNameSetup,
    router,
    token,
  ]);

  if (bootstrapError) {
    return (
      <View style={styles.container}>
        <View style={styles.errorCard}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.brandBrown} />
          <Text style={styles.title}>Connection Interrupted</Text>
          <Text style={styles.subtitle}>{bootstrapError}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => void retryBootstrap()}>
            <Text style={styles.primaryBtnText}>Retry Connection</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => void logout()}>
            <Text style={styles.secondaryBtnText}>Sign in with another account</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.brandCircle}>
        <Ionicons name="car-sport" size={38} color={colors.deepBrown} />
      </View>
      <Text style={styles.brandTitle}>Cabzone</Text>
      <Text style={styles.brandTagline}>Fair fares · City & Intercity</Text>
      <ActivityIndicator
        size="large"
        color={colors.deepBrown}
        style={{ marginTop: spacing.lg }}
      />
    </View>
  );
}

const styles = createStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  brandCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.amber,
    borderWidth: 2,
    borderColor: colors.deepBrown,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  brandTitle: {
    ...typography.hero,
    color: colors.deepBrown,
  },
  brandTagline: {
    ...typography.body,
    color: colors.secondary,
    marginTop: 4,
  },
  errorCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    ...typography.h1,
    color: colors.deepBrown,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.secondary,
    textAlign: 'center',
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: colors.amber,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  secondaryBtn: {
    paddingVertical: 8,
  },
  secondaryBtnText: {
    ...typography.caption,
    color: colors.brandBrown,
    fontWeight: '700',
  },
}));
