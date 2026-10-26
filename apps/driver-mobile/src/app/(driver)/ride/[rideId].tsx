import React, { useCallback, useEffect, useState } from 'react';
import { RidePaymentQr } from '@/components/driver/ride-payment-qr';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { CancellationReason, RideDto, RideStatus } from '@cabzone/contracts';
import { useRide } from '@/context/ride-context';
import { computeRideEarningsBreakdown } from '@/context/duty-context';
import { colors, typography } from '@/design-system';

const DRIVER_CANCEL_REASONS: { code: CancellationReason; label: string; desc: string }[] = [
  {
    code: 'RIDER_NO_SHOW',
    label: 'Passenger did not arrive',
    desc: 'Waited at pickup point and passenger was unreachable',
  },
  {
    code: 'DRIVER_DELAYED',
    label: 'Traffic or vehicle issue',
    desc: 'Unable to reach pickup point on time',
  },
  {
    code: 'FARE_DISAGREEMENT',
    label: 'Route or fare issue',
    desc: 'Passenger requested an unsupported route change',
  },
];

function getStatusMeta(status: RideStatus): {
  badge: string;
  headline: string;
  subtitle: string;
  tone: 'amber' | 'green' | 'red';
} {
  switch (status) {
    case 'DRIVER_ASSIGNED':
      return {
        badge: 'RIDE ASSIGNED',
        headline: 'Head to the pickup location',
        subtitle: 'Tap "Start Driving to Pickup" once you begin moving toward the passenger.',
        tone: 'amber',
      };
    case 'DRIVER_EN_ROUTE':
      return {
        badge: 'EN ROUTE TO PICKUP',
        headline: 'Driving to pickup point',
        subtitle: 'Follow navigation to the passenger pickup location and mark arrival when there.',
        tone: 'amber',
      };
    case 'DRIVER_ARRIVED':
      return {
        badge: 'ARRIVED AT PICKUP',
        headline: 'Ask passenger for 4-digit OTP',
        subtitle: 'Verify the passenger name and enter their 4-digit pickup OTP to start the trip.',
        tone: 'amber',
      };
    case 'TRIP_STARTED':
      return {
        badge: 'ON TRIP',
        headline: 'Driving to destination',
        subtitle: 'Follow the route to the destination and complete the trip upon arrival.',
        tone: 'green',
      };
    case 'TRIP_COMPLETED':
    case 'PAYMENT_PENDING':
      return {
        badge: 'AWAITING DIRECT PAYMENT',
        headline: 'Collect Cash or UPI directly',
        subtitle:
          'Collect the agreed fare directly from the passenger via Cash or personal UPI, then confirm receipt below.',
        tone: 'amber',
      };
    case 'SETTLED':
    case 'PAYMENT_CONFIRMED':
      return {
        badge: 'RIDE SETTLED',
        headline: 'Payment confirmed & trip settled',
        subtitle: 'Commission has been recorded in your wallet ledger.',
        tone: 'green',
      };
    case 'PAYMENT_DISPUTED':
      return {
        badge: 'PAYMENT DISPUTED',
        headline: 'Payment under support review',
        subtitle:
          'A payment dispute was raised for this ride. Cabzone Support will review the audit log.',
        tone: 'red',
      };
    case 'CANCELLED':
      return {
        badge: 'CANCELLED',
        headline: 'This ride was cancelled',
        subtitle: 'You can return to the Home screen to receive new ride offers.',
        tone: 'red',
      };
    default:
      return {
        badge: status,
        headline: 'Ride status update',
        subtitle: 'Review the latest ride details below.',
        tone: 'amber',
      };
  }
}

export default function ActiveRideScreen() {
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const {
    activeRide,
    isMutatingRide,
    rideError,
    clearRideError,
    refreshActiveRide,
    markEnRoute,
    markArrived,
    startTripWithOtp,
    completeTrip,
    confirmDirectPayment,
    cancelTrip,
  } = useRide();

  const [fetchedRide, setFetchedRide] = useState<RideDto | null>(
    activeRide && activeRide.id === rideId ? activeRide : null,
  );
  const [isLoadingRide, setIsLoadingRide] = useState<boolean>(
    !(activeRide && activeRide.id === rideId),
  );
  const [otpInput, setOtpInput] = useState<string>('');
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [selectedCancelReason, setSelectedCancelReason] =
    useState<CancellationReason>('RIDER_NO_SHOW');
  const [settlementSummary, setSettlementSummary] = useState<{
    farePaise: number;
    commissionPaise: number;
    walletBalancePaise: number;
  } | null>(null);

  const setRide = setFetchedRide;
  const ride =
    activeRide && activeRide.id === rideId
      ? activeRide
      : fetchedRide && fetchedRide.id === rideId
        ? fetchedRide
        : null;

  const loadRide = useCallback(async () => {
    if (!rideId) return;
    setIsLoadingRide(true);
    try {
      const fetched = await refreshActiveRide(rideId);
      if (fetched) {
        setFetchedRide(fetched);
      }
    } finally {
      setIsLoadingRide(false);
    }
  }, [rideId, refreshActiveRide]);

  useEffect(() => {
    if (activeRide && activeRide.id === rideId) {
      const syncTimer = setTimeout(() => {
        setFetchedRide((prev) =>
          prev && prev.id === activeRide.id && prev.version > activeRide.version
            ? prev
            : activeRide,
        );
      }, 0);
      return () => clearTimeout(syncTimer);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRide();
  }, [activeRide, rideId, loadRide]);

  if (isLoadingRide && !ride) {
    return (
      <SafeAreaView style={styles.centeredScreen}>
        <ActivityIndicator size="large" color={colors.deepBrown} />
        <Text style={styles.loadingText}>Loading ride details...</Text>
      </SafeAreaView>
    );
  }

  if (!ride) {
    return (
      <SafeAreaView style={styles.centeredScreen}>
        <Ionicons name="car-outline" size={48} color={colors.deepBrown} />
        <Text style={styles.emptyTitle}>Ride Not Found</Text>
        <Text style={styles.emptySub}>
          Could not load this ride. It may have expired or been reassigned.
        </Text>
        <Pressable
          style={styles.primaryCta}
          onPress={() => router.replace('/(driver)/(tabs)/home')}
        >
          <Text style={styles.primaryCtaText}>Back to Home</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const meta = getStatusMeta(ride.status);
  const onlinePayment = ride.paymentCollection === 'RAZORPAY_TEST';
  if (ride.status === 'PAYMENT_PENDING' || ride.status === 'TRIP_COMPLETED') {
    meta.badge = 'AWAITING PAYMENT';
    meta.headline = 'Collect payment from your rider';
    meta.subtitle = 'Use UPI or change payment to cash. Confirm cash only after receiving it.';
  } else if (onlinePayment && ride.status === 'SETTLED') {
    meta.subtitle =
      'UPI test payment verified. Driver payout is recorded for review; no money has moved.';
  } else if (ride.paymentCollection === 'RAZORPAY_UPI' && ride.status === 'SETTLED') {
    meta.subtitle = 'UPI payment verified. Your earnings are recorded; bank settlement is pending.';
  }
  const breakdown = computeRideEarningsBreakdown(ride);
  const distanceKm = Number(((ride.routeSnapshot?.distanceM ?? 0) / 1000).toFixed(1));
  const durationMin = Math.max(1, Math.round((ride.routeSnapshot?.durationSeconds ?? 0) / 60));

  const openExternalMaps = (target: 'pickup' | 'drop') => {
    const point = target === 'pickup' ? ride.pickup : ride.drop;
    const label = encodeURIComponent(point.address || (target === 'pickup' ? 'Pickup' : 'Drop'));
    const latLng = `${point.lat},${point.lng}`;
    const url =
      Platform.select({
        ios: `maps:0,0?q=${label}@${latLng}`,
        android: `geo:0,0?q=${latLng}(${label})`,
        default: `https://www.google.com/maps/search/?api=1&query=${latLng}`,
      }) || `https://www.google.com/maps/search/?api=1&query=${latLng}`;
    void Linking.openURL(url);
  };

  const callPassenger = () => {
    if (!ride.passenger?.phoneE164) return;
    void Linking.openURL(`tel:${ride.passenger.phoneE164}`);
  };

  const handleEnRoute = async () => {
    const updated = await markEnRoute(ride.id);
    if (updated) setRide(updated);
  };

  const handleArrived = async () => {
    const updated = await markArrived(ride.id);
    if (updated) setRide(updated);
  };

  const handleStartTrip = async () => {
    const updated = await startTripWithOtp(ride.id, otpInput);
    if (updated) {
      setRide(updated);
      setOtpInput('');
    }
  };

  const handleCompleteTrip = async () => {
    const res = await completeTrip(ride.id);
    if (res) {
      setRide(res.ride);
      setSettlementSummary({
        farePaise: res.farePaise,
        commissionPaise: res.commissionPaise,
        walletBalancePaise: res.walletBalancePaise,
      });
    }
  };

  const handleConfirmCancel = async () => {
    const cancelled = await cancelTrip(ride.id, selectedCancelReason);
    if (cancelled) {
      setRide(cancelled);
      setShowCancelModal(false);
    }
  };

  const isCancellable =
    ride.status === 'DRIVER_ASSIGNED' ||
    ride.status === 'DRIVER_EN_ROUTE' ||
    ride.status === 'DRIVER_ARRIVED';

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.replace('/(driver)/(tabs)/home')}
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
        >
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
          <Text style={styles.backBtnText}>Home</Text>
        </Pressable>

        <View
          style={[
            styles.statusPill,
            meta.tone === 'green'
              ? styles.statusPillGreen
              : meta.tone === 'red'
                ? styles.statusPillRed
                : styles.statusPillAmber,
          ]}
        >
          <Text
            style={[
              styles.statusPillText,
              meta.tone === 'green'
                ? styles.statusTextGreen
                : meta.tone === 'red'
                  ? styles.statusTextRed
                  : styles.statusTextAmber,
            ]}
          >
            {meta.badge}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Error Notice */}
        {rideError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color={colors.error} />
            <Text style={styles.errorBannerText}>{rideError}</Text>
            <Pressable onPress={clearRideError} hitSlop={10}>
              <Text style={styles.errorDismiss}>✕</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Stage Hero Card */}
        <View style={styles.heroCard}>
          {/* 5-Step Lifecycle Progress Bar */}
          {ride.status !== 'CANCELLED' && ride.status !== 'PAYMENT_DISPUTED' ? (
            <View style={styles.stepperRow}>
              {[
                { label: 'Assigned', idx: 0 },
                { label: 'En Route', idx: 1 },
                { label: 'Arrived', idx: 2 },
                { label: 'On Trip', idx: 3 },
                { label: 'Settled', idx: 4 },
              ].map((step) => {
                const currentIdx =
                  ride.status === 'DRIVER_ASSIGNED'
                    ? 0
                    : ride.status === 'DRIVER_EN_ROUTE'
                      ? 1
                      : ride.status === 'DRIVER_ARRIVED'
                        ? 2
                        : ride.status === 'TRIP_STARTED'
                          ? 3
                          : 4;
                const done =
                  step.idx < currentIdx ||
                  ride.status === 'SETTLED' ||
                  ride.status === 'PAYMENT_CONFIRMED';
                const active = step.idx === currentIdx && !done;
                return (
                  <View key={step.label} style={styles.stepperItem}>
                    <View
                      style={[
                        styles.stepperBar,
                        done && styles.stepperBarDone,
                        active && styles.stepperBarActive,
                      ]}
                    />
                    <Text
                      style={[styles.stepperLabel, (done || active) && styles.stepperLabelActive]}
                    >
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          <Text style={styles.heroHeadline}>{meta.headline}</Text>
          <Text style={styles.heroSubtitle}>{meta.subtitle}</Text>

          {/* Passenger & Call Row */}
          <View style={styles.passengerBox}>
            <View style={styles.passengerAvatar}>
              <Ionicons name="person" size={20} color={colors.deepBrown} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.passengerName}>{ride.passenger?.name || 'Passenger'}</Text>
              <Text style={styles.passengerSub}>
                {ride.vehicleCategory} · {distanceKm} km · ~{durationMin} mins
              </Text>
            </View>
            {ride.passenger?.phoneE164 ? (
              <Pressable
                style={styles.callBtn}
                onPress={callPassenger}
                accessibilityRole="button"
                accessibilityLabel="Call passenger"
              >
                <Ionicons name="call" size={18} color={colors.deepBrown} />
                <Text style={styles.callBtnText}>Call</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {ride.status === 'PAYMENT_PENDING' || ride.status === 'TRIP_COMPLETED' ? (
          <RidePaymentQr
            key={ride.id}
            rideId={ride.id}
            amountPaise={breakdown.grossPaise}
            onPaid={loadRide}
            onCashReceived={async () => {
              const result = await confirmDirectPayment(ride.id);
              if (!result)
                throw new Error('Cash confirmation failed. Check payment status before retrying.');
              setRide(result.ride);
            }}
          />
        ) : null}

        {/* Route & Navigation Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Route & Navigation</Text>
            <Pressable
              style={styles.mapsBtn}
              onPress={() =>
                openExternalMaps(
                  ride.status === 'TRIP_STARTED' ||
                    ride.status === 'TRIP_COMPLETED' ||
                    ride.status === 'PAYMENT_PENDING'
                    ? 'drop'
                    : 'pickup',
                )
              }
            >
              <Ionicons name="navigate" size={16} color={colors.deepBrown} />
              <Text style={styles.mapsBtnText}>
                Open{' '}
                {ride.status === 'TRIP_STARTED' ||
                ride.status === 'TRIP_COMPLETED' ||
                ride.status === 'PAYMENT_PENDING'
                  ? 'Drop'
                  : 'Pickup'}{' '}
                in Maps
              </Text>
            </Pressable>
          </View>

          <View style={styles.pointRow}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pointLabel}>PICKUP</Text>
              <Text style={styles.pointAddress}>
                {ride.pickup.address ||
                  `${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}`}
              </Text>
            </View>
          </View>

          <View style={styles.routeConnector} />

          <View style={styles.pointRow}>
            <View style={[styles.dot, { backgroundColor: colors.error }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pointLabel}>DESTINATION</Text>
              <Text style={styles.pointAddress}>
                {ride.drop.address || `${ride.drop.lat.toFixed(4)}, ${ride.drop.lng.toFixed(4)}`}
              </Text>
            </View>
          </View>
        </View>

        {/* Stage-Specific Interactive Controls */}
        {ride.status === 'DRIVER_ARRIVED' ? (
          <View style={styles.otpCard}>
            <Text style={styles.otpTitle}>Enter 4-Digit Pickup OTP</Text>
            <Text style={styles.otpHint}>
              Ask {ride.passenger?.name || 'the passenger'} for the 4-digit code shown on their app.
            </Text>
            <TextInput
              style={styles.otpInput}
              value={otpInput}
              onChangeText={(txt) => setOtpInput(txt.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="• • • •"
              placeholderTextColor="#9CA3AF"
              accessibilityLabel="4-digit pickup OTP"
            />
            <Pressable
              style={[
                styles.primaryCta,
                (otpInput.length !== 4 || isMutatingRide) && styles.disabledBtn,
              ]}
              disabled={otpInput.length !== 4 || isMutatingRide}
              onPress={handleStartTrip}
            >
              {isMutatingRide ? (
                <ActivityIndicator color={colors.deepBrown} />
              ) : (
                <Text style={styles.primaryCtaText}>Verify OTP & Start Trip →</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {/* Fare & Commission Breakdown Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Fare & Earnings Breakdown</Text>
            {ride.suggestedFarePaise > 0 && breakdown.grossPaise !== ride.suggestedFarePaise ? (
              <View style={styles.negotiatedBadge}>
                <Text style={styles.negotiatedBadgeText}>
                  Negotiated (Suggested ₹{(ride.suggestedFarePaise / 100).toFixed(0)})
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Agreed Passenger Fare (Gross)</Text>
            <Text style={styles.breakdownValue}>₹{(breakdown.grossPaise / 100).toFixed(2)}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>
              Platform Commission ({ride.pricingSnapshot?.commissionPercent ?? 8}%)
            </Text>
            <Text style={styles.breakdownDebit}>
              -₹{(breakdown.commissionPaise / 100).toFixed(2)}
            </Text>
          </View>
          <View style={[styles.breakdownRow, styles.breakdownTotalRow]}>
            <Text style={styles.breakdownTotalLabel}>Your Net Trip Earnings</Text>
            <Text style={styles.breakdownTotalValue}>₹{(breakdown.netPaise / 100).toFixed(2)}</Text>
          </View>
          {settlementSummary ? (
            <View style={styles.walletAfterNotice}>
              <Text style={styles.walletAfterText}>
                Updated Wallet Balance: ₹{(settlementSummary.walletBalancePaise / 100).toFixed(2)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Primary Action Buttons for Assigned / En Route / Started / Terminal */}
        {ride.status === 'DRIVER_ASSIGNED' ? (
          <Pressable
            style={[styles.primaryCta, isMutatingRide && styles.disabledBtn]}
            disabled={isMutatingRide}
            onPress={handleEnRoute}
          >
            {isMutatingRide ? (
              <ActivityIndicator color={colors.deepBrown} />
            ) : (
              <Text style={styles.primaryCtaText}>Start Driving to Pickup →</Text>
            )}
          </Pressable>
        ) : null}

        {ride.status === 'DRIVER_EN_ROUTE' ? (
          <Pressable
            style={[styles.primaryCta, isMutatingRide && styles.disabledBtn]}
            disabled={isMutatingRide}
            onPress={handleArrived}
          >
            {isMutatingRide ? (
              <ActivityIndicator color={colors.deepBrown} />
            ) : (
              <Text style={styles.primaryCtaText}>I Have Arrived at Pickup →</Text>
            )}
          </Pressable>
        ) : null}

        {ride.status === 'TRIP_STARTED' ? (
          <Pressable
            style={[styles.primaryCta, isMutatingRide && styles.disabledBtn]}
            disabled={isMutatingRide}
            onPress={handleCompleteTrip}
          >
            {isMutatingRide ? (
              <ActivityIndicator color={colors.deepBrown} />
            ) : (
              <Text style={styles.primaryCtaText}>Complete Trip at Destination →</Text>
            )}
          </Pressable>
        ) : null}

        {ride.status === 'SETTLED' ||
        ride.status === 'PAYMENT_CONFIRMED' ||
        ride.status === 'CANCELLED' ||
        ride.status === 'PAYMENT_DISPUTED' ? (
          <Pressable
            style={styles.primaryCta}
            onPress={() => router.replace('/(driver)/(tabs)/home')}
          >
            <Text style={styles.primaryCtaText}>Return to Home Dashboard →</Text>
          </Pressable>
        ) : null}

        {/* Cancel Ride Button (Only before trip starts) */}
        {isCancellable ? (
          <Pressable
            style={styles.cancelTriggerBtn}
            disabled={isMutatingRide}
            onPress={() => setShowCancelModal(true)}
          >
            <Text style={styles.cancelTriggerText}>Cancel Ride</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {/* Cancellation Reason Modal */}
      <Modal
        visible={showCancelModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCancelModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Cancel Assigned Ride?</Text>
            <Text style={styles.modalSub}>
              Select an honest operational reason. Frequent cancellations after assignment may
              affect dispatch priority.
            </Text>

            <View style={styles.reasonList}>
              {DRIVER_CANCEL_REASONS.map((item) => {
                const selected = selectedCancelReason === item.code;
                return (
                  <Pressable
                    key={item.code}
                    style={[styles.reasonItem, selected && styles.reasonItemSelected]}
                    onPress={() => setSelectedCancelReason(item.code)}
                  >
                    <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                      {selected ? <View style={styles.radioInner} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reasonLabel}>{item.label}</Text>
                      <Text style={styles.reasonDesc}>{item.desc}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalKeepBtn}
                onPress={() => setShowCancelModal(false)}
                disabled={isMutatingRide}
              >
                <Text style={styles.modalKeepText}>Keep Ride</Text>
              </Pressable>

              <Pressable
                style={[styles.modalConfirmCancelBtn, isMutatingRide && styles.disabledBtn]}
                onPress={handleConfirmCancel}
                disabled={isMutatingRide}
              >
                {isMutatingRide ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.modalConfirmCancelText}>Confirm Cancel</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centeredScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: {
    fontSize: typography.sizes.base,
    fontWeight: '600',
    color: colors.secondary,
  },
  emptyTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  emptySub: {
    fontSize: typography.sizes.sm,
    color: colors.secondary,
    textAlign: 'center',
    marginBottom: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingRight: 8,
  },
  backBtnText: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  statusPillAmber: {
    backgroundColor: colors.lightCream,
    borderColor: colors.border,
  },
  statusPillGreen: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  statusPillRed: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusTextAmber: {
    color: colors.brandBrown,
  },
  statusTextGreen: {
    color: '#15803D',
  },
  statusTextRed: {
    color: colors.error,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
    gap: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 14,
    padding: 12,
  },
  errorBannerText: {
    flex: 1,
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: colors.error,
  },
  errorDismiss: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.error,
  },
  heroCard: {
    backgroundColor: colors.cream,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  stepperItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  stepperBar: {
    width: '100%',
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  stepperBarDone: {
    backgroundColor: '#16A34A',
  },
  stepperBarActive: {
    backgroundColor: colors.amber,
  },
  stepperLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.secondary,
  },
  stepperLabelActive: {
    color: colors.deepBrown,
    fontWeight: '800',
  },
  negotiatedBadge: {
    backgroundColor: colors.lightCream,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  negotiatedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.brandBrown,
  },
  heroHeadline: {
    fontSize: typography.sizes.xl,
    fontWeight: '800',
    color: colors.deepBrown,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.secondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  passengerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  passengerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.lightCream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerName: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  passengerSub: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    marginTop: 2,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.amber,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  callBtnText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  mapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.lightCream,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapsBtnText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  routeConnector: {
    width: 2,
    height: 16,
    backgroundColor: colors.warmBeige,
    marginLeft: 4,
    marginVertical: -6,
  },
  pointLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondary,
  },
  pointAddress: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.deepBrown,
    marginTop: 2,
  },
  otpCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1.5,
    borderColor: colors.amber,
    gap: 12,
  },
  otpTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  otpHint: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    lineHeight: 18,
  },
  otpInput: {
    backgroundColor: colors.cream,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    height: 58,
    fontSize: 26,
    fontWeight: '800',
    color: colors.deepBrown,
    textAlign: 'center',
    letterSpacing: 12,
  },
  paymentCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1.5,
    borderColor: colors.amber,
    gap: 14,
  },
  paymentBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paymentCardTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  collectAmountBox: {
    backgroundColor: colors.cream,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  collectLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.brandBrown,
    letterSpacing: 0.5,
  },
  collectValue: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.deepBrown,
    marginVertical: 4,
  },
  collectSub: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: colors.secondary,
    textAlign: 'center',
  },
  methodSectionLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 10,
  },
  methodChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  methodChipSelected: {
    backgroundColor: colors.lightCream,
    borderColor: colors.amber,
    borderWidth: 1.5,
  },
  methodChipText: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.secondary,
  },
  methodChipTextSelected: {
    color: colors.deepBrown,
    fontWeight: '800',
  },
  ackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.amber,
  },
  checkboxMark: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  ackText: {
    flex: 1,
    fontSize: typography.sizes.xs,
    color: colors.deepBrown,
    lineHeight: 18,
    fontWeight: '600',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    fontWeight: '600',
  },
  breakdownValue: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  breakdownDebit: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.brandBrown,
  },
  breakdownTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginTop: 4,
  },
  breakdownTotalLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  breakdownTotalValue: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.success,
  },
  walletAfterNotice: {
    backgroundColor: colors.lightCream,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  walletAfterText: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.deepBrown,
    textAlign: 'center',
  },
  primaryCta: {
    width: '100%',
    backgroundColor: colors.amber,
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryCtaText: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  cancelTriggerBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
  },
  cancelTriggerText: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.error,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    gap: 14,
  },
  modalTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  modalSub: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    lineHeight: 18,
  },
  reasonList: {
    gap: 10,
    marginVertical: 4,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  reasonItemSelected: {
    backgroundColor: colors.cream,
    borderColor: colors.amber,
    borderWidth: 1.5,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioOuterSelected: {
    borderColor: colors.deepBrown,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.deepBrown,
  },
  reasonLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  reasonDesc: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    marginTop: 2,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  modalKeepBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.lightCream,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalKeepText: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  modalConfirmCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmCancelText: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.white,
  },
});
