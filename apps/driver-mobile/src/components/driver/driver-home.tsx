import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '@/context/auth-context';
import { useDuty } from '@/context/duty-context';
import { colors, typography } from '@/design-system';
import { Ionicons } from '@expo/vector-icons';

export function DriverHome() {
  const { user, driver, logout, isLoading: isAuthLoading } = useAuth();
  const {
    status,
    isToggling,
    coords,
    lastTransmittedAt,
    locationStatus,
    todayEarningsPaise,
    todayCompletedTrips,
    walletBalancePaise,
    error,
    clearError,
    goOnline,
    goOffline,
  } = useDuty();

  const [timeAgo, setTimeAgo] = useState('just now');
  const [isVerifyingOnline, setIsVerifyingOnline] = useState(false);

  // Update telemetry freshness label every second
  useEffect(() => {
    if (!lastTransmittedAt) return;
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - lastTransmittedAt.getTime()) / 1000);
      if (seconds < 3) {
        setTimeAgo('just now');
      } else {
        setTimeAgo(`${seconds}s ago`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lastTransmittedAt]);

  const phone = user?.phoneE164 || '';
  const isOnline = status === 'ONLINE';
  const isKycVerified = driver?.kycStatus === 'VERIFIED';
  const hasVehicle = !!driver?.currentVehicleId;
  const driverName = driver?.name || phone || 'Driver Partner';

  const handleGoOnline = async () => {
    setIsVerifyingOnline(true);
    try {
      await goOnline();
    } finally {
      setTimeout(() => {
        setIsVerifyingOnline(false);
      }, 600);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top App Bar */}
        <View style={styles.topBar}>
          <View>
            <Image source={require('@/assets/brand/cabzone-horizontal.png')} style={styles.brandLogo} resizeMode="contain" accessibilityLabel="Cabzone" />
            <Text style={styles.driverSub}>
              {driver?.status === 'ACTIVE' ? 'Verified Driver' : 'Driver Partner'}
            </Text>
          </View>
          <View style={[styles.statusBadge, isOnline ? styles.statusOnline : styles.statusOffline]}>
            <Text style={[styles.statusDot, isOnline ? styles.statusDotOnline : styles.statusDotOffline]}>
              ●
            </Text>
            <Text style={[styles.statusText, isOnline ? styles.statusTextOnline : styles.statusTextOffline]}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>
        </View>

        {/* Today's KPI Metrics Strip (Section 8) */}
        <View style={styles.kpiContainer}>
          <View style={[styles.kpiCard, styles.earningsCard]}>
            <Text style={styles.kpiLabel}>Today&apos;s Earnings</Text>
            <Text style={styles.kpiValue}>₹{(todayEarningsPaise / 100).toFixed(0)}</Text>
            <Text style={styles.kpiSub}>Cash and UPI rides</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Completed Rides</Text>
            <Text style={styles.kpiValue}>{todayCompletedTrips}</Text>
            <Text style={styles.kpiSub}>Trips today</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Wallet balance</Text>
            <Text
              style={[
                styles.kpiValue,
                walletBalancePaise != null && walletBalancePaise < 0 ? styles.kpiNegative : null,
              ]}>
              ₹{walletBalancePaise != null ? (walletBalancePaise / 100).toFixed(0) : '0'}
            </Text>
            <Text style={styles.kpiSub}>
              {walletBalancePaise != null && walletBalancePaise < 0 ? 'Amount due' : 'Available'}
            </Text>
          </View>
        </View>

        {/* Backend Ineligibility / Error Banner */}
        {error ? (
          <View style={styles.errorBanner}>
            <View style={styles.errorIconBox}>
              <Ionicons name="alert-circle-outline" size={24} color={colors.error} />
            </View>
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>Cannot Go Online</Text>
              <Text style={styles.errorMessage}>{error}</Text>
            </View>
            <Pressable onPress={clearError} style={styles.errorClose} accessibilityRole="button" accessibilityLabel="Dismiss error" hitSlop={12}>
              <Text style={styles.errorCloseText}>✕</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Main Availability Canvas (Section 8) */}
        <View style={[styles.canvasCard, isOnline ? styles.canvasOnline : styles.canvasOffline]}>
          {isOnline ? (
            /* ONLINE VIEW */
            <View style={styles.onlineSection}>
              <View style={styles.radarRing}>
                <View style={styles.radarPulse}>
                  <Ionicons name="radio-outline" size={48} color={colors.darkNavy} />
                </View>
              </View>

              <Text style={styles.onlineTitle}>Searching for rides...</Text>
              <Text style={styles.onlineSub}>
                Stay in your service zone to receive ride offers. You will be alerted with sound when a request arrives.
              </Text>

              {/* Keep the duty location state readable at a glance. */}
              <View style={styles.telemetryBox}>
                <View style={styles.telemetryRow}>
                  <Text style={styles.telemetryLabel}>Location</Text>
                  <Text style={styles.telemetryVal}>
                    {coords ? 'Connected' : 'Connecting'}
                  </Text>
                </View>
                {__DEV__ ? (
                  <View style={styles.telemetryRow}>
                    <Text style={styles.telemetryLabel}>Diagnostics</Text>
                    <Text style={styles.telemetryVal}>{locationStatus} · {timeAgo}</Text>
                  </View>
                ) : null}
              </View>

              {/* GO OFFLINE Action Button */}
              <Pressable
                style={[styles.offlineButton, isToggling && styles.buttonDisabled]}
                disabled={isToggling}
                accessibilityRole="button"
                accessibilityLabel="Go offline"
                accessibilityState={{ disabled: isToggling, busy: isToggling }}
                onPress={goOffline}>
                {isToggling ? (
                  <ActivityIndicator color="#dc2626" />
                ) : (
                  <Text style={styles.offlineButtonText}>GO OFFLINE</Text>
                )}
              </Pressable>
            </View>
          ) : (
            /* OFFLINE VIEW */
            <View style={styles.offlineSection}>
              <View style={styles.sleepIconCircle}>
                <Ionicons name="car-sport-outline" size={48} color={colors.darkNavy} />
              </View>

              <Text style={styles.offlineTitle}>You are currently OFFLINE</Text>
              <Text style={styles.offlineSub}>
                Go online to start receiving ride opportunities from passengers nearby.
              </Text>

              {/* Eligibility checklist preview */}
              <View style={styles.checklist}>
                <View style={styles.checkItem}>
                  <Text style={isKycVerified ? styles.checkOk : styles.checkWait}>
                    {isKycVerified ? '✓' : '●'}
                  </Text>
                  <Text style={styles.checkText}>
                    KYC status: {driver?.kycStatus ?? 'Unknown'}
                  </Text>
                </View>
                <View style={styles.checkItem}>
                  <Text style={hasVehicle ? styles.checkOk : styles.checkWait}>
                    {hasVehicle ? '✓' : '●'}
                  </Text>
                  <Text style={styles.checkText}>
                    Vehicle registered: {hasVehicle ? 'Yes' : 'No'}
                  </Text>
                </View>
              </View>

              {/* GO ONLINE Action Button */}
              <Pressable
                style={[styles.onlineButton, (isToggling || isVerifyingOnline) && styles.buttonDisabled]}
                disabled={isToggling || isVerifyingOnline}
                accessibilityRole="button"
                accessibilityLabel="Go online"
                accessibilityState={{ disabled: isToggling || isVerifyingOnline, busy: isToggling || isVerifyingOnline }}
                onPress={handleGoOnline}>
                {isToggling || isVerifyingOnline ? (
                  <ActivityIndicator color={colors.deepBrown} />
                ) : (
                  <Text style={styles.onlineButtonText}>GO ONLINE →</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>

        {/* Flow 15: Going Online Verification Modal / State */}
        {isVerifyingOnline ? (
          <View style={styles.verifyingOverlay}>
            <View style={styles.verifyingCard}>
              <ActivityIndicator size="large" color="#12304A" style={{ marginBottom: 16 }} />
              <Text style={styles.verifyingTitle}>Getting you online...</Text>
              <View style={styles.verifyingList}>
                <Text style={styles.verifyingItem}>Checking account, vehicle, location and wallet</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Driver Profile Footer */}
        <View style={styles.profileFooter}>
          <View style={styles.profileHeader}>
            <View>
              <Text style={styles.footerName}>{driverName}</Text>
              <Text style={styles.footerPhone}>{phone}</Text>
            </View>
            <View style={styles.ratingPill}>
              <Text style={styles.ratingText}>
                {driver?.ratingAverage != null ? driver.ratingAverage.toFixed(1) : '5.0'} ⭐
              </Text>
            </View>
          </View>

          <Pressable
            style={styles.logoutBtn}
            onPress={logout}
            accessibilityRole="button"
            accessibilityLabel="Log out"
            disabled={isAuthLoading || isToggling}>
            <Text style={styles.logoutBtnText}>Log Out Account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandLogo: {
    width: 126,
    height: 42,
  },
  driverSub: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: colors.secondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusOnline: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  statusOffline: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  statusDot: {
    fontSize: typography.sizes.xs,
  },
  statusDotOnline: {
    color: '#16a34a',
  },
  statusDotOffline: {
    color: colors.secondary,
  },
  statusText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusTextOnline: {
    color: '#15803d',
  },
  statusTextOffline: {
    color: '#475569',
  },
  kpiContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
  },
  earningsCard: {
    flexBasis: '100%',
    flexGrow: 0,
  },
  kpiLabel: {
    fontSize: typography.sizes.label,
    color: colors.secondary,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'left',
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.darkNavy,
  },
  kpiNegative: {
    color: '#dc2626',
  },
  kpiSub: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    marginTop: 2,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorIconBox: {
    marginRight: 10,
  },
  errorIcon: {
    fontSize: 20,
  },
  errorContent: {
    flex: 1,
  },
  errorTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: '#991b1b',
  },
  errorMessage: {
    fontSize: typography.sizes.xs,
    color: '#b91c1c',
    marginTop: 2,
    lineHeight: 16,
  },
  errorClose: {
    padding: 4,
  },
  errorCloseText: {
    fontSize: typography.sizes.label,
    color: '#991b1b',
    fontWeight: '700',
  },
  canvasCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  canvasOnline: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  canvasOffline: {
    borderColor: '#e2e8f0',
  },
  onlineSection: {
    alignItems: 'center',
  },
  radarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  radarPulse: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarIcon: {
    fontSize: typography.sizes.xxl,
  },
  onlineTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#15803d',
    marginBottom: 6,
  },
  onlineSub: {
    fontSize: typography.sizes.sm,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  telemetryBox: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginBottom: 20,
    gap: 6,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  telemetryLabel: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    fontWeight: '600',
  },
  telemetryVal: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: '#1e293b',
  },
  telemetryLive: {
    color: '#16a34a',
  },
  offlineButton: {
    width: '100%',
    backgroundColor: colors.lightBlue,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineButtonText: {
    fontSize: typography.sizes.base,
    fontWeight: '600',
    color: colors.darkNavy,
  },
  offlineSection: {
    alignItems: 'center',
  },
  sleepIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  sleepIcon: {
    fontSize: 36,
  },
  offlineTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  offlineSub: {
    fontSize: typography.sizes.sm,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  checklist: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    gap: 6,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkOk: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: '#16a34a',
  },
  checkWait: {
    fontSize: typography.sizes.xs,
    color: '#f59e0b',
  },
  checkText: {
    fontSize: typography.sizes.xs,
    color: '#334155',
    fontWeight: '500',
  },
  onlineButton: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  onlineButtonText: {
    fontSize: typography.sizes.base,
    fontWeight: '600',
    color: colors.deepBrown,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  profileFooter: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  footerName: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: '#0f172a',
  },
  footerPhone: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    marginTop: 2,
  },
  ratingPill: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ratingText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: '#b45309',
  },
  logoutBtn: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
    alignItems: 'center',
  },
  logoutBtnText: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: '#94a3b8',
  },
  verifyingOverlay: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#bbf7d0',
    marginBottom: 20,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  verifyingCard: {
    alignItems: 'center',
  },
  verifyingTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.darkNavy,
    marginBottom: 14,
  },
  verifyingList: {
    gap: 8,
    alignItems: 'flex-start',
    width: '100%',
    paddingHorizontal: 20,
  },
  verifyingItem: {
    fontSize: typography.sizes.label,
    fontWeight: '700',
    color: '#15803d',
  },
});
