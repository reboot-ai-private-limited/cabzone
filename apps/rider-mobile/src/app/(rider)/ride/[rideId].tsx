import {
  RIDE_COMMUNICATION_STATUSES,
  tollDisclosure,
  calculateNegotiationBounds,
  type CancellationReason,
  type RideEventDto,
} from '@cabzone/contracts';
import { locationLabel } from '@/services/location-names';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
  Vibration,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/context/auth-context';
import { useRide } from '@/context/ride-context';
import { useRideCall } from '@/context/call-context';
import type { RiderRideViewDto } from '@/services/api';
import {
  extractPendingDriverCounters,
  formatAssignedDriverSummary,
  formatRupeesFromPaise,
  getRideStatusMeta,
  isRideActive,
  resolveRideCashAvailability,
  resolveRiderCancellationPreview,
} from '@/services/rider-helpers';
import { colors, radii, spacing, typography, createStyles } from '@/design-system';
import BookingMap from '@/components/booking/booking-map';
import { OngoingRideView } from '@/components/ride/ongoing-ride-view';
import { RideRatingCard } from '@/components/ride/ride-rating-card';
import { UpiPaymentPanel } from '@/components/ride/upi-payment-panel';

const RIDER_CANCEL_REASONS: { code: CancellationReason; label: string }[] = [
  { code: 'RIDER_CHANGED_MIND', label: 'Changed my travel plans' },
  { code: 'DRIVER_DELAYED', label: 'Driver is taking too long' },
  { code: 'DRIVER_NO_SHOW', label: 'Driver did not arrive at pickup' },
  { code: 'FARE_DISAGREEMENT', label: 'Fare or pickup disagreement' },
];

const STAGE_ORDER = [
  'OFFERING',
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'TRIP_STARTED',
  'PAYMENT_PENDING',
  'SETTLED',
] as const;

export default function ActiveRideScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { startCall } = useRideCall();
  const {
    unreadChatRideId,
    activeRide,
    activeRideEvents,
    isRealtimeConnected,
    syncError,
    driverLiveLocation,
    setBookingDraft,
    refreshRideById,
    respondToCounter,
    raiseFare,
    cancelRide,
    claimCashPaid,
    requestEarlyDrop,
    disputePayment,
  } = useRide();

  const [ride, setRide] = useState<RiderRideViewDto | null>(
    activeRide?.id === rideId ? activeRide : null,
  );
  const [events, setEvents] = useState<RideEventDto[]>(
    activeRide?.id === rideId ? activeRideEvents : [],
  );
  const [isLoading, setIsLoading] = useState(!ride);
  const [actionError, setActionError] = useState<string | null>(null);
  const [respondingDriverId, setRespondingDriverId] = useState<string | null>(null);
  const [isRaisingFare, setIsRaisingFare] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const previousCounterCount = useRef<number | null>(null);
  const checkedExpiry = useRef<string | null>(null);

  const startPrivateCall = (targetRideId: string, driverName?: string) => startCall(targetRideId, driverName);

  // Countdown for OFFERING
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  // Modals
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState<CancellationReason | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const [showSafetyModal, setShowSafetyModal] = useState(false);

  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);
  const [cancelClockNow, setCancelClockNow] = useState(() => Date.now());
  const raisingFareRef = useRef(false);
  const respondingCounterRef = useRef(false);
  const cancellingRef = useRef(false);
  const submittingDisputeRef = useRef(false);

  useEffect(() => {
    if (!showCancelModal) return;
    setTimeout(() => setCancelClockNow(Date.now()), 0);
    const timer = setInterval(() => setCancelClockNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [showCancelModal]);

  const loadRide = useCallback(async () => {
    if (!rideId) return;
    try {
      const res = await refreshRideById(rideId);
      if (res) {
        setRide(res.ride);
        setEvents(res.events);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Unable to load ride details.');
    } finally {
      setIsLoading(false);
    }
  }, [refreshRideById, rideId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadRide();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadRide]);

  // Keep synced with context activeRide when it matches rideId, and reload when activeRide clears on terminal transitions
  useEffect(() => {
    if (activeRide && activeRide.id === rideId) {
      const timer = setTimeout(() => {
        setRide(activeRide);
        setEvents(activeRideEvents);
      }, 0);
      return () => clearTimeout(timer);
    }
    if (!activeRide && ride && ride.id === rideId && isRideActive(ride.status)) {
      const timer = setTimeout(() => {
        void loadRide();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeRide, activeRideEvents, loadRide, ride, rideId]);

  // Offer expiry countdown
  useEffect(() => {
    const updateRemaining = () => {
      if (!ride || ride.status !== 'OFFERING' || !ride.offeringExpiresAt) {
        setRemainingSeconds(null);
        return;
      }
      const diff = Math.max(
        0,
        Math.ceil((new Date(ride.offeringExpiresAt).getTime() - Date.now()) / 1000),
      );
      setRemainingSeconds(diff);
    };
    const initTimer = setTimeout(updateRemaining, 0);
    const timer = setInterval(updateRemaining, 1000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(timer);
    };
  }, [ride]);

  useEffect(() => {
    if (ride?.status !== 'OFFERING' || !ride.offeringExpiresAt || remainingSeconds !== 0) {
      return;
    }
    if (checkedExpiry.current !== ride.offeringExpiresAt) {
      checkedExpiry.current = ride.offeringExpiresAt;
      void loadRide();
    }
    const pollTimer = setInterval(() => {
      void loadRide();
    }, 4000);
    return () => clearInterval(pollTimer);
  }, [ride, remainingSeconds, loadRide]);

  const counters = useMemo(() => extractPendingDriverCounters(events), [events]);

  useEffect(() => {
    if (previousCounterCount.current === 0 && counters.length > 0) {
      Vibration.vibrate(20);
      const first = counters[0];
      if (first)
        AccessibilityInfo.announceForAccessibility(
          `A driver offered ${formatRupeesFromPaise(first.proposedFarePaise)}`,
        );
    }
    previousCounterCount.current = counters.length;
  }, [counters]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadRide();
    } finally {
      setIsRefreshing(false);
    }
  };

  const [isRequestingEarlyDrop, setIsRequestingEarlyDrop] = useState(false);
  const handleRequestEarlyDrop = async () => {
    if (!ride || isRequestingEarlyDrop) return;
    setIsRequestingEarlyDrop(true);
    setActionError(null);
    try {
      const updated = await requestEarlyDrop(ride.id);
      setRide(updated);
      await loadRide();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Unable to request early drop.');
    } finally {
      setIsRequestingEarlyDrop(false);
    }
  };

  const handleRaiseFare = async (nextFarePaise: number) => {
    if (!ride || isRaisingFare || raisingFareRef.current) return;
    raisingFareRef.current = true;
    setIsRaisingFare(true);
    setActionError(null);
    try {
      const updated = await raiseFare(ride.id, nextFarePaise);
      setRide(updated);
      await loadRide();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Unable to raise fare.');
      await loadRide();
    } finally {
      raisingFareRef.current = false;
      setIsRaisingFare(false);
    }
  };

  const handleCounterAction = async (driverId: string, action: 'ACCEPTED' | 'REJECTED') => {
    if (!ride) return;
    if (!ride || respondingCounterRef.current) return;
    respondingCounterRef.current = true;
    setRespondingDriverId(driverId);
    setActionError(null);
    try {
      await respondToCounter(ride.id, driverId, action);
      await loadRide();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not respond to counter-offer.');
    } finally {
      respondingCounterRef.current = false;
      setRespondingDriverId(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!ride || !selectedCancelReason || cancellingRef.current) return;
    cancellingRef.current = true;
    setIsCancelling(true);
    setActionError(null);
    try {
      const updated = await cancelRide(ride.id, selectedCancelReason);
      setRide(updated);
      setShowCancelModal(false);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Unable to cancel ride.');
    } finally {
      cancellingRef.current = false;
      setIsCancelling(false);
    }
  };

  const openCancelSheet = () => {
    setActionError(null);
    setSelectedCancelReason(null);
    setCancelClockNow(Date.now());
    setShowCancelModal(true);
  };

  const handleShareTrip = async () => {
    if (!ride) return;
    try {
      await Share.share({
        message: `Cabzone Trip (${ride.id.slice(0, 8)})\nStatus: ${getRideStatusMeta(ride.status).label}\nFrom: ${locationLabel(ride.pickup.address, 'Pickup location')}\nTo: ${locationLabel(ride.drop.address, 'Destination')}\nFare: ${formatRupeesFromPaise(ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise)}`,
      });
    } catch {
      // ignore share dismissal
    }
  };

  const handleRetry = () => {
    if (!ride) return;
    const mode = ride.zoneSnapshot.classification === 'IN_CITY' ? 'IN_CITY' : 'OUTSTATION';
    setBookingDraft({
      mode,
      vehicleCategory: ride.vehicleCategory,
      preferredFarePaise: ride.proposedFarePaise ?? ride.suggestedFarePaise,
      pickup: {
        ...ride.pickup,
        address: locationLabel(ride.pickup.address, 'Pickup location'),
      },
      drop: { ...ride.drop, address: locationLabel(ride.drop.address, 'Destination') },
    });
    router.replace(mode === 'IN_CITY' ? '/(rider)/(tabs)/home' : '/(rider)/(tabs)/intercity');
  };

  const handleSubmitDispute = async () => {
    if (!ride) return;
    const trimmed = disputeReason.trim();
    if (trimmed.length < 10) {
      setActionError('Please describe the payment issue in at least 10 characters.');
      return;
    }
    if (submittingDisputeRef.current) return;
    submittingDisputeRef.current = true;
    setIsSubmittingDispute(true);
    setActionError(null);
    try {
      const updated = await disputePayment(ride.id, trimmed);
      setRide(updated);
      setShowDisputeModal(false);
      setDisputeReason('');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to submit payment dispute.');
    } finally {
      submittingDisputeRef.current = false;
      setIsSubmittingDispute(false);
    }
  };

  if (isLoading && !ride) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.deepBrown} />
        <Text style={styles.loadingText}>Loading live trip...</Text>
      </SafeAreaView>
    );
  }

  if (!ride) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <Text style={styles.errorTitle}>Ride not found</Text>
        <Pressable
          style={styles.backHomeBtn}
          onPress={() => router.replace('/(rider)/(tabs)/home')}
        >
          <Text style={styles.backHomeBtnText}>Return to Home</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const statusMeta = getRideStatusMeta(ride.status);
  const isSearching = ride.status === 'REQUESTED' || ride.status === 'OFFERING';
  const isOngoing =
    ride.status === 'DRIVER_ASSIGNED' ||
    ride.status === 'DRIVER_EN_ROUTE' ||
    ride.status === 'DRIVER_ARRIVED' ||
    ride.status === 'TRIP_STARTED';
  const { floorPaise, ceilingPaise } = calculateNegotiationBounds({
    suggestedFarePaise: ride.suggestedFarePaise,
    minimumFarePaise: ride.pricingSnapshot.minimumFarePaise,
    floorPercent: ride.pricingSnapshot.negotiationFloorPercent,
    ceilingPercent: ride.pricingSnapshot.negotiationCeilingPercent,
  });
  const offerPaise = ride.proposedFarePaise ?? ride.suggestedFarePaise;
  const nextFarePaise = Math.min(offerPaise + 1000, ceilingPaise);
  const retryStepPaise = Math.min(2000, Math.max(0, ceilingPaise - offerPaise));
  const canRaiseFare =
    ride.status === 'OFFERING' &&
    nextFarePaise > offerPaise &&
    (remainingSeconds === null || remainingSeconds > 0);
  const currentFarePaise =
    ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise;
  const arrearsPaise = ride.arrearsPaise ?? 0;
  const totalPayablePaise = currentFarePaise + arrearsPaise;
  const cashAvailability = resolveRideCashAvailability(ride);
  const cancelPreview = resolveRiderCancellationPreview(ride, cancelClockNow);
  const canCancel =
    ride.status === 'REQUESTED' ||
    ride.status === 'OFFERING' ||
    ride.status === 'DRIVER_ASSIGNED' ||
    ride.status === 'DRIVER_EN_ROUTE' ||
    ride.status === 'DRIVER_ARRIVED';

  const currentStageIndex = STAGE_ORDER.indexOf(ride.status as (typeof STAGE_ORDER)[number]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {isOngoing ? (
        <OngoingRideView
          ride={ride}
          driverLocation={activeRide?.id === ride.id ? driverLiveLocation : null}
          connected={isRealtimeConnected && !syncError}
          error={actionError}
          refreshing={isRefreshing}
          passengerLabel={
            ride.passenger.riderId != null && ride.passenger.riderId === profile?.id
              ? 'For you'
              : `For ${ride.passenger.name}`
          }
          onCallDriver={profile?.id === ride.bookerRiderId ? () => void startPrivateCall(ride.id, ride.assignedDriver?.name) : undefined}
          onBack={() => router.replace('/(rider)/(tabs)/home')}
          onChat={
            profile?.id === ride.bookerRiderId
              ? () => router.push({ pathname: '/(rider)/chat/[rideId]', params: { rideId: ride.id } })
              : undefined
          }
          hasUnreadChat={unreadChatRideId === ride.id}
          onSafety={() => setShowSafetyModal(true)}
          onShare={() => void handleShareTrip()}
          onCancel={openCancelSheet}
          onRefresh={() => void handleRefresh()}
        />
      ) : (
        <>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => router.replace('/(rider)/(tabs)/home')}
            >
              <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
            </Pressable>

            <View style={styles.topBarCenter}>
              {!isRealtimeConnected || syncError ? (
                <View style={styles.connectionPill}>
                  <View style={[styles.connDot, { backgroundColor: colors.brandBrown }]} />
                  <Text style={styles.connectionText}>Reconnecting…</Text>
                </View>
              ) : null}
            </View>

            {!isSearching ? (
              <Pressable
                style={[styles.iconBtn, styles.safetyBtn]}
                onPress={() => setShowSafetyModal(true)}
                accessibilityLabel="Safety options"
              >
                <Ionicons name="shield-checkmark" size={18} color={colors.deepBrown} />
              </Pressable>
            ) : (
              <View style={styles.iconBtnSpacer} />
            )}
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={[styles.content, isSearching && styles.searchingContent]}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />
            }
          >
            {/* Status Hero Card */}
            <View style={styles.statusHeroCard}>
              <View style={styles.statusHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={styles.statusTitle}
                    accessibilityRole="header"
                    accessibilityLiveRegion="polite"
                  >
                    {statusMeta.label}
                  </Text>
                  <Text style={styles.statusSubtitle}>
                    {isSearching && remainingSeconds === 0
                      ? 'Checking the final responses…'
                      : statusMeta.subtitle}
                  </Text>
                </View>
                {ride.status === 'OFFERING' && remainingSeconds !== null ? (
                  <View
                    style={styles.timerBadge}
                    accessibilityLabel={`Search expires in ${remainingSeconds} seconds`}
                  >
                    <Ionicons name="timer-outline" size={16} color={colors.deepBrown} />
                    <Text style={styles.timerBadgeText}>Searching · {remainingSeconds}s</Text>
                  </View>
                ) : null}
              </View>

              {isSearching &&
              ride.offeringExpiresAt &&
              remainingSeconds !== null &&
              Math.ceil(
                (new Date(ride.offeringExpiresAt).getTime() - new Date(ride.createdAt).getTime()) /
                  1000,
              ) -
                remainingSeconds >=
                30 &&
              counters.length === 0 ? (
                <Text style={styles.statusSubtitle}>No takers yet. Raise your offer?</Text>
              ) : null}

              {/* 7-Stage Progress Bar */}
              {currentStageIndex > 0 ? (
                <View
                  style={styles.progressTrack}
                  accessibilityLabel={`${statusMeta.label}, step ${currentStageIndex + 1} of 7`}
                >
                  {STAGE_ORDER.map((st, idx) => (
                    <View
                      key={st}
                      style={[
                        styles.progressSegment,
                        idx <= currentStageIndex && styles.progressSegmentActive,
                      ]}
                    />
                  ))}
                </View>
              ) : null}
            </View>

            {isSearching ? (
              <View
                style={styles.searchMap}
                pointerEvents="none"
                accessibilityLabel="Map showing pickup and destination"
              >
                <BookingMap
                  pickup={{
                    ...ride.pickup,
                    address: locationLabel(ride.pickup.address, 'Pickup location'),
                  }}
                  drop={{ ...ride.drop, address: locationLabel(ride.drop.address, 'Destination') }}
                  bottomInset={0}
                  onEditPickup={() => {}}
                />
              </View>
            ) : null}

            {/* LIVE DRIVER COUNTER-OFFERS SECTION (when in OFFERING state) */}
            {isSearching ? (
              <View style={styles.countersSection}>
                {counters.length === 0 ? (
                  <View style={styles.waitingCountersBox}>
                    <ActivityIndicator size="small" color={colors.brandBrown} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.waitingCountersTitle}>Offers will appear here</Text>
                      <Text style={styles.waitingCountersSub}>
                        We’ll let you know when a driver responds.
                      </Text>
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={styles.sectionTitle}>Driver offers</Text>
                    {counters.map((counter) => (
                      <View key={counter.driverId} style={styles.counterCard}>
                        <View style={styles.counterTopRow}>
                          <View style={styles.driverAvatarBadge}>
                            <Ionicons name="person" size={20} color={colors.deepBrown} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.counterDriverName}>Verified Cabzone Driver</Text>
                            <Text style={styles.counterDriverSub}>
                              {counter.vehicleLabel ||
                                `Driver #${counter.driverId.slice(0, 6).toUpperCase()} · Cab (4 Seats)`}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.counterFareLabel}>COUNTER FARE</Text>
                            <Text style={styles.counterFareValue}>
                              {formatRupeesFromPaise(counter.proposedFarePaise)}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.counterActionsRow}>
                          <Pressable
                            style={styles.declineCounterBtn}
                            onPress={() => void handleCounterAction(counter.driverId, 'REJECTED')}
                            disabled={respondingDriverId !== null || remainingSeconds === 0}
                          >
                            <Text style={styles.declineCounterText}>Decline</Text>
                          </Pressable>

                          <Pressable
                            style={styles.acceptCounterBtn}
                            onPress={() => void handleCounterAction(counter.driverId, 'ACCEPTED')}
                            disabled={respondingDriverId !== null || remainingSeconds === 0}
                          >
                            {respondingDriverId === counter.driverId ? (
                              <ActivityIndicator size="small" color={colors.deepBrown} />
                            ) : (
                              <Text style={styles.acceptCounterText}>
                                Accept {formatRupeesFromPaise(counter.proposedFarePaise)}
                              </Text>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </>
                )}
              </View>
            ) : null}

            {/* Assigned Driver & Live Telemetry Card */}
            {ride.driverId ? (
              <View style={styles.driverCard}>
                <View style={styles.driverRow}>
                  <View style={styles.driverAvatarLarge}>
                    <Ionicons name="car-sport" size={26} color={colors.deepBrown} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.driverCardTitle}>
                      {`${formatAssignedDriverSummary(ride).driverName} · ★ ${formatAssignedDriverSummary(ride).ratingLabel}`}
                    </Text>
                    <Text style={styles.driverCardSub}>
                      {formatAssignedDriverSummary(ride).vehicleLabel}
                      {formatAssignedDriverSummary(ride).registrationNumber
                        ? ` · ${formatAssignedDriverSummary(ride).registrationNumber}`
                        : ''}
                    </Text>
                    {driverLiveLocation ? (
                      <Text style={styles.liveGpsText}>Driver location is live</Text>
                    ) : null}
                  </View>
                  {RIDE_COMMUNICATION_STATUSES.includes(ride.status) && profile?.id === ride.bookerRiderId ? (
                    <Pressable
                      style={styles.verifiedPill}
                      onPress={() => void startPrivateCall(ride.id, ride.assignedDriver?.name)}
                      accessibilityRole="button"
                      accessibilityLabel="Call driver"
                    >
                      <Ionicons name="call" size={14} color={colors.deepBrown} />
                      <Text style={styles.verifiedPillText}>Call Driver</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.verifiedPill}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                      <Text style={styles.verifiedPillText}>KYC Verified</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : null}

            <Text style={{ fontSize: 12, color: colors.secondary, paddingVertical: 8 }}>
              {tollDisclosure(ride.tollSnapshot, ride.extensionProposal?.status === 'ACCEPTED')}
            </Text>
            {/* PAYMENT PENDING INSTRUCTION CARD (D-040) */}
            {ride.status === 'PAYMENT_PENDING' ||
            ride.status === 'TRIP_COMPLETED' ||
            ride.status === 'PAYMENT_CASH_CLAIMED' ||
            ride.status === 'PAYMENT_UNPAID' ? (
              <UpiPaymentPanel
                rideId={ride.id}
                amountPaise={totalPayablePaise}
                farePaise={currentFarePaise}
                arrearsPaise={arrearsPaise}
                cashAllowed={cashAvailability.cashAllowed}
                cashBlockedReason={cashAvailability.reason}
                rideStatus={ride.status}
                onPaid={loadRide}
                onClaimCashPaid={async () => {
                  const updated = await claimCashPaid(ride.id);
                  setRide(updated);
                  await loadRide();
                }}
                onDisputeUnpaid={() => setShowDisputeModal(true)}
              />
            ) : null}

            {ride.status === 'TRIP_STARTED' ? (
              <View style={styles.earlyDropCard}>
                <Text style={styles.earlyDropTitle}>Need to get off before the destination?</Text>
                <Text style={styles.earlyDropBody}>
                  {ride.earlyDropRequestedAt
                    ? 'Waiting for your driver to confirm. The full agreed fare still applies.'
                    : 'Your driver has to confirm before the trip ends. The full agreed fare still applies.'}
                </Text>
                <Pressable
                  style={[
                    styles.earlyDropBtn,
                    (isRequestingEarlyDrop || !!ride.earlyDropRequestedAt) && styles.earlyDropBtnDisabled,
                  ]}
                  disabled={isRequestingEarlyDrop || !!ride.earlyDropRequestedAt}
                  accessibilityRole="button"
                  onPress={() => void handleRequestEarlyDrop()}
                >
                  {isRequestingEarlyDrop ? (
                    <ActivityIndicator color={colors.deepBrown} />
                  ) : (
                    <Text style={styles.earlyDropBtnText}>
                      {ride.earlyDropRequestedAt ? 'Request sent' : 'Request early drop'}
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            {/* SETTLED RECEIPT & DISPUTE OPTION (D-041) */}
            {ride.status === 'SETTLED' ||
            ride.status === 'PAYMENT_CONFIRMED' ||
            ride.status === 'PAYMENT_DISPUTED' ? (
              <View style={styles.settledCard}>
                <View style={styles.settledRow}>
                  <Ionicons
                    name={
                      ride.status === 'PAYMENT_DISPUTED' ? 'alert-circle' : 'checkmark-done-circle'
                    }
                    size={26}
                    color={ride.status === 'PAYMENT_DISPUTED' ? colors.error : colors.success}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settledTitle}>
                      {ride.status === 'PAYMENT_DISPUTED'
                        ? 'Payment Dispute Under Admin Review'
                        : `Paid ${formatRupeesFromPaise(totalPayablePaise)} · Settled`}
                    </Text>
                    <Text style={styles.settledSub}>
                      {ride.status === 'PAYMENT_DISPUTED'
                        ? 'Cabzone Support is reviewing your dispute ticket.'
                        : events.some(
                              (event) =>
                                event.eventType === 'PAYMENT_CONFIRMED' &&
                                event.metadata.provider === 'RAZORPAY',
                            )
                          ? 'UPI test payment confirmed by Cabzone.'
                          : 'Payment confirmed by your driver.'}
                    </Text>
                  </View>
                </View>

                <View style={styles.settledActionsRow}>
                  <Pressable
                    style={styles.receiptBtn}
                    onPress={() => router.push(`/(rider)/history/${ride.id}`)}
                  >
                    <Ionicons name="receipt-outline" size={16} color={colors.deepBrown} />
                    <Text style={styles.receiptBtnText}>Full Receipt</Text>
                  </Pressable>

                  {ride.status !== 'PAYMENT_DISPUTED' ? (
                    <Pressable style={styles.disputeBtn} onPress={() => setShowDisputeModal(true)}>
                      <Ionicons name="flag-outline" size={16} color={colors.error} />
                      <Text style={styles.disputeBtnText}>Report Payment Issue</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            {ride.status === 'SETTLED' ? (
              <RideRatingCard
                rideId={ride.id}
                driverName={formatAssignedDriverSummary(ride).driverName}
              />
            ) : null}

            {/* Route & Fare Breakdown Card */}
            <View style={styles.detailsCard}>
              <Text style={styles.sectionMiniLabel}>YOUR ROUTE</Text>

              <View style={styles.routeStopRow}>
                <View style={[styles.stopDot, { backgroundColor: colors.success }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopLabel}>PICKUP</Text>
                  <Text style={styles.stopAddress}>
                    {locationLabel(ride.pickup.address, 'Pickup location')}
                  </Text>
                </View>
              </View>

              <View style={styles.routeStopRow}>
                <View style={[styles.stopDot, { backgroundColor: colors.brandBrown }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopLabel}>DROP-OFF</Text>
                  <Text style={styles.stopAddress}>
                    {locationLabel(ride.drop.address, 'Destination')}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.kvRow}>
                <Text style={styles.kvKey}>Passenger</Text>
                <Text style={[styles.kvVal, styles.kvValFlexible]}>
                  {ride.passenger.riderId != null && ride.passenger.riderId === profile?.id
                    ? 'You'
                    : ride.passenger.name}
                </Text>
              </View>

              <View style={styles.kvRow}>
                <Text style={styles.kvKey}>Distance & Zone</Text>
                <Text style={styles.kvVal}>
                  {(ride.routeSnapshot.distanceM / 1000).toFixed(1)} km ·{' '}
                  {ride.zoneSnapshot.classification === 'IN_CITY'
                    ? 'In-city'
                    : ride.zoneSnapshot.classification === 'OUTSTATION'
                      ? 'Outstation'
                      : 'Interstate'}
                </Text>
              </View>

              {ride.suggestedFarePaise !== offerPaise ? (
                <View style={styles.kvRow}>
                  <Text style={styles.kvKey}>Suggested fare</Text>
                  <Text style={styles.kvVal}>{formatRupeesFromPaise(ride.suggestedFarePaise)}</Text>
                </View>
              ) : null}

              <View style={styles.kvRow}>
                <Text style={styles.kvKey}>
                  {ride.agreedFarePaise
                    ? 'Agreed fare'
                    : ride.suggestedFarePaise === offerPaise
                      ? 'Your offer (suggested fare)'
                      : 'Your offer'}
                </Text>
                <Text style={[styles.kvVal, { fontSize: 18, fontWeight: '800' }]}>
                  {formatRupeesFromPaise(currentFarePaise)}
                </Text>
              </View>
              {arrearsPaise > 0 ? (
                <>
                  <View style={styles.kvRow}>
                    <Text style={styles.kvKey}>Previous cancellation fee</Text>
                    <Text style={styles.kvVal}>{formatRupeesFromPaise(arrearsPaise)}</Text>
                  </View>
                  <View style={styles.kvRow}>
                    <Text style={styles.kvKey}>Total payable</Text>
                    <Text style={[styles.kvVal, { fontSize: 18, fontWeight: '800' }]}>
                      {formatRupeesFromPaise(totalPayablePaise)}
                    </Text>
                  </View>
                </>
              ) : null}
              {isSearching ? (
                <Text style={styles.fareRange}>
                  You can offer {formatRupeesFromPaise(floorPaise)}–
                  {formatRupeesFromPaise(ceilingPaise)}
                </Text>
              ) : null}
              <Text style={styles.paymentReminder}>
                {cashAvailability.cashAllowed
                  ? 'Pay by UPI in Cabzone or cash to your driver after your trip.'
                  : 'UPI payment required in Cabzone after your trip while cancellation arrears are due.'}
              </Text>
              <Text style={styles.rideRefText}>Ride #{ride.id.slice(0, 8).toUpperCase()}</Text>
            </View>

            {actionError ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={styles.errorText}>{actionError}</Text>
              </View>
            ) : null}

            {/* Cancel or Book Another Action */}
            {!isSearching && canCancel ? (
              <Pressable style={styles.cancelRideBtn} onPress={openCancelSheet}>
                <Ionicons name="close-circle-outline" size={18} color={colors.error} />
                <Text style={styles.cancelRideBtnText}>Cancel Ride Request</Text>
              </Pressable>
            ) : !isRideActive(ride.status) ? (
              <Pressable
                style={styles.bookAnotherBtn}
                onPress={
                  ride.status === 'EXPIRED'
                    ? handleRetry
                    : () => router.replace('/(rider)/(tabs)/home')
                }
              >
                <Text style={styles.bookAnotherBtnText}>
                  {ride.status === 'EXPIRED'
                    ? retryStepPaise > 0
                      ? `Retry at +${formatRupeesFromPaise(retryStepPaise)}`
                      : 'Retry booking'
                    : 'Book Another Ride'}
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>

          {isSearching ? (
            <View style={styles.searchActions}>
              <Pressable
                style={[
                  styles.raiseFareBtn,
                  (!canRaiseFare || isRaisingFare) && styles.raiseFareBtnDisabled,
                ]}
                onPress={() => void handleRaiseFare(nextFarePaise)}
                disabled={!canRaiseFare || isRaisingFare}
                accessibilityLabel={
                  ride.status === 'REQUESTED'
                    ? 'Waiting for search'
                    : remainingSeconds === 0
                      ? 'Search window closed'
                      : canRaiseFare
                        ? `Raise fare by ${formatRupeesFromPaise(nextFarePaise - offerPaise)}`
                        : 'Maximum fare reached'
                }
              >
                {isRaisingFare ? (
                  <ActivityIndicator color={colors.deepBrown} />
                ) : (
                  <Text style={styles.raiseFareText}>
                    {ride.status === 'REQUESTED'
                      ? 'Waiting for search…'
                      : remainingSeconds === 0
                        ? 'Checking search…'
                        : canRaiseFare
                          ? `Raise fare +${formatRupeesFromPaise(nextFarePaise - offerPaise)}`
                          : 'Maximum fare reached'}
                  </Text>
                )}
              </Pressable>
              <Pressable style={styles.cancelQuietBtn} onPress={openCancelSheet}>
                <Text style={styles.cancelQuietText}>Cancel request</Text>
              </Pressable>
              <Text style={styles.cancelNote}>Free to cancel while searching</Text>
            </View>
          ) : null}
        </>
      )}

      {/* Cancel Ride Modal */}
      <Modal
        visible={showCancelModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCancelModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: spacing.lg + insets.bottom }]}>
            <Text style={styles.modalTitle} accessibilityRole="header">
              Why are you cancelling?
            </Text>
            <View
              style={[
                styles.waitingCountersBox,
                cancelPreview.feePaise > 0 && {
                  backgroundColor: colors.warningBg,
                  borderColor: colors.brandBrown,
                },
              ]}
              accessibilityLiveRegion="polite"
            >
              <Ionicons
                name={cancelPreview.feePaise > 0 ? 'warning-outline' : 'checkmark-circle-outline'}
                size={20}
                color={cancelPreview.feePaise > 0 ? colors.brandBrown : colors.success}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.waitingCountersTitle}>
                  {cancelPreview.isFree
                    ? 'Free cancellation'
                    : `${formatRupeesFromPaise(cancelPreview.feePaise)} cancellation fee`}
                </Text>
                <Text style={styles.waitingCountersSub}>{cancelPreview.summaryText}</Text>
              </View>
            </View>
            {isSearching ? null : null}
            {RIDER_CANCEL_REASONS.map((r) => (
              <Pressable
                key={r.code}
                style={[
                  styles.reasonRow,
                  selectedCancelReason === r.code && styles.reasonRowActive,
                ]}
                onPress={() => setSelectedCancelReason(r.code)}
                accessibilityRole="radio"
                accessibilityLabel={r.label}
                accessibilityState={{ selected: selectedCancelReason === r.code }}
              >
                <Ionicons
                  name={selectedCancelReason === r.code ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={colors.deepBrown}
                />
                <Text style={styles.reasonLabel}>{r.label}</Text>
              </Pressable>
            ))}

            {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

            <View style={styles.modalActionsRow}>
              <Pressable style={styles.keepRideBtn} onPress={() => setShowCancelModal(false)}>
                <Text style={styles.keepRideBtnText}>Keep Ride</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmCancelBtn,
                  !selectedCancelReason && styles.raiseFareBtnDisabled,
                ]}
                onPress={() => void handleConfirmCancel()}
                disabled={isCancelling || !selectedCancelReason}
              >
                {isCancelling ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.confirmCancelBtnText}>Confirm Cancel</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Safety & Share Trip Modal */}
      <Modal
        visible={showSafetyModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSafetyModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: spacing.lg + insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cabzone Safety Toolkit</Text>
              <Pressable onPress={() => setShowSafetyModal(false)}>
                <Ionicons name="close-circle" size={26} color={colors.secondary} />
              </Pressable>
            </View>

            <Pressable style={styles.safetyActionCard} onPress={() => void handleShareTrip()}>
              <Ionicons name="share-social-outline" size={22} color={colors.deepBrown} />
              <View style={{ flex: 1 }}>
                <Text style={styles.safetyActionTitle}>Share Live Trip Status</Text>
                <Text style={styles.safetyActionSub}>
                  Send ride ID, route, and status to family or friends
                </Text>
              </View>
            </Pressable>

            {profile?.emergencyContact ? (
              <Pressable
                style={styles.safetyActionCard}
                onPress={() => void Linking.openURL(`tel:${profile.emergencyContact!.phoneE164}`)}
              >
                <Ionicons name="call-outline" size={22} color={colors.brandBrown} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.safetyActionTitle}>
                    Call Emergency Contact ({profile.emergencyContact.name})
                  </Text>
                  <Text style={styles.safetyActionSub}>{profile.emergencyContact.phoneE164}</Text>
                </View>
              </Pressable>
            ) : (
              <Pressable
                style={styles.safetyActionCard}
                onPress={() => {
                  setShowSafetyModal(false);
                  router.push('/(rider)/account/emergency-contact');
                }}
              >
                <Ionicons name="person-add-outline" size={22} color={colors.brandBrown} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.safetyActionTitle}>Add Emergency Contact</Text>
                  <Text style={styles.safetyActionSub}>
                    Save a trusted contact for quick access during rides
                  </Text>
                </View>
              </Pressable>
            )}

            <Pressable
              style={[styles.safetyActionCard, { backgroundColor: colors.errorBg }]}
              onPress={() => void Linking.openURL('tel:112')}
            >
              <Ionicons name="warning-outline" size={22} color={colors.error} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.safetyActionTitle, { color: colors.error }]}>
                  Dial 112 Emergency Helpline
                </Text>
                <Text style={styles.safetyActionSub}>National emergency response number</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Payment Dispute Modal */}
      <Modal
        visible={showDisputeModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDisputeModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: spacing.lg + insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report Payment Issue</Text>
              <Pressable onPress={() => setShowDisputeModal(false)}>
                <Ionicons name="close-circle" size={26} color={colors.secondary} />
              </Pressable>
            </View>
            <Text style={styles.modalSubText}>
              Describe what went wrong with the payment (minimum 10 characters). Cabzone Support
              will review the ride ledger.
            </Text>
            <TextInput
              style={styles.disputeInput}
              placeholder="e.g. Driver marked payment confirmed before I paid, or charged extra above agreed fare..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              value={disputeReason}
              onChangeText={setDisputeReason}
            />
            <Pressable
              style={styles.bookAnotherBtn}
              onPress={() => void handleSubmitDispute()}
              disabled={isSubmittingDispute}
            >
              {isSubmittingDispute ? (
                <ActivityIndicator color={colors.deepBrown} />
              ) : (
                <Text style={styles.bookAnotherBtnText}>Submit Dispute Ticket</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = createStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.secondary,
  },
  errorTitle: {
    ...typography.h1,
    color: colors.deepBrown,
  },
  backHomeBtn: {
    backgroundColor: colors.amber,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
  },
  backHomeBtnText: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyBtn: {
    backgroundColor: colors.warmBeige,
  },
  iconBtnSpacer: { width: 40 },
  topBarCenter: {
    alignItems: 'center',
  },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.cream,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectionText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  scrollArea: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: 40,
    gap: spacing.md,
  },
  searchingContent: { paddingBottom: spacing.lg },
  statusHeroCard: {
    backgroundColor: colors.cream,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.md,
  },
  searchMap: {
    height: 176,
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rideRefText: {
    ...typography.label,
    color: colors.brandBrown,
  },
  statusTitle: {
    ...typography.h1,
    color: colors.deepBrown,
    marginTop: 2,
  },
  statusSubtitle: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: 4,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.amber,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.deepBrown,
  },
  timerBadgeText: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  progressTrack: {
    flexDirection: 'row',
    gap: 4,
  },
  progressSegment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  progressSegmentActive: {
    backgroundColor: colors.deepBrown,
  },
  countersSection: {
    gap: spacing.sm,
  },
  countersHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  refreshLink: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.brandBrown,
  },
  waitingCountersBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  waitingCountersTitle: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  waitingCountersSub: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 2,
  },
  counterCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    gap: spacing.md,
  },
  counterTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  driverAvatarBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterDriverName: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  counterDriverSub: {
    fontSize: 12,
    color: colors.secondary,
  },
  counterFareLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.brandBrown,
  },
  counterFareValue: {
    ...typography.h1,
    color: colors.deepBrown,
  },
  counterActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  declineCounterBtn: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  declineCounterText: {
    ...typography.bodyBold,
    color: colors.secondary,
  },
  acceptCounterBtn: {
    flex: 2,
    backgroundColor: colors.amber,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
  },
  acceptCounterText: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  driverCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  driverAvatarLarge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.amber,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverCardTitle: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  driverCardSub: {
    fontSize: 12,
    color: colors.secondary,
  },
  liveGpsText: {
    fontSize: 11,
    color: colors.success,
    fontWeight: '700',
    marginTop: 2,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  verifiedPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
  },
  paymentPendingCard: {
    backgroundColor: colors.warningBg,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.brandBrown,
    gap: spacing.md,
  },
  paymentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  paymentPendingTitle: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  paymentPendingSub: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: 2,
  },
  refreshPaymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.white,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refreshPaymentBtnText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  earlyDropCard: {
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.amber,
    gap: spacing.sm,
  },
  earlyDropTitle: { fontSize: 16, fontWeight: '800', color: colors.deepBrown },
  earlyDropBody: { fontSize: 14, color: colors.deepBrown },
  earlyDropBtn: {
    height: 46,
    borderRadius: radii.lg,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earlyDropBtnDisabled: { opacity: 0.5 },
  earlyDropBtnText: { fontSize: 15, fontWeight: '800', color: colors.deepBrown },
  settledCard: {
    backgroundColor: colors.successBg,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.success,
    gap: spacing.md,
  },
  settledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settledTitle: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  settledSub: {
    fontSize: 12,
    color: colors.secondary,
  },
  settledActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  receiptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.white,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  receiptBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  disputeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.errorBg,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  disputeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.error,
  },
  detailsCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  sectionMiniLabel: {
    ...typography.label,
    color: colors.secondary,
  },
  routeStopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  stopDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  stopLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.secondary,
  },
  stopAddress: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: 4,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kvKey: {
    ...typography.caption,
    color: colors.secondary,
  },
  kvVal: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  kvValFlexible: { flexShrink: 1, textAlign: 'right', marginLeft: spacing.sm },
  fareRange: { ...typography.caption, color: colors.secondary },
  paymentReminder: { ...typography.caption, color: colors.deepBrown },
  searchActions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  raiseFareBtn: {
    backgroundColor: colors.amber,
    borderRadius: radii.lg,
    paddingVertical: 15,
    alignItems: 'center',
  },
  raiseFareBtnDisabled: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  raiseFareText: { ...typography.bodyBold, color: colors.deepBrown },
  cancelQuietBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelQuietText: { ...typography.bodyBold, color: colors.deepBrown },
  cancelNote: { ...typography.caption, color: colors.secondary, textAlign: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    padding: spacing.sm,
    borderRadius: radii.md,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.error,
    fontWeight: '600',
  },
  cancelRideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.errorBg,
    paddingVertical: 14,
    borderRadius: radii.lg,
  },
  cancelRideBtnText: {
    ...typography.bodyBold,
    color: colors.error,
  },
  bookAnotherBtn: {
    backgroundColor: colors.amber,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    paddingVertical: 15,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  bookAnotherBtnText: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(58, 36, 20, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  modalSubText: {
    ...typography.caption,
    color: colors.secondary,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  reasonRowActive: {
    backgroundColor: colors.cream,
    borderColor: colors.deepBrown,
  },
  reasonLabel: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 4,
  },
  keepRideBtn: {
    flex: 1,
    backgroundColor: colors.cream,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  keepRideBtnText: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  confirmCancelBtn: {
    flex: 1,
    backgroundColor: colors.error,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  confirmCancelBtnText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  safetyActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.cream,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  safetyActionTitle: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  safetyActionSub: {
    fontSize: 12,
    color: colors.secondary,
  },
  disputeInput: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 96,
    textAlignVertical: 'top',
    fontSize: 14,
    color: colors.deepBrown,
  },
}));
