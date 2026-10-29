import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { RideDto, RideEventDto } from '@cabzone/contracts';
import { useRide } from '@/context/ride-context';
import { computeRideEarningsBreakdown } from '@/context/duty-context';
import {
  extractDriverCancellationCompensationPaise,
  resolveDriverArrearsWalletEffect,
} from '@/services/driver-ride-policy';
import { RideRatingCard } from '@/components/driver/ride-rating-card';
import { colors, typography } from '@/design-system';

export default function RideHistoryDetailScreen() {
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { fetchRideDetail } = useRide();

  const [ride, setRide] = useState<RideDto | null>(null);
  const [events, setEvents] = useState<RideEventDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    fetchRideDetail(rideId)
      .then((res) => {
        if (cancelled || !res) return;
        setRide(res.ride);
        setEvents(res.events);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rideId, fetchRideDetail]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.deepBrown} />
        <Text style={styles.loadingText}>Loading trip receipt...</Text>
      </SafeAreaView>
    );
  }

  if (!ride) {
    return (
      <SafeAreaView style={styles.centered}>
        <Ionicons name="receipt-outline" size={44} color={colors.deepBrown} />
        <Text style={styles.emptyTitle}>Ride Record Not Found</Text>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go Back"
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const settlement = ride.driverSettlement;
  const breakdown = computeRideEarningsBreakdown(ride);
  const arrearsPaise = Math.max(0, ride.arrearsPaise ?? 0);
  const isSettled = settlement
    ? settlement.settledVia !== 'UNSETTLED'
    : ride.status === 'SETTLED' || ride.status === 'PAYMENT_CONFIRMED';
  const isPendingPayment = ride.status === 'TRIP_COMPLETED' || ride.status === 'PAYMENT_PENDING';
  const isDisputed = ride.status === 'PAYMENT_DISPUTED';
  const driverCancelCompPaise =
    ride.status === 'CANCELLED' ? extractDriverCancellationCompensationPaise(events) : 0;
  const walletEffect = resolveDriverArrearsWalletEffect({
    grossFarePaise: breakdown.grossPaise,
    commissionPaise: settlement?.commissionChargedPaise ?? breakdown.commissionPaise,
    netEarningsPaise: breakdown.netPaise,
    arrearsPaise,
    method: isSettled
      ? settlement?.settledVia === 'ONLINE_UPI'
        ? 'ONLINE_UPI'
        : 'CASH'
      : 'PENDING',
  });
  const distanceKm = Number(((ride.routeSnapshot?.distanceM ?? 0) / 1000).toFixed(1));
  const durationMin = Math.max(1, Math.round((ride.routeSnapshot?.durationSeconds ?? 0) / 60));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.topBackBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
          <Text style={styles.topBackText}>Rides</Text>
        </Pressable>
        <Text style={styles.topTitle}>Trip Receipt</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Summary Header Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.statusLabel}>{ride.status.replace(/_/g, ' ')}</Text>
          <Text style={styles.netAmount}>
            {isSettled
              ? `₹${(breakdown.netPaise / 100).toFixed(2)}`
              : driverCancelCompPaise > 0
                ? `+₹${(driverCancelCompPaise / 100).toFixed(2)}`
                : '₹0.00'}
          </Text>
          <Text style={styles.netCaption}>
            {isSettled
              ? `Settled Net Earnings (${settlement?.settledVia === 'ONLINE_UPI' ? 'Online UPI' : 'Cash / Direct'})`
              : driverCancelCompPaise > 0
                ? 'Driver Cancellation Compensation Credited'
                : isPendingPayment
                  ? 'Awaiting Payment Confirmation'
                  : isDisputed
                    ? 'Under Payment Dispute Review'
                    : 'Not Settled'}
          </Text>

          <View style={styles.metaStrip}>
            <View style={styles.metaCol}>
              <Text style={styles.metaKey}>Category</Text>
              <Text style={styles.metaVal}>{ride.vehicleCategory}</Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.metaKey}>Distance</Text>
              <Text style={styles.metaVal}>{distanceKm} km</Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.metaKey}>Est. Time</Text>
              <Text style={styles.metaVal}>{durationMin} mins</Text>
            </View>
          </View>
        </View>

        {/* Route Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Route</Text>
          <View style={styles.pointRow}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pointLabel}>PICKUP</Text>
              <Text style={styles.pointAddress}>
                {ride.pickup.address || `${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}`}
              </Text>
            </View>
          </View>
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

        {/* Fare Breakdown */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Financial Breakdown</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Suggested Base Fare</Text>
            <Text style={styles.rowVal}>₹{(ride.suggestedFarePaise / 100).toFixed(2)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Agreed Passenger Fare (Gross)</Text>
            <Text style={styles.rowVal}>₹{(breakdown.grossPaise / 100).toFixed(2)}</Text>
          </View>
          {arrearsPaise > 0 ? (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Rider Prior Cancellation Fee (No Commission)</Text>
                <Text style={styles.rowVal}>₹{(arrearsPaise / 100).toFixed(2)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Total Collected from Rider</Text>
                <Text style={styles.rowVal}>
                  ₹{(walletEffect.totalCollectFromRiderPaise / 100).toFixed(2)}
                </Text>
              </View>
            </>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>
              Platform Commission ({ride.pricingSnapshot?.commissionPercent ?? 8}%)
            </Text>
            <Text style={styles.rowDebit}>
              -₹
              {(
                ((settlement?.commissionChargedPaise ?? breakdown.commissionPaise) || 0) / 100
              ).toFixed(2)}
            </Text>
          </View>
          {settlement && settlement.commissionRefundedPaise > 0 ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Dispute Commission Refund</Text>
              <Text style={[styles.rowVal, { color: colors.success }]}>
                +₹{(settlement.commissionRefundedPaise / 100).toFixed(2)}
              </Text>
            </View>
          ) : null}
          {driverCancelCompPaise > 0 ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Driver Cancellation Compensation</Text>
              <Text style={[styles.rowVal, { color: colors.success }]}>
                +₹{(driverCancelCompPaise / 100).toFixed(2)}
              </Text>
            </View>
          ) : null}
          <View style={[styles.row, styles.rowTotal]}>
            <Text style={styles.rowTotalLabel}>Settled Net Driver Earnings</Text>
            <Text style={styles.rowTotalVal}>
              ₹{((isSettled ? breakdown.netPaise : driverCancelCompPaise) / 100).toFixed(2)}
            </Text>
          </View>
          {(isSettled || isPendingPayment || arrearsPaise > 0) && ride.status !== 'CANCELLED' ? (
            <Text style={styles.walletEffectNote}>{walletEffect.summaryNote}</Text>
          ) : null}
        </View>

        {ride.status === 'SETTLED' ? (
          <RideRatingCard
            rideId={ride.id}
            passengerName={ride.passenger?.name || 'Passenger'}
          />
        ) : null}

        {/* Audit Event Timeline */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Trip Timeline</Text>
          {events.length === 0 ? (
            <Text style={styles.rowLabel}>
              Created {new Date(ride.createdAt).toLocaleString('en-IN')}
            </Text>
          ) : (
            events.map((ev) => (
              <View key={ev.id} style={styles.eventRow}>
                <View style={styles.eventDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventType}>{ev.eventType.replace(/_/g, ' ')}</Text>
                  <Text style={styles.eventTime}>
                    {new Date(ev.createdAt).toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Support Shortcut */}
        <Pressable
          style={styles.helpButton}
          onPress={() => router.push('/(driver)/account/help')}
          accessibilityRole="button"
          accessibilityLabel="Need help with this trip"
        >
          <Ionicons name="help-buoy-outline" size={18} color={colors.deepBrown} />
          <Text style={styles.helpButtonText}>Need help with this trip?</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: {
    fontSize: typography.sizes.sm,
    color: colors.secondary,
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  backButton: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.amber,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  backButtonText: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topBackBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topBackText: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  topTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 44,
    gap: 16,
  },
  summaryCard: {
    backgroundColor: colors.cream,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.brandBrown,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  netAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  netCaption: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 16,
    textAlign: 'center',
  },
  metaStrip: {
    flexDirection: 'row',
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 14,
  },
  metaCol: {
    flex: 1,
    alignItems: 'center',
  },
  metaKey: {
    fontSize: 11,
    color: colors.secondary,
    fontWeight: '600',
  },
  metaVal: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.deepBrown,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  cardTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  pointLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.secondary,
  },
  pointAddress: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: colors.deepBrown,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    fontWeight: '600',
    flex: 1,
    paddingRight: 8,
  },
  rowVal: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  rowDebit: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.brandBrown,
  },
  rowTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginTop: 4,
  },
  rowTotalLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  rowTotalVal: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.success,
  },
  walletEffectNote: {
    fontSize: 11,
    color: colors.secondary,
    fontWeight: '600',
    lineHeight: 16,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eventDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.amber,
  },
  eventType: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  eventTime: {
    fontSize: 11,
    color: colors.secondary,
  },
  helpButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.lightCream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  helpButtonText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
});
