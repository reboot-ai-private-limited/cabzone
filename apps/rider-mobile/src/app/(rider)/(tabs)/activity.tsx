import { locationLabel } from '@/services/location-names';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { RideRouteStrip } from '@/components/ride/ride-route-strip';
import { useRide } from '@/context/ride-context';
import type { RiderRideViewDto } from '@/services/api';
import {
  formatRupeesFromPaise,
  getRideStatusMeta,
  isRideActive,
  isRideWithinRatingWindow,
} from '@/services/rider-helpers';
import { colors, radii, spacing, typography, createStyles } from '@/design-system';

type FilterTab = 'ALL' | 'COMPLETED' | 'CANCELLED';

export default function ActivityScreen() {
  const router = useRouter();
  const {
    activeRide,
    rideHistory,
    hasMoreRides,
    isLoadingRides,
    isLoadingMoreRides,
    syncError,
    refreshRides,
    loadOlderRides,
    setBookingDraft,
  } = useRide();
  const [filter, setFilter] = useState<FilterTab>('ALL');

  const pastRides = useMemo(() => {
    return rideHistory.filter((r) => {
      if (isRideActive(r.status)) return false;
      if (filter === 'COMPLETED') {
        return (
          r.status === 'SETTLED' ||
          r.status === 'PAYMENT_CONFIRMED' ||
          r.status === 'PAYMENT_DISPUTED' ||
          r.status === 'PAYMENT_CASH_CLAIMED'
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
      address:
        locationLabel(ride.pickup.address, 'Pickup location'),
    };
    const dropLoc = {
      lat: ride.drop.lat,
      lng: ride.drop.lng,
      address:
        locationLabel(ride.drop.address, 'Destination'),
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
          <Pressable
            style={styles.refreshBtn}
            onPress={() => void refreshRides()}
            accessibilityRole="button"
            accessibilityLabel="Refresh activity"
          >
            {isLoadingRides ? (
              <ActivityIndicator size="small" color={colors.deepBrown} />
            ) : (
              <Ionicons name="refresh" size={20} color={colors.deepBrown} />
            )}
          </Pressable>
        </View>

        {syncError && rideHistory.length > 0 ? (
          <Text style={styles.syncError} accessibilityRole="alert">
            {syncError}
          </Text>
        ) : null}

        {/* Active Ride Card */}
        {activeRide ? (
          <Pressable
            style={styles.activeCard}
            onPress={() => router.push(`/(rider)/ride/${activeRide.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Open live trip: ${getRideStatusMeta(activeRide.status).label}`}
          >
            <View style={styles.activeTopRow}>
              <View style={styles.liveTag}>
                <Text style={styles.liveTagText}>LIVE TRIP</Text>
              </View>
              <Text style={styles.activeFare}>
                {formatRupeesFromPaise(
                  (activeRide.agreedFarePaise ??
                    activeRide.proposedFarePaise ??
                    activeRide.suggestedFarePaise) + (activeRide.arrearsPaise ?? 0),
                )}
              </Text>
            </View>
            <Text style={styles.activeStatusTitle}>
              {getRideStatusMeta(activeRide.status).label}
            </Text>
            <Text style={styles.activeRouteText} numberOfLines={1}>
              {activeRide.pickup.address || 'Pickup'} → {activeRide.drop.address || 'Drop'}
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
        <View style={styles.filterRow} accessibilityRole="tablist">
          {(['ALL', 'COMPLETED', 'CANCELLED'] as FilterTab[]).map((tab) => {
            const label =
              tab === 'ALL' ? 'All Trips' : tab === 'COMPLETED' ? 'Settled' : 'Cancelled';
            return (
              <Pressable
                key={tab}
                style={[styles.filterChip, filter === tab && styles.filterChipActive]}
                onPress={() => setFilter(tab)}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: filter === tab }}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filter === tab && styles.filterChipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isLoadingRides && rideHistory.length === 0 ? (
          <View style={styles.emptyCard} accessibilityRole="progressbar">
            <ActivityIndicator size="small" color={colors.deepBrown} />
            <Text style={styles.emptyTitle}>Loading your trips…</Text>
          </View>
        ) : syncError && rideHistory.length === 0 ? (
          <View style={styles.emptyCard} accessibilityRole="alert">
            <Ionicons name="cloud-offline-outline" size={38} color={colors.error} />
            <Text style={styles.emptyTitle}>Unable to load trip history</Text>
            <Text style={styles.emptySubtitle}>{syncError}</Text>
            <Pressable
              style={styles.loadMoreBtn}
              onPress={() => void refreshRides()}
              accessibilityRole="button"
              accessibilityLabel="Retry loading trip history"
            >
              <Text style={styles.loadMoreText}>Retry</Text>
            </Pressable>
          </View>
        ) : pastRides.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={38} color={colors.secondary} />
            <Text style={styles.emptyTitle}>No past rides yet</Text>
            <Text style={styles.emptySubtitle}>
              Your completed trips, itemized receipts, and quick repeat/return route buttons will
              appear here.
            </Text>
          </View>
        ) : (
          <>
            {pastRides.map((ride) => {
              const meta = getRideStatusMeta(ride.status);
              const fare =
                (ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise) +
                (ride.arrearsPaise ?? 0);
              const canPromptRating =
                ride.status === 'SETTLED' &&
                isRideWithinRatingWindow(ride.completedAt ?? ride.updatedAt);
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
                    onPress={() =>
                      router.push(
                        ride.status === 'PAYMENT_CASH_CLAIMED'
                          ? `/(rider)/ride/${ride.id}`
                          : `/(rider)/history/${ride.id}`,
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${meta.label}, ${formatRupeesFromPaise(fare)}, ${dateStr}`}
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
                    {(ride.arrearsPaise ?? 0) > 0 ? (
                      <Text style={styles.arrearsMiniNote}>
                        Includes {formatRupeesFromPaise(ride.arrearsPaise ?? 0)} previous
                        cancellation fee
                      </Text>
                    ) : null}

                    <View style={styles.historyRouteBlock}>
                      <RideRouteStrip
                        pickup={locationLabel(ride.pickup.address, 'Pickup location')}
                        drop={locationLabel(ride.drop.address, 'Destination')}
                      />
                    </View>
                  </Pressable>

                  {/* Quick Actions: Receipt (& Rate within 7d), Repeat Ride, Return Route */}
                  <View style={styles.historyActionsRow}>
                    <Pressable
                      style={styles.historyActionBtn}
                      onPress={() =>
                      router.push(
                        ride.status === 'PAYMENT_CASH_CLAIMED'
                          ? `/(rider)/ride/${ride.id}`
                          : `/(rider)/history/${ride.id}`,
                      )
                    }
                      accessibilityRole="button"
                      accessibilityLabel={
                        canPromptRating ? 'View receipt and rate trip' : 'View trip receipt'
                      }
                    >
                      <Ionicons
                        name={canPromptRating ? 'star-outline' : 'document-text-outline'}
                        size={15}
                        color={colors.deepBrown}
                      />
                      <Text style={styles.historyActionText}>
                        {canPromptRating ? 'Receipt & Rate' : 'Receipt'}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={styles.historyActionBtn}
                      onPress={() => handleRepeatOrReturn(ride, false)}
                      accessibilityRole="button"
                      accessibilityLabel="Repeat this ride"
                    >
                      <Ionicons name="repeat-outline" size={15} color={colors.deepBrown} />
                      <Text style={styles.historyActionText}>Repeat</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.historyActionBtn, styles.historyActionBtnAmber]}
                      onPress={() => handleRepeatOrReturn(ride, true)}
                      accessibilityRole="button"
                      accessibilityLabel="Book return route"
                    >
                      <Ionicons
                        name="swap-horizontal-outline"
                        size={15}
                        color={colors.deepBrown}
                      />
                      <Text style={styles.historyActionText}>Return Route</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {hasMoreRides ? (
              <Pressable
                style={styles.loadMoreBtn}
                disabled={isLoadingMoreRides}
                onPress={() => void loadOlderRides()}
                accessibilityRole="button"
                accessibilityLabel="Load older trips"
              >
                {isLoadingMoreRides ? (
                  <ActivityIndicator size="small" color={colors.deepBrown} />
                ) : (
                  <Text style={styles.loadMoreText}>Load older trips</Text>
                )}
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = createStyles(() => ({
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
    minHeight: 44,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
  loadMoreBtn: {
    minHeight: 48,
    backgroundColor: colors.cream,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  loadMoreText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.deepBrown,
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
  arrearsMiniNote: {
    ...typography.caption,
    color: colors.brandBrown,
  },
  historyRouteBlock: {
    paddingVertical: spacing.sm,
  },
  historyActionsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.cream,
  },
  historyActionBtn: {
    flex: 1,
    minHeight: 44,
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
}));
