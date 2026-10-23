import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { RideDto, RideStatus } from '@cabzone/contracts';
import { computeRideEarningsBreakdown, useDuty } from '@/context/duty-context';
import { ACTIVE_RIDE_STATUSES, useRide } from '@/context/ride-context';
import { colors, typography } from '@/design-system';

type FilterTab = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'DISPUTED', label: 'Disputed' },
];

const COUNTER_STEP_PAISE = 1000;

function getStatusPillStyle(status: RideStatus): {
  label: string;
  bg: string;
  border: string;
  text: string;
} {
  if (status === 'SETTLED' || status === 'PAYMENT_CONFIRMED') {
    return {
      label: 'Settled',
      bg: '#DCFCE7',
      border: '#86EFAC',
      text: '#15803D',
    };
  }
  if (status === 'CANCELLED' || status === 'EXPIRED') {
    return {
      label: status === 'CANCELLED' ? 'Cancelled' : 'Expired',
      bg: '#FEE2E2',
      border: '#FCA5A5',
      text: colors.error,
    };
  }
  if (status === 'PAYMENT_DISPUTED') {
    return {
      label: 'Disputed',
      bg: '#FEF3C7',
      border: '#FCD34D',
      text: colors.brandBrown,
    };
  }
  return {
    label: status.replace(/_/g, ' '),
    bg: colors.lightCream,
    border: colors.warmBeige,
    text: colors.deepBrown,
  };
}

export default function DriverRidesTab() {
  const router = useRouter();
  const { status: dutyStatus, myRides, refreshSummary } = useDuty();
  const {
    offers,
    activeRide,
    isMutatingRide,
    refreshOffers,
    acceptOffer,
    ignoreOffer,
    counters,
    rejectedCounters,
    counterOffer,
  } = useRide();

  const [filter, setFilter] = useState<FilterTab>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [counterDrafts, setCounterDrafts] = useState<Record<string, number>>({});

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refreshSummary(), refreshOffers(true)]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const summaryStats = useMemo(() => {
    let completed = 0;
    let totalNetPaise = 0;
    for (const r of myRides) {
      if (r.status === 'SETTLED' || r.status === 'PAYMENT_CONFIRMED') {
        completed += 1;
        totalNetPaise += computeRideEarningsBreakdown(r).netPaise;
      }
    }
    return {
      total: myRides.length,
      completed,
      totalNetPaise,
    };
  }, [myRides]);

  const filteredRides = useMemo(() => {
    return myRides.filter((r) => {
      if (filter === 'ALL') return true;
      if (filter === 'ACTIVE') return ACTIVE_RIDE_STATUSES.has(r.status);
      if (filter === 'COMPLETED') {
        return r.status === 'SETTLED' || r.status === 'PAYMENT_CONFIRMED';
      }
      if (filter === 'CANCELLED') {
        return r.status === 'CANCELLED' || r.status === 'EXPIRED';
      }
      if (filter === 'DISPUTED') {
        return r.status === 'PAYMENT_DISPUTED';
      }
      return true;
    });
  }, [myRides, filter]);

  const handlePressRide = (ride: RideDto) => {
    if (ACTIVE_RIDE_STATUSES.has(ride.status)) {
      router.push({
        pathname: '/(driver)/ride/[rideId]',
        params: { rideId: ride.id },
      });
    } else {
      router.push({
        pathname: '/(driver)/history/[rideId]',
        params: { rideId: ride.id },
      });
    }
  };

  const handleAcceptFromList = async (rideId: string) => {
    const accepted = await acceptOffer(rideId);
    if (accepted) {
      router.push({
        pathname: '/(driver)/ride/[rideId]',
        params: { rideId: accepted.id },
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Rides & Dispatch</Text>
          <Text style={styles.subtitle}>
            Live incoming offers, active trips & full ride history
          </Text>
        </View>
        <Pressable
          style={styles.refreshBtn}
          onPress={handleRefresh}
          disabled={isRefreshing}
          accessibilityRole="button"
          accessibilityLabel="Refresh rides">
          {isRefreshing ? (
            <ActivityIndicator size="small" color={colors.deepBrown} />
          ) : (
            <Ionicons name="refresh" size={18} color={colors.deepBrown} />
          )}
        </Pressable>
      </View>

      {/* Summary Stats Strip */}
      <View style={styles.summaryStrip}>
        <View style={styles.summaryChip}>
          <Text style={styles.summaryLabel}>Total Trips</Text>
          <Text style={styles.summaryValue}>{summaryStats.total}</Text>
        </View>
        <View style={styles.summaryChip}>
          <Text style={styles.summaryLabel}>Completed</Text>
          <Text style={styles.summaryValue}>{summaryStats.completed}</Text>
        </View>
        <View style={[styles.summaryChip, styles.summaryChipHighlight]}>
          <Text style={styles.summaryLabel}>Net Earned</Text>
          <Text style={styles.summaryValue}>
            ₹{(summaryStats.totalNetPaise / 100).toFixed(0)}
          </Text>
        </View>
      </View>

      {/* Filter Bar */}
      <View style={styles.filterBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterBarContent}>
          {FILTER_TABS.map((tab) => {
            const active = filter === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.filterPill, active && styles.filterPillActive]}
                onPress={() => setFilter(tab.key)}>
                <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Content */}
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.deepBrown}
          />
        }>
        {/* Active Ride Banner */}
        {activeRide ? (
          <Pressable
            style={styles.activeBanner}
            onPress={() =>
              router.push({
                pathname: '/(driver)/ride/[rideId]',
                params: { rideId: activeRide.id },
              })
            }>
            <View style={{ flex: 1 }}>
              <Text style={styles.activeBannerTag}>
                ACTIVE TRIP · {activeRide.status.replace(/_/g, ' ')}
              </Text>
              <Text style={styles.activeBannerRoute} numberOfLines={1}>
                {activeRide.pickup.address || 'Pickup'} → {activeRide.drop.address || 'Drop'}
              </Text>
              <Text style={styles.activeBannerSub}>
                Agreed Fare ₹
                {(
                  (activeRide.agreedFarePaise ??
                    activeRide.proposedFarePaise ??
                    activeRide.suggestedFarePaise) / 100
                ).toFixed(0)}{' '}
                · Passenger: {activeRide.passenger?.name || 'Rider'}
              </Text>
            </View>
            <View style={styles.activeBannerBtn}>
              <Text style={styles.activeBannerBtnText}>Resume →</Text>
            </View>
          </Pressable>
        ) : null}

        {/* Live Incoming Ride Offers Section */}
        {dutyStatus === 'ONLINE' && !activeRide && offers.length > 0 ? (
          <View style={styles.offersSection}>
            <View style={styles.offersHeaderRow}>
              <View style={styles.liveDot} />
              <Text style={styles.offersSectionTitle}>
                Incoming Ride Requests ({offers.length})
              </Text>
            </View>

            {offers.map((offer) => {
              const grossRupees = Math.round(offer.proposedFarePaise / 100);
              const netRupees = Math.round((offer.proposedFarePaise * 0.92) / 100);
              const distKm = (offer.distanceToPickupM / 1000).toFixed(1);
              const floorPaise = offer.negotiation?.floorPaise ?? 0;
              const ceilingPaise = offer.negotiation?.ceilingPaise ?? Number.MAX_SAFE_INTEGER;
              const counteredPaise = counters[offer.rideId];
              const rejectedPaise = rejectedCounters[offer.rideId];
              const draftPaise = counterDrafts[offer.rideId];

              return (
                <View key={offer.rideId} style={styles.offerCard}>
                  <View style={styles.offerTopRow}>
                    <View>
                      <Text style={styles.offerCategoryTag}>
                        {offer.vehicleCategory} · {distKm} km to pickup
                      </Text>
                      <Text style={styles.offerFareText}>₹{grossRupees}</Text>
                      <Text style={styles.offerNetSub}>
                        Est. Net ₹{netRupees} (after 8% fee) · Direct Cash/UPI
                      </Text>
                    </View>
                    {offer.negotiation ? (
                      <View style={styles.rangeBadge}>
                        <Text style={styles.rangeBadgeText}>
                          Range ₹{Math.round(floorPaise / 100)}–₹{Math.round(ceilingPaise / 100)}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.routeSection}>
                    <View style={styles.pointRow}>
                      <View style={[styles.dot, { backgroundColor: colors.success }]} />
                      <Text style={styles.pointText} numberOfLines={1}>
                        {offer.pickup.address ||
                          `${offer.pickup.lat.toFixed(4)}, ${offer.pickup.lng.toFixed(4)}`}
                      </Text>
                    </View>
                    <View style={styles.pointRow}>
                      <View style={[styles.dot, { backgroundColor: colors.error }]} />
                      <Text style={styles.pointText} numberOfLines={1}>
                        {offer.drop.address ||
                          `${offer.drop.lat.toFixed(4)}, ${offer.drop.lng.toFixed(4)}`}
                      </Text>
                    </View>
                  </View>

                  {counteredPaise != null && draftPaise == null ? (
                    <View style={styles.counterNoticeBox}>
                      <Text style={styles.counterNoticeText}>
                        Counter ₹{Math.round(counteredPaise / 100)} sent · Waiting for customer...
                      </Text>
                    </View>
                  ) : null}

                  {rejectedPaise != null && counteredPaise == null && draftPaise == null ? (
                    <View style={styles.rejectedNoticeBox}>
                      <Text style={styles.rejectedNoticeText}>
                        Customer declined ₹{Math.round(rejectedPaise / 100)} — accept ₹{grossRupees} or counter again
                      </Text>
                    </View>
                  ) : null}

                  {draftPaise != null ? (
                    <View style={styles.inlineCounterBox}>
                      <View style={styles.inlineStepperRow}>
                        <Pressable
                          style={[
                            styles.inlineStepBtn,
                            draftPaise - COUNTER_STEP_PAISE < floorPaise && styles.disabledBtn,
                          ]}
                          disabled={draftPaise - COUNTER_STEP_PAISE < floorPaise}
                          onPress={() =>
                            setCounterDrafts((prev) => ({
                              ...prev,
                              [offer.rideId]: draftPaise - COUNTER_STEP_PAISE,
                            }))
                          }>
                          <Text style={styles.inlineStepBtnText}>−₹10</Text>
                        </Pressable>
                        <Text style={styles.inlineDraftValue}>
                          ₹{Math.round(draftPaise / 100)}
                        </Text>
                        <Pressable
                          style={[
                            styles.inlineStepBtn,
                            draftPaise + COUNTER_STEP_PAISE > ceilingPaise && styles.disabledBtn,
                          ]}
                          disabled={draftPaise + COUNTER_STEP_PAISE > ceilingPaise}
                          onPress={() =>
                            setCounterDrafts((prev) => ({
                              ...prev,
                              [offer.rideId]: draftPaise + COUNTER_STEP_PAISE,
                            }))
                          }>
                          <Text style={styles.inlineStepBtnText}>+₹10</Text>
                        </Pressable>
                      </View>
                      <View style={styles.offerActionsRow}>
                        <Pressable
                          style={styles.offerSecondaryBtn}
                          onPress={() =>
                            setCounterDrafts((prev) => {
                              const next = { ...prev };
                              delete next[offer.rideId];
                              return next;
                            })
                          }>
                          <Text style={styles.offerSecondaryBtnText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.offerPrimaryBtn, isMutatingRide && styles.disabledBtn]}
                          disabled={isMutatingRide}
                          onPress={async () => {
                            const ok = await counterOffer(offer.rideId, draftPaise);
                            if (ok) {
                              setCounterDrafts((prev) => {
                                const next = { ...prev };
                                delete next[offer.rideId];
                                return next;
                              });
                            }
                          }}>
                          <Text style={styles.offerPrimaryBtnText}>
                            Send Counter ₹{Math.round(draftPaise / 100)}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.offerActionsRow}>
                      <Pressable
                        style={styles.offerSecondaryBtn}
                        disabled={isMutatingRide}
                        onPress={() => ignoreOffer(offer.rideId)}>
                        <Text style={styles.offerSecondaryBtnText}>Ignore</Text>
                      </Pressable>
                      <Pressable
                        style={styles.offerSecondaryBtn}
                        disabled={isMutatingRide}
                        onPress={() =>
                          setCounterDrafts((prev) => ({
                            ...prev,
                            [offer.rideId]:
                              counteredPaise ??
                              Math.min(ceilingPaise, offer.proposedFarePaise + COUNTER_STEP_PAISE),
                          }))
                        }>
                        <Text style={styles.offerSecondaryBtnText}>Counter</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.offerPrimaryBtn, isMutatingRide && styles.disabledBtn]}
                        disabled={isMutatingRide}
                        onPress={() => handleAcceptFromList(offer.rideId)}>
                        <Text style={styles.offerPrimaryBtnText}>Accept ₹{grossRupees}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Filtered Ride History List */}
        {filteredRides.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="car-sport-outline" size={36} color={colors.deepBrown} />
            </View>
            <Text style={styles.emptyTitle}>No Rides in This View</Text>
            <Text style={styles.emptySub}>
              {filter === 'ALL'
                ? 'Completed and assigned rides will appear here once you start accepting trips.'
                : `You have no ${filter.toLowerCase()} rides right now.`}
            </Text>
            <Pressable
              style={styles.goHomeBtn}
              onPress={() => router.push('/(driver)/(tabs)/home')}>
              <Text style={styles.goHomeBtnText}>Go to Home Dashboard</Text>
            </Pressable>
          </View>
        ) : (
          filteredRides.map((ride) => {
            const pill = getStatusPillStyle(ride.status);
            const breakdown = computeRideEarningsBreakdown(ride);
            const wasNegotiated =
              ride.suggestedFarePaise > 0 && breakdown.grossPaise !== ride.suggestedFarePaise;
            const dateStr = new Date(
              ride.settledAt || ride.completedAt || ride.createdAt,
            ).toLocaleString('en-IN', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <Pressable
                key={ride.id}
                style={styles.rideCard}
                onPress={() => handlePressRide(ride)}>
                <View style={styles.rideCardTop}>
                  <View>
                    <Text style={styles.rideDate}>{dateStr}</Text>
                    <Text style={styles.rideCategory}>
                      {ride.vehicleCategory} · {(ride.routeSnapshot.distanceM / 1000).toFixed(1)} km
                    </Text>
                  </View>
                  <View style={styles.badgeGroup}>
                    {wasNegotiated ? (
                      <View style={styles.negotiatedPill}>
                        <Text style={styles.negotiatedPillText}>Negotiated</Text>
                      </View>
                    ) : null}
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: pill.bg, borderColor: pill.border },
                      ]}>
                      <Text style={[styles.statusBadgeText, { color: pill.text }]}>
                        {pill.label}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.routeSection}>
                  <View style={styles.pointRow}>
                    <View style={[styles.dot, { backgroundColor: colors.success }]} />
                    <Text style={styles.pointText} numberOfLines={1}>
                      {ride.pickup.address ||
                        `${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}`}
                    </Text>
                  </View>
                  <View style={styles.pointRow}>
                    <View style={[styles.dot, { backgroundColor: colors.error }]} />
                    <Text style={styles.pointText} numberOfLines={1}>
                      {ride.drop.address ||
                        `${ride.drop.lat.toFixed(4)}, ${ride.drop.lng.toFixed(4)}`}
                    </Text>
                  </View>
                </View>

                <View style={styles.rideCardFooter}>
                  <View>
                    <Text style={styles.fareMetaLabel}>Passenger Fare</Text>
                    <Text style={styles.fareGrossValue}>
                      ₹{(breakdown.grossPaise / 100).toFixed(0)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.fareMetaLabel}>Net Driver Earnings</Text>
                    <Text style={styles.fareNetValue}>
                      ₹{(breakdown.netPaise / 100).toFixed(0)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    marginTop: 2,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.lightCream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryStrip: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  summaryChip: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryChipHighlight: {
    backgroundColor: colors.lightCream,
    borderColor: colors.border,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.secondary,
  },
  summaryValue: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
    marginTop: 2,
  },
  filterBarWrap: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterBarContent: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  filterPillText: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.secondary,
  },
  filterPillTextActive: {
    color: colors.deepBrown,
    fontWeight: '800',
  },
  listContent: {
    padding: 20,
    paddingBottom: 48,
    gap: 14,
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.deepBrown,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  activeBannerTag: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.amber,
    letterSpacing: 0.5,
  },
  activeBannerRoute: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.white,
    marginTop: 3,
  },
  activeBannerSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E2E8F0',
    marginTop: 2,
  },
  activeBannerBtn: {
    backgroundColor: colors.amber,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  activeBannerBtnText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  offersSection: {
    gap: 12,
    marginBottom: 6,
  },
  offersHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16A34A',
  },
  offersSectionTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  offerCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: colors.amber,
    gap: 12,
  },
  offerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  offerCategoryTag: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.brandBrown,
    letterSpacing: 0.4,
  },
  offerFareText: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.deepBrown,
    marginTop: 2,
  },
  offerNetSub: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.secondary,
  },
  rangeBadge: {
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rangeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  counterNoticeBox: {
    backgroundColor: colors.lightCream,
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  counterNoticeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brandBrown,
    textAlign: 'center',
  },
  rejectedNoticeBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  rejectedNoticeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
    textAlign: 'center',
  },
  inlineCounterBox: {
    gap: 10,
    paddingTop: 4,
  },
  inlineStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  inlineStepBtn: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  inlineStepBtnText: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  inlineDraftValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.deepBrown,
    minWidth: 90,
    textAlign: 'center',
  },
  offerActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  offerSecondaryBtn: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerSecondaryBtnText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  offerPrimaryBtn: {
    flex: 1.5,
    backgroundColor: colors.amber,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerPrimaryBtnText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  disabledBtn: {
    opacity: 0.45,
  },
  emptyCard: {
    backgroundColor: colors.cream,
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.lightCream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: '800',
    color: colors.deepBrown,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  goHomeBtn: {
    backgroundColor: colors.amber,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  goHomeBtnText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  rideCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  rideCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rideDate: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  rideCategory: {
    fontSize: 11,
    color: colors.secondary,
    marginTop: 2,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  negotiatedPill: {
    backgroundColor: colors.lightCream,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  negotiatedPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.brandBrown,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  routeSection: {
    gap: 8,
    paddingVertical: 4,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pointText: {
    flex: 1,
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: colors.deepBrown,
  },
  rideCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  fareMetaLabel: {
    fontSize: 11,
    color: colors.secondary,
    fontWeight: '600',
  },
  fareGrossValue: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.deepBrown,
    marginTop: 2,
  },
  fareNetValue: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.success,
    marginTop: 2,
  },
});
