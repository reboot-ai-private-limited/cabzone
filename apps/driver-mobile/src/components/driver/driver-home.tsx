import { locationLabel } from '@/services/location-names';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { useDuty } from '@/context/duty-context';
import { useRide } from '@/context/ride-context';
import { colors, typography } from '@/design-system';
import { Ionicons } from '@expo/vector-icons';
import { deriveKycBannerState } from '@/services/profile';

export function DriverHome() {
  const router = useRouter();
  const { user, driver, driverProfile } = useAuth();
  const kycBanner = deriveKycBannerState(driverProfile);
  const {
    status,
    isToggling,
    coords,
    lastTransmittedAt,
    locationStatus,
    todaySummary,
    summaryError,
    isSummaryLoading,
    walletBalancePaise,
    useDevSimulatedLocation,
    setUseDevSimulatedLocation,
    error,
    clearError,
    goOnline,
    goOffline,
    refreshSummary,
  } = useDuty();

  const {
    offers,
    activeRide,
    pendingPaymentRide,
    rideError,
    clearRideError,
    refreshOffers,
    refreshActiveRide,
  } = useRide();

  const [timeAgo, setTimeAgo] = useState('just now');
  const [isVerifyingOnline, setIsVerifyingOnline] = useState(false);
  const [isCheckingRequests, setIsCheckingRequests] = useState(false);
  const lastNavigatedRideIdRef = React.useRef<string | null>(null);

  const handleCheckRideRequests = async () => {
    setIsCheckingRequests(true);
    try {
      await Promise.all([refreshOffers(true), refreshActiveRide()]);
    } finally {
      setIsCheckingRequests(false);
    }
  };

  // Auto-open active ride screen when a new ride (or accepted counter-offer) is assigned
  useEffect(() => {
    if (
      activeRide &&
      activeRide.status === 'DRIVER_ASSIGNED' &&
      lastNavigatedRideIdRef.current !== activeRide.id
    ) {
      lastNavigatedRideIdRef.current = activeRide.id;
      router.push({
        pathname: '/(driver)/ride/[rideId]',
        params: { rideId: activeRide.id },
      });
    }
  }, [activeRide, router]);

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
      }, 450);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top App Bar */}
        <View style={styles.topBar}>
          <View>
            <Image
              source={require('@/assets/brand/cabzone-horizontal.png')}
              style={styles.brandLogo}
              resizeMode="contain"
              accessibilityLabel="Cabzone"
            />
            <Text style={styles.driverSub}>
              {driver?.status === 'ACTIVE' ? `Verified · ${driverName}` : driverName}
            </Text>
          </View>
          <View style={[styles.statusBadge, isOnline ? styles.statusOnline : styles.statusOffline]}>
            <Text
              style={[
                styles.statusDot,
                isOnline ? styles.statusDotOnline : styles.statusDotOffline,
              ]}
            >
              ●
            </Text>
            <Text
              style={[
                styles.statusText,
                isOnline ? styles.statusTextOnline : styles.statusTextOffline,
              ]}
            >
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>
        </View>

        {/* Active Ride Recovery Banner */}
        {activeRide ? (
          <Pressable
            style={styles.activeRideBanner}
            onPress={() =>
              router.push({
                pathname: '/(driver)/ride/[rideId]',
                params: { rideId: activeRide.id },
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Resume active ride"
          >
            <View style={styles.activeRideLeft}>
              <View style={styles.activeRidePulseDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.activeRideLabel}>
                  ACTIVE RIDE · {activeRide.status.replace(/_/g, ' ')}
                </Text>
                <Text style={styles.activeRideRoute} numberOfLines={1}>
                  {locationLabel(activeRide.pickup.address, 'Pickup location')} →{' '}
                  {locationLabel(activeRide.drop.address, 'Destination')}
                </Text>
              </View>
            </View>
            <View style={styles.activeRideCta}>
              <Text style={styles.activeRideCtaText}>Open →</Text>
            </View>
          </Pressable>
        ) : null}

        {/* Non-blocking Pending Payment Banner */}
        {pendingPaymentRide && pendingPaymentRide.id !== activeRide?.id ? (
          <Pressable
            style={[styles.kycBanner, styles.kycBannerWarning]}
            onPress={() =>
              router.push({
                pathname: '/(driver)/ride/[rideId]',
                params: { rideId: pendingPaymentRide.id },
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Settle pending ride payment"
          >
            <Ionicons name="wallet-outline" size={22} color={colors.brandBrown} />
            <View style={{ flex: 1 }}>
              <Text style={styles.kycBannerTitle}>
                {pendingPaymentRide.status === 'PAYMENT_CASH_CLAIMED'
                  ? 'Passenger marked cash paid — Confirm receipt'
                  : `Pending trip payment · ₹${(
                      ((pendingPaymentRide.agreedFarePaise ??
                        pendingPaymentRide.proposedFarePaise ??
                        pendingPaymentRide.suggestedFarePaise ??
                        0) +
                        (pendingPaymentRide.arrearsPaise ?? 0)) /
                      100
                    ).toFixed(0)}`}
              </Text>
              <Text style={styles.kycBannerSub} numberOfLines={2}>
                {pendingPaymentRide.status === 'PAYMENT_CASH_CLAIMED'
                  ? 'Tap to confirm cash received or report unpaid. New offers stay unlocked.'
                  : `${locationLabel(pendingPaymentRide.pickup.address, 'Pickup')} → ${locationLabel(pendingPaymentRide.drop.address, 'Drop')} · Tap for QR or Cash`}
              </Text>
            </View>
            <View style={styles.kycBannerCta}>
              <Text style={styles.kycBannerCtaText}>Settle →</Text>
            </View>
          </Pressable>
        ) : null}

        {kycBanner ? (
          <Pressable
            style={[
              styles.kycBanner,
              kycBanner.tone === 'danger'
                ? styles.kycBannerDanger
                : kycBanner.tone === 'info'
                  ? styles.kycBannerInfo
                  : styles.kycBannerWarning,
            ]}
            onPress={() => router.push('/(driver)/account/documents')}
            accessibilityRole="button"
            accessibilityLabel={kycBanner.ctaLabel}
          >
            <Ionicons
              name={
                kycBanner.tone === 'danger'
                  ? 'warning-outline'
                  : kycBanner.tone === 'info'
                    ? 'time-outline'
                    : 'alert-circle-outline'
              }
              size={22}
              color={
                kycBanner.tone === 'danger'
                  ? colors.error
                  : kycBanner.tone === 'info'
                    ? colors.deepBrown
                    : colors.brandBrown
              }
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.kycBannerTitle}>{kycBanner.title}</Text>
              <Text style={styles.kycBannerSub}>{kycBanner.message}</Text>
            </View>
            <View style={styles.kycBannerCta}>
              <Text style={styles.kycBannerCtaText}>{kycBanner.ctaLabel}</Text>
            </View>
          </Pressable>
        ) : null}

        {/* Today's KPI Metrics Strip */}
        <View style={styles.kpiContainer}>
          <Pressable
            style={[styles.kpiCard, styles.earningsCard]}
            onPress={() => router.push('/(driver)/(tabs)/earnings')}
          >
            <Text style={styles.kpiLabel}>Today&apos;s Net Earnings</Text>
            <Text style={styles.kpiValue}>
              {todaySummary != null ? `₹${(todaySummary.netEarningsPaise / 100).toFixed(0)}` : '—'}
            </Text>
            <Text style={styles.kpiSub}>
              {todaySummary == null
                ? isSummaryLoading
                  ? 'Loading IST summary...'
                  : 'Summary unavailable'
                : todaySummary.pendingPaymentTripsCount > 0
                  ? `Gross ₹${(todaySummary.grossFarePaise / 100).toFixed(0)} · ${todaySummary.pendingPaymentTripsCount} awaiting payment`
                  : `Gross ₹${(todaySummary.grossFarePaise / 100).toFixed(0)} · IST Today`}
            </Text>
          </Pressable>

          <Pressable style={styles.kpiCard} onPress={() => router.push('/(driver)/(tabs)/rides')}>
            <Text style={styles.kpiLabel}>Completed Rides</Text>
            <Text style={styles.kpiValue}>
              {todaySummary != null ? todaySummary.completedTripsCount : '—'}
            </Text>
            <Text style={styles.kpiSub}>
              {todaySummary != null ? 'Settled today' : 'Unavailable'}
            </Text>
          </Pressable>

          <Pressable style={styles.kpiCard} onPress={() => router.push('/(driver)/wallet')}>
            <Text style={styles.kpiLabel}>Wallet balance</Text>
            <Text
              style={[
                styles.kpiValue,
                walletBalancePaise != null && walletBalancePaise < 0 ? styles.kpiNegative : null,
              ]}
            >
              {walletBalancePaise != null ? `₹${(walletBalancePaise / 100).toFixed(0)}` : '—'}
            </Text>
            <Text style={styles.kpiSub}>
              {walletBalancePaise == null
                ? isSummaryLoading
                  ? 'Loading...'
                  : 'Unavailable'
                : walletBalancePaise < 0
                  ? 'Commission due'
                  : 'Available'}
            </Text>
          </Pressable>
        </View>

        {summaryError ? (
          <View style={styles.summaryRetryBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryRetryTitle}>Earnings or wallet sync failed</Text>
              <Text style={styles.summaryRetryMsg}>{summaryError}</Text>
            </View>
            <Pressable
              style={styles.summaryRetryBtn}
              disabled={isSummaryLoading}
              onPress={() => void refreshSummary()}
              accessibilityRole="button"
              accessibilityLabel="Retry summary sync"
            >
              <Text style={styles.summaryRetryBtnText}>
                {isSummaryLoading ? 'Syncing...' : 'Retry'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Backend Ineligibility / Duty Error Banner */}
        {error ? (
          <View style={styles.errorBanner}>
            <View style={styles.errorIconBox}>
              <Ionicons name="alert-circle-outline" size={24} color={colors.error} />
            </View>
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>Availability Notice</Text>
              <Text style={styles.errorMessage}>{error}</Text>
            </View>
            <Pressable
              onPress={clearError}
              style={styles.errorClose}
              accessibilityRole="button"
              accessibilityLabel="Dismiss error"
              hitSlop={12}
            >
              <Text style={styles.errorCloseText}>✕</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Ride Conflict / Offer Notice Banner */}
        {rideError ? (
          <View style={styles.errorBanner}>
            <View style={styles.errorIconBox}>
              <Ionicons name="information-circle-outline" size={24} color={colors.brandBrown} />
            </View>
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>Ride Update</Text>
              <Text style={styles.errorMessage}>{rideError}</Text>
            </View>
            <Pressable
              onPress={clearRideError}
              style={styles.errorClose}
              accessibilityRole="button"
              accessibilityLabel="Dismiss ride notice"
              hitSlop={12}
            >
              <Text style={styles.errorCloseText}>✕</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Main Availability Canvas */}
        <View style={[styles.canvasCard, isOnline ? styles.canvasOnline : styles.canvasOffline]}>
          {isOnline ? (
            /* ONLINE VIEW */
            <View style={styles.onlineSection}>
              <View style={styles.radarRing}>
                <View style={styles.radarPulse}>
                  <Ionicons name="radio-outline" size={44} color={colors.white} />
                </View>
              </View>

              <Text style={styles.onlineTitle}>
                {offers.length > 0
                  ? `${offers.length} Active Ride Request${offers.length > 1 ? 's' : ''} Nearby!`
                  : 'Searching for rides...'}
              </Text>
              <Text style={styles.onlineSub}>
                Stay in your service zone to receive ride offers. You will see pickup distance and
                fare before accepting.
              </Text>

              {/* Keep the duty location state readable at a glance. */}
              <View style={styles.telemetryBox}>
                <View style={styles.telemetryRow}>
                  <Text style={styles.telemetryLabel}>GPS Telemetry</Text>
                  <Text style={styles.telemetryVal}>
                    {coords ? 'Connected · Live' : 'Acquiring GPS'}
                  </Text>
                </View>
                {__DEV__ ? (
                  <View style={styles.telemetryRow}>
                    <Text style={styles.telemetryLabel}>Diagnostics</Text>
                    <Text style={styles.telemetryVal}>
                      {locationStatus} · {timeAgo}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Manual Check for Active Ride Requests Button */}
              <Pressable
                style={[styles.checkRequestsButton, isCheckingRequests && styles.buttonDisabled]}
                disabled={isCheckingRequests}
                accessibilityRole="button"
                accessibilityLabel="Check for active ride requests"
                onPress={handleCheckRideRequests}
              >
                {isCheckingRequests ? (
                  <ActivityIndicator size="small" color={colors.deepBrown} />
                ) : (
                  <>
                    <Ionicons name="refresh-circle" size={20} color={colors.deepBrown} />
                    <Text style={styles.checkRequestsButtonText}>
                      {offers.length > 0
                        ? `View Active Ride Requests (${offers.length})`
                        : 'Check for Active Ride Requests'}
                    </Text>
                  </>
                )}
              </Pressable>

              {/* GO OFFLINE Action Button */}
              <Pressable
                style={[styles.offlineButton, isToggling && styles.buttonDisabled]}
                disabled={isToggling}
                accessibilityRole="button"
                accessibilityLabel="Go offline"
                accessibilityState={{ disabled: isToggling, busy: isToggling }}
                onPress={goOffline}
              >
                {isToggling ? (
                  <ActivityIndicator color={colors.deepBrown} />
                ) : (
                  <Text style={styles.offlineButtonText}>GO OFFLINE</Text>
                )}
              </Pressable>
            </View>
          ) : (
            /* OFFLINE VIEW */
            <View style={styles.offlineSection}>
              <View style={styles.sleepIconCircle}>
                <Ionicons name="car-sport-outline" size={44} color={colors.deepBrown} />
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
                  <Text style={styles.checkText}>KYC status: {driver?.kycStatus ?? 'Unknown'}</Text>
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
                style={[
                  styles.onlineButton,
                  (isToggling || isVerifyingOnline) && styles.buttonDisabled,
                ]}
                disabled={isToggling || isVerifyingOnline}
                accessibilityRole="button"
                accessibilityLabel="Go online"
                accessibilityState={{
                  disabled: isToggling || isVerifyingOnline,
                  busy: isToggling || isVerifyingOnline,
                }}
                onPress={
                  isKycVerified ? handleGoOnline : () => router.push('/(driver)/account/documents')
                }
              >
                {isToggling || isVerifyingOnline ? (
                  <ActivityIndicator color={colors.deepBrown} />
                ) : (
                  <Text style={styles.onlineButtonText}>
                    {isKycVerified ? 'GO ONLINE →' : 'RENEW DOCUMENTS TO GO ONLINE →'}
                  </Text>
                )}
              </Pressable>
            </View>
          )}
        </View>

        {/* Going Online Verification Modal / State */}
        {isVerifyingOnline ? (
          <View style={styles.verifyingOverlay}>
            <View style={styles.verifyingCard}>
              <ActivityIndicator
                size="large"
                color={colors.deepBrown}
                style={{ marginBottom: 16 }}
              />
              <Text style={styles.verifyingTitle}>Getting you online...</Text>
              <View style={styles.verifyingList}>
                <Text style={styles.verifyingItem}>
                  Checking account, vehicle, location and wallet
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Dev Location Simulation Opt-In (Only in __DEV__) */}
        {__DEV__ ? (
          <View style={styles.devSimBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.devSimTitle}>Dev Mode: Simulate Siliguri GPS</Text>
              <Text style={styles.devSimSub}>
                Fallback to Siliguri center when running on emulator/web without hardware GPS.
              </Text>
            </View>
            <Switch
              value={useDevSimulatedLocation}
              onValueChange={setUseDevSimulatedLocation}
              trackColor={{ false: '#CBD5E1', true: colors.amber }}
              thumbColor={colors.deepBrown}
            />
          </View>
        ) : null}
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
    paddingBottom: 120,
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
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  statusOffline: {
    backgroundColor: colors.lightCream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusDot: {
    fontSize: typography.sizes.xs,
  },
  statusDotOnline: {
    color: '#16A34A',
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
    color: '#15803D',
  },
  statusTextOffline: {
    color: colors.deepBrown,
  },
  activeRideBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.deepBrown,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  activeRideLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  activeRidePulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.amber,
  },
  activeRideLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.amber,
    letterSpacing: 0.5,
  },
  activeRideRoute: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.white,
    marginTop: 2,
  },
  activeRideCta: {
    backgroundColor: colors.amber,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  activeRideCtaText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
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
    backgroundColor: colors.cream,
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
    color: colors.deepBrown,
  },
  kpiNegative: {
    color: colors.error,
  },
  kpiSub: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    marginTop: 2,
  },
  summaryRetryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  summaryRetryTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  summaryRetryMsg: {
    fontSize: 11,
    color: colors.secondary,
    marginTop: 2,
  },
  summaryRetryBtn: {
    backgroundColor: colors.amber,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  summaryRetryBtnText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorIconBox: {
    marginRight: 10,
  },
  errorContent: {
    flex: 1,
  },
  errorTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: '#991B1B',
  },
  errorMessage: {
    fontSize: typography.sizes.xs,
    color: '#B91C1C',
    marginTop: 2,
    lineHeight: 16,
  },
  errorClose: {
    padding: 4,
  },
  errorCloseText: {
    fontSize: typography.sizes.label,
    color: '#991B1B',
    fontWeight: '700',
  },
  canvasCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    shadowColor: colors.deepBrown,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  canvasOnline: {
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  canvasOffline: {
    borderColor: colors.border,
  },
  onlineSection: {
    alignItems: 'center',
  },
  radarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  radarPulse: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#15803D',
    marginBottom: 6,
  },
  onlineSub: {
    fontSize: typography.sizes.sm,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  telemetryBox: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
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
    color: colors.deepBrown,
  },
  checkRequestsButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.amber,
    borderRadius: 14,
    paddingVertical: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.deepBrown,
  },
  checkRequestsButtonText: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  offlineButton: {
    width: '100%',
    backgroundColor: colors.warmBeige,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.softAmber,
  },
  offlineButtonText: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  offlineSection: {
    alignItems: 'center',
  },
  sleepIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.lightCream,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  offlineTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.deepBrown,
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
    backgroundColor: colors.cream,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkOk: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: '#16A34A',
  },
  checkWait: {
    fontSize: typography.sizes.xs,
    color: '#F59E0B',
  },
  checkText: {
    fontSize: typography.sizes.xs,
    color: colors.deepBrown,
    fontWeight: '600',
  },
  onlineButton: {
    width: '100%',
    backgroundColor: colors.amber,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.deepBrown,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  onlineButtonText: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  verifyingOverlay: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    marginBottom: 20,
    shadowColor: '#16A34A',
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
    color: colors.deepBrown,
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
    color: '#15803D',
  },
  devSimBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cream,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  kycBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
  },
  kycBannerDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  kycBannerWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: colors.amber,
  },
  kycBannerInfo: {
    backgroundColor: colors.cream,
    borderColor: colors.border,
  },
  kycBannerTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  kycBannerSub: {
    fontSize: 11,
    color: colors.secondary,
    marginTop: 2,
    lineHeight: 15,
  },
  kycBannerCta: {
    backgroundColor: colors.deepBrown,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  kycBannerCtaText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
  },
  devSimTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  devSimSub: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    marginTop: 2,
  },
});
