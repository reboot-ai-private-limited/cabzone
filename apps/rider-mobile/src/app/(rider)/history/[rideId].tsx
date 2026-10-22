import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import type { RideEventDto } from '@cabzone/contracts';
import { useRide } from '@/context/ride-context';
import type { RiderRideViewDto } from '@/services/api';
import { formatRupeesFromPaise, getRideStatusMeta } from '@/services/rider-helpers';
import { colors, radii, spacing, typography } from '@/design-system';

export default function RideReceiptDetailScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const router = useRouter();
  const { refreshRideById, disputePayment, setBookingDraft } = useRide();

  const [ride, setRide] = useState<RiderRideViewDto | null>(null);
  const [events, setEvents] = useState<RideEventDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [disputeText, setDisputeText] = useState('');
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!rideId) return;
    setIsLoading(true);
    try {
      const res = await refreshRideById(rideId);
      if (res) {
        setRide(res.ride);
        setEvents(res.events);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load receipt.');
    } finally {
      setIsLoading(false);
    }
  }, [refreshRideById, rideId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadDetail();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadDetail]);

  const handleDispute = async () => {
    if (!ride) return;
    if (disputeText.trim().length < 10) {
      setError('Please enter at least 10 characters explaining the payment issue.');
      return;
    }
    setIsSubmittingDispute(true);
    setError(null);
    try {
      const updated = await disputePayment(ride.id, disputeText.trim());
      setRide(updated);
      setDisputeText('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not file payment dispute.');
    } finally {
      setIsSubmittingDispute(false);
    }
  };

  const handleBookRoute = (reverse: boolean) => {
    if (!ride) return;
    const mode =
      ride.zoneSnapshot?.classification === 'OUTSTATION' ||
      ride.zoneSnapshot?.classification === 'INTERSTATE'
        ? 'OUTSTATION'
        : 'IN_CITY';

    const pickupLoc = {
      lat: ride.pickup.lat,
      lng: ride.pickup.lng,
      address:
        ride.pickup.address ||
        `Pin (${ride.pickup.lat.toFixed(3)}, ${ride.pickup.lng.toFixed(3)})`,
    };
    const dropLoc = {
      lat: ride.drop.lat,
      lng: ride.drop.lng,
      address:
        ride.drop.address ||
        `Pin (${ride.drop.lat.toFixed(3)}, ${ride.drop.lng.toFixed(3)})`,
    };

    setBookingDraft({
      mode,
      pickup: reverse ? dropLoc : pickupLoc,
      drop: reverse ? pickupLoc : dropLoc,
    });
    router.push(mode === 'OUTSTATION' ? '/(rider)/(tabs)/intercity' : '/(rider)/(tabs)/home');
  };

  if (isLoading && !ride) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.deepBrown} />
      </SafeAreaView>
    );
  }

  if (!ride) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <Text style={styles.title}>Receipt unavailable</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const snap = ride.pricingSnapshot;
  const finalFare =
    ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
        </Pressable>
        <Text style={styles.topBarTitle}>Trip Receipt & Timeline</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Receipt Header */}
        <View style={styles.receiptBanner}>
          <Text style={styles.receiptRef}>RECEIPT #{ride.id.slice(0, 8).toUpperCase()}</Text>
          <Text style={styles.receiptTotal}>{formatRupeesFromPaise(finalFare)}</Text>
          <Text style={styles.receiptStatus}>{getRideStatusMeta(ride.status).label}</Text>
          <Text style={styles.receiptDate}>
            {new Date(ride.createdAt).toLocaleString('en-IN')}
          </Text>
        </View>

        {/* Itemized Financial Breakdown */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>FARE BREAKDOWN (FROZEN SNAPSHOT)</Text>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Base Fare ({snap.vehicleCategory})</Text>
            <Text style={styles.kvVal}>{formatRupeesFromPaise(snap.baseFarePaise)}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>
              Rate per km ({(ride.routeSnapshot.distanceM / 1000).toFixed(1)} km)
            </Text>
            <Text style={styles.kvVal}>
              {formatRupeesFromPaise(snap.ratePerKmPaise)}/km
            </Text>
          </View>
          {snap.bufferSurchargePaise > 0 ? (
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Buffer Surcharge</Text>
              <Text style={styles.kvVal}>
                {formatRupeesFromPaise(snap.bufferSurchargePaise)}
              </Text>
            </View>
          ) : null}
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Cabzone Suggested Fare</Text>
            <Text style={styles.kvVal}>
              {formatRupeesFromPaise(ride.suggestedFarePaise)}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.kvRow}>
            <Text style={[styles.kvKey, { fontWeight: '700', color: colors.deepBrown }]}>
              Final Agreed / Proposed Fare
            </Text>
            <Text style={[styles.kvVal, { fontSize: 18 }]}>
              {formatRupeesFromPaise(finalFare)}
            </Text>
          </View>
        </View>

        {/* Repeat / Return Route Buttons */}
        <View style={styles.quickRouteRow}>
          <Pressable
            style={styles.repeatBtn}
            onPress={() => handleBookRoute(false)}
          >
            <Ionicons name="repeat" size={18} color={colors.deepBrown} />
            <Text style={styles.repeatBtnText}>Repeat This Route</Text>
          </Pressable>

          <Pressable
            style={[styles.repeatBtn, styles.returnBtn]}
            onPress={() => handleBookRoute(true)}
          >
            <Ionicons name="swap-horizontal" size={18} color={colors.deepBrown} />
            <Text style={styles.repeatBtnText}>Book Return Trip</Text>
          </Pressable>
        </View>

        {/* Audit Event Timeline */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>AUDIT TIMELINE ({events.length} EVENTS)</Text>
          {events.map((ev) => (
            <View key={ev.id} style={styles.eventRow}>
              <View style={styles.eventDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.eventType}>{ev.eventType}</Text>
                <Text style={styles.eventMeta}>
                  {ev.actorType} · {new Date(ev.createdAt).toLocaleTimeString('en-IN')}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Payment Dispute Box (for SETTLED / PAYMENT_CONFIRMED rides) */}
        {ride.status === 'SETTLED' || ride.status === 'PAYMENT_CONFIRMED' ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>PAYMENT ISSUE OR OVERCHARGE?</Text>
            <Text style={styles.disputeDesc}>
              If there was a discrepancy with your Cash or direct UPI payment, file a dispute below for Cabzone Admin review.
            </Text>
            <TextInput
              style={styles.disputeInput}
              placeholder="Describe the payment issue (min 10 chars)..."
              placeholderTextColor={colors.muted}
              multiline
              value={disputeText}
              onChangeText={setDisputeText}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Pressable
              style={styles.disputeSubmitBtn}
              onPress={() => void handleDispute()}
              disabled={isSubmittingDispute}
            >
              {isSubmittingDispute ? (
                <ActivityIndicator color={colors.error} />
              ) : (
                <Text style={styles.disputeSubmitText}>File Payment Dispute</Text>
              )}
            </Pressable>
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
  loadingScreen: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  title: {
    ...typography.h1,
    color: colors.deepBrown,
  },
  backBtn: {
    backgroundColor: colors.amber,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  backBtnText: {
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
  topBarTitle: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 40,
    gap: spacing.md,
  },
  receiptBanner: {
    backgroundColor: colors.cream,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 4,
  },
  receiptRef: {
    ...typography.label,
    color: colors.brandBrown,
  },
  receiptTotal: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  receiptStatus: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  receiptDate: {
    fontSize: 12,
    color: colors.secondary,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.brandBrown,
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
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: 4,
  },
  quickRouteRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  repeatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.cream,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    paddingVertical: 13,
    borderRadius: radii.lg,
  },
  returnBtn: {
    backgroundColor: colors.amber,
  },
  repeatBtnText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brandBrown,
  },
  eventType: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  eventMeta: {
    fontSize: 11,
    color: colors.secondary,
  },
  disputeDesc: {
    ...typography.caption,
    color: colors.secondary,
  },
  disputeInput: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.sm,
    minHeight: 72,
    textAlignVertical: 'top',
    color: colors.deepBrown,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    fontWeight: '600',
  },
  disputeSubmitBtn: {
    backgroundColor: colors.errorBg,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  disputeSubmitText: {
    ...typography.bodyBold,
    color: colors.error,
  },
});
