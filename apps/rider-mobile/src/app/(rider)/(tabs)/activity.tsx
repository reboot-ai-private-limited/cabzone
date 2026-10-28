import { locationLabel } from '@/services/location-names';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRide } from '@/context/ride-context';
import type { RiderRideViewDto } from '@/services/api';
import { formatRupeesFromPaise, getRideStatusMeta, isRideActive } from '@/services/rider-helpers';
import { colors, radii, spacing, typography } from '@/design-system';

type FilterTab = 'ALL' | 'COMPLETED' | 'CANCELLED';

export default function ActivityScreen() {
  const router = useRouter();
  const { activeRide, rideHistory, isLoadingRides, syncError, refreshRides, setBookingDraft } =
    useRide();
  const [filter, setFilter] = useState<FilterTab>('ALL');

  const pastRides = useMemo(() => {
    return rideHistory.filter((r) => {
      if (isRideActive(r.status)) return false;
      if (filter === 'COMPLETED') {
        return (
          r.status === 'SETTLED' ||
          r.status === 'PAYMENT_CONFIRMED' ||
          r.status === 'PAYMENT_DISPUTED'
        );
      }
      if (filter === 'CANCELLED') {
        return r.status === 'CANCELLED' || r.status === 'EXPIRED';
      }
      return true;
    });
  }, [filter, rideHistory]);

  const handleRepeatOrReturn = (ride: RiderRideViewDto, reverse: boolean) => {
    const mode =
      ride.zoneSnapshot?.classification === 'OUTSTATION' ||
      ride.zoneSnapshot?.classification === 'INTERSTATE'
        ? 'OUTSTATION'
        : 'IN_CITY';

    const pickupLoc = {
      lat: ride.pickup.lat,
      lng: ride.pickup.lng,
      address: locationLabel(ride.pickup.address, 'Pickup location'),
    };
    const dropLoc = {
      lat: ride.drop.lat,
      lng: ride.drop.lng,
      address: locationLabel(ride.drop.address, 'Destination'),
    };

    setBookingDraft({
      mode,
      pickup: reverse ? dropLoc : pickupLoc,
      drop: reverse ? pickupLoc : dropLoc,
    });

    router.push(mode === 'OUTSTATION' ? '/(rider)/(tabs)/intercity' : '/(rider)/(tabs)/home');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>RIDES & RECEIPTS</Text>
            <Text style={styles.title}>Your Activity</Text>
          </View>
          <Pressable style={styles.refreshBtn} onPress={() => void refreshRides()}>
            {isLoadingRides ? (
              <ActivityIndicator size="small" color={colors.deepBrown} />
            ) : (
              <Ionicons name="refresh" size={20} color={colors.deepBrown} />
            )}
          </Pressable>
        </View>

        {syncError ? (
          <Text style={styles.syncError} accessibilityRole="alert">
            {syncError}
          </Text>
        ) : null}

        {/* Active Ride Card */}
        {activeRide ? (
          <Pressable
            style={styles.activeCard}
            onPress={() => router.push(`/(rider)/ride/${activeRide.id}`)}
          >
            <View style={styles.activeTopRow}>
              <View style={styles.liveTag}>
                <Text style={styles.liveTagText}>LIVE TRIP</Text>
              </View>
              <Text style={styles.activeFare}>
                {formatRupeesFromPaise(
                  activeRide.agreedFarePaise ??
                    activeRide.proposedFarePaise ??
                    activeRide.suggestedFarePaise,
                )}
              </Text>
            </View>
            <Text style={styles.activeStatusTitle}>
              {getRideStatusMeta(activeRide.status).label}
            </Text>
            <Text style={styles.activeRouteText} numberOfLines={1}>
              {locationLabel(activeRide.pickup.address, 'Pickup location')} →{' '}
              {locationLabel(activeRide.drop.address, 'Destination')}
            </Text>
            <View style={styles.openTripRow}>
              <Text style={styles.openTripText}>
                {activeRide.pickupOtp
                  ? `Pickup OTP: ${activeRide.pickupOtp} · Tap to view trip`
                  : 'Open live tracking & negotiation'}
              </Text>
              <Ionicons name="arrow-forward" size={16} color={colors.deepBrown} />
            </View>
          </Pressable>
        ) : null}

        {/* Filter Chips */}
        <View style={styles.filterRow}>
          {(['ALL', 'COMPLETED', 'CANCELLED'] as FilterTab[]).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.filterChip, filter === tab && styles.filterChipActive]}
              onPress={() => setFilter(tab)}
            >
              <Text style={[styles.filterChipText, filter === tab && styles.filterChipTextActive]}>
                {tab === 'ALL' ? 'All Trips' : tab === 'COMPLETED' ? 'Settled' : 'Cancelled'}
              </Text>
            </Pressable>
          ))}
        </View>

        {pastRides.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={38} color={colors.secondary} />
            <Text style={styles.emptyTitle}>No past rides yet</Text>
            <Text style={styles.emptySubtitle}>
              Your completed trips, itemized receipts, and quick repeat/return route buttons will
              appear here.
            </Text>
          </View>
        ) : (
          pastRides.map((ride) => {
            const meta = getRideStatusMeta(ride.status);
            const fare = ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise;
            const dateStr = new Date(ride.createdAt).toLocaleString('en-IN', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <View key={ride.id} style={styles.historyCard}>
                <Pressable
                  style={styles.historyCardMain}
                  onPress={() => router.push(`/(rider)/history/${ride.id}`)}
                >
                  <View style={styles.historyHeaderRow}>
                    <View style={styles.zoneTypeBadge}>
                      <Text style={styles.zoneTypeBadgeText}>
                        {ride.zoneSnapshot?.classification || 'IN_CITY'}
                      </Text>
                    </View>
                    <Text style={styles.historyDate}>{dateStr}</Text>
                  </View>

                  <View style={styles.historyPriceAndStatusRow}>
                    <Text style={styles.historyStatusLabel}>{meta.label}</Text>
                    <Text style={styles.historyFareText}>{formatRupeesFromPaise(fare)}</Text>
                  </View>

                  <View style={styles.historyRouteBlock}>
                    <Text style={styles.historyAddress} numberOfLines={1}>
                      🟢 {locationLabel(ride.pickup.address, 'Pickup location')}
                    </Text>
                    <Text style={styles.historyAddress} numberOfLines={1}>
                      🟤 {locationLabel(ride.drop.address, 'Destination')}
                    </Text>
                  </View>
                </Pressable>

                {/* Quick Actions: Receipt, Repeat Ride, Return Route */}
                <View style={styles.historyActionsRow}>
                  <Pressable
                    style={styles.historyActionBtn}
                    onPress={() => router.push(`/(rider)/history/${ride.id}`)}
                  >
                    <Ionicons name="document-text-outline" size={15} color={colors.deepBrown} />
                    <Text style={styles.historyActionText}>Receipt</Text>
                  </Pressable>

                  <Pressable
                    style={styles.historyActionBtn}
                    onPress={() => handleRepeatOrReturn(ride, false)}
                  >
                    <Ionicons name="repeat-outline" size={15} color={colors.deepBrown} />
                    <Text style={styles.historyActionText}>Repeat</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.historyActionBtn, styles.historyActionBtnAmber]}
                    onPress={() => handleRepeatOrReturn(ride, true)}
                  >
                    <Ionicons name="swap-horizontal-outline" size={15} color={colors.deepBrown} />
                    <Text style={styles.historyActionText}>Return Route</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  syncError: { ...typography.caption, color: colors.error },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 40,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    ...typography.label,
    color: colors.brandBrown,
  },
  title: {
    ...typography.h1,
    color: colors.deepBrown,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCard: {
    backgroundColor: colors.amber,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    gap: 6,
  },
  activeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveTag: {
    backgroundColor: colors.deepBrown,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  liveTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.amber,
  },
  activeFare: {
    ...typography.h1,
    color: colors.deepBrown,
  },
  activeStatusTitle: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  activeRouteText: {
    ...typography.caption,
    color: colors.deepBrown,
  },
  openTripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(58,36,20,0.2)',
  },
  openTripText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterChip: {
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  filterChipActive: {
    backgroundColor: colors.deepBrown,
    borderColor: colors.deepBrown,
  },
  filterChipText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  filterChipTextActive: {
    color: colors.amber,
  },
  emptyCard: {
    backgroundColor: colors.cream,
    borderRadius: radii.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  emptyTitle: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  emptySubtitle: {
    ...typography.caption,
    color: colors.secondary,
    textAlign: 'center',
  },
  historyCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  historyCardMain: {
    padding: spacing.md,
    gap: 8,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  zoneTypeBadge: {
    backgroundColor: colors.cream,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  zoneTypeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.brandBrown,
  },
  historyDate: {
    fontSize: 12,
    color: colors.secondary,
  },
  historyPriceAndStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyStatusLabel: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  historyFareText: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  historyRouteBlock: {
    gap: 4,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
    borderRadius: radii.md,
  },
  historyAddress: {
    fontSize: 13,
    color: colors.deepBrown,
  },
  historyActionsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.cream,
  },
  historyActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: colors.borderSubtle,
  },
  historyActionBtnAmber: {
    backgroundColor: colors.warmBeige,
    borderRightWidth: 0,
  },
  historyActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.deepBrown,
  },
});
