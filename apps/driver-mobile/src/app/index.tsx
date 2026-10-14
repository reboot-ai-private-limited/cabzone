import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { useRide } from '@/context/ride-context';
import { CabzonLaunch } from '@/components/onboarding/cabzon-launch';
import { colors, typography } from '@/design-system';
import { Ionicons } from '@expo/vector-icons';

export default function IndexGateScreen() {
  const {
    isAuthenticated,
    isLoading,
    bootstrapError,
    retryBootstrap,
    logout,
    application,
    isKycVerified,
  } = useAuth();
  const { activeRide, isCheckingActiveRide } = useRide();
  const [launchFinished, setLaunchFinished] = useState(false);

  // 1. Wait for launch splash + session restoration + active ride check
  if (!launchFinished || isLoading || (isAuthenticated && isKycVerified && isCheckingActiveRide)) {
    return (
      <View style={styles.container}>
        <CabzonLaunch onFinish={() => setLaunchFinished(true)} />
      </View>
    );
  }

  // 2. Temporary network/server bootstrap error: preserve credentials and offer Retry
  if (bootstrapError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <View style={styles.errorCard}>
          <View style={styles.errorIconCircle}>
            <Ionicons name="cloud-offline-outline" size={36} color={colors.deepBrown} />
          </View>
          <Text style={styles.errorTitle}>Connection Interrupted</Text>
          <Text style={styles.errorSub}>{bootstrapError}</Text>

          <Pressable
            style={styles.retryBtn}
            onPress={() => void retryBootstrap()}
            accessibilityRole="button"
            accessibilityLabel="Retry connection">
            <Text style={styles.retryBtnText}>Retry Connection</Text>
          </Pressable>

          <Pressable
            style={styles.signOutBtn}
            onPress={() => void logout()}
            accessibilityRole="button"
            accessibilityLabel="Sign out">
            <Text style={styles.signOutBtnText}>Sign Out & Switch Account</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // 3. Unauthenticated -> Auth group
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/welcome" />;
  }

  // 4. Authenticated & Approved Driver
  if (isKycVerified) {
    if (activeRide) {
      return (
        <Redirect
          href={{
            pathname: '/(driver)/ride/[rideId]',
            params: { rideId: activeRide.id },
          }}
        />
      );
    }
    return <Redirect href="/(driver)/(tabs)/home" />;
  }

  // 5. Authenticated & Application Under Review
  const appStatus = application?.status;
  const isUnderReview =
    appStatus === 'SUBMITTED' ||
    appStatus === 'UNDER_REVIEW_AUTO' ||
    appStatus === 'UNDER_REVIEW_ADMIN' ||
    appStatus === 'REAPPLIED';

  if (isUnderReview) {
    return <Redirect href="/(onboarding)/application-status" />;
  }

  // 6. Authenticated & Needs Onboarding or Fixable Rejection Resubmission
  return <Redirect href="/(onboarding)/onboarding" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.cream,
    justifyContent: 'center',
    padding: 24,
  },
  errorCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  errorIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.lightCream,
    borderWidth: 1,
    borderColor: colors.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: '800',
    color: colors.deepBrown,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSub: {
    fontSize: typography.sizes.sm,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryBtn: {
    width: '100%',
    backgroundColor: colors.amber,
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  retryBtnText: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  signOutBtn: {
    paddingVertical: 10,
  },
  signOutBtnText: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.secondary,
  },
});
