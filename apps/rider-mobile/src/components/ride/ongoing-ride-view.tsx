import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { decodePolyline } from '@cabzone/geo';
import { VEHICLE_CATEGORY_REGISTRY } from '@cabzone/contracts';
import type { RiderRideViewDto } from '@/services/api';
import { formatRupeesFromPaise } from '@/services/rider-helpers';
import { colors, radii, spacing, typography } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import BookingMap from '@/components/booking/booking-map';

interface OngoingRideViewProps {
  ride: RiderRideViewDto;
  driverLocation: { lat: number; lng: number; updatedAt: string } | null;
  connected: boolean;
  error: string | null;
  refreshing: boolean;
  passengerLabel: string;
  onBack: () => void;
  onSafety: () => void;
  onShare: () => void;
  onCancel: () => void;
  onRefresh: () => void;
}

export function OngoingRideView({
  ride,
  driverLocation,
  connected,
  error,
  refreshing,
  passengerLabel,
  onBack,
  onSafety,
  onShare,
  onCancel,
  onRefresh,
}: OngoingRideViewProps) {
  const reducedMotion = useReducedMotion();
  const [height, setHeight] = useState(700);
  const [expanded, setExpanded] = useState(false);
  const [routeOverview, setRouteOverview] = useState(false);
  const [cameraVersion, setCameraVersion] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [progress] = useState(() => new Animated.Value(0));
  const inTrip = ride.status === 'TRIP_STARTED';
  const showRoute = inTrip || routeOverview;
  const collapsedHeight = Math.min(400, height * 0.55);
  const expandedHeight = Math.max(collapsedHeight + 1, height - 72);
  const fare = ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise;
  const pickup = { ...ride.pickup, address: ride.pickup.address || 'Pickup location' };
  const drop = { ...ride.drop, address: ride.drop.address || 'Destination' };
  const routeCoordinates = useMemo(() => {
    try {
      return decodePolyline(ride.routeSnapshot.polyline).filter(
        ([lng, lat]) =>
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          Math.abs(lat) <= 90 &&
          Math.abs(lng) <= 180,
      );
    } catch {
      return [];
    }
  }, [ride.routeSnapshot.polyline]);
  const locationFresh =
    driverLocation && now - new Date(driverLocation.updatedAt).getTime() < 30_000;
  const title = inTrip
    ? 'On your way'
    : ride.status === 'DRIVER_ARRIVED'
      ? 'Your driver is here'
      : ride.status === 'DRIVER_EN_ROUTE'
        ? 'Your driver is on the way'
        : 'Your driver is getting ready';
  const subtitle = inTrip
    ? drop.address
    : ride.status === 'DRIVER_ARRIVED'
      ? 'Meet your driver at the pickup point.'
      : 'We’ll update you when your driver arrives.';

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const animateTo = useCallback(
    (open: boolean) => {
      Animated.timing(progress, {
        toValue: open ? 1 : 0,
        duration: reducedMotion ? 0 : 280,
        useNativeDriver: false,
      }).start();
    },
    [progress, reducedMotion],
  );

  useEffect(() => {
    animateTo(expanded);
    return () => progress.stopAnimation();
  }, [expanded, animateTo, progress]);

  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => progress.stopAnimation(),
    onPanResponderMove: (_, gesture) =>
      progress.setValue(
        Math.max(
          0,
          Math.min(1, (expanded ? 1 : 0) - gesture.dy / (expandedHeight - collapsedHeight)),
        ),
      ),
    onPanResponderRelease: (_, gesture) => {
      const next =
        Math.abs(gesture.vy) > 0.4
          ? gesture.vy < 0
          : Math.abs(gesture.dy) > 24
            ? gesture.dy < 0
            : expanded;
      setExpanded(next);
      if (next === expanded) animateTo(next);
    },
    onPanResponderTerminate: () => animateTo(expanded),
  });

  return (
    <View
      style={styles.container}
      onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}
    >
      <BookingMap
        pickup={pickup}
        drop={showRoute ? drop : undefined}
        driverLocation={driverLocation}
        routeCoordinates={showRoute ? routeCoordinates : undefined}
        cameraVersion={cameraVersion}
        readOnly
        bottomInset={collapsedHeight - 20}
      />

      <View style={styles.topBar} pointerEvents="box-none">
        <Pressable
          style={styles.mapButton}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
        >
          <Ionicons name="arrow-back" size={22} color={colors.deepBrown} />
        </Pressable>
        {!connected ? (
          <Text style={styles.connection} accessibilityRole="alert">
            Reconnecting…
          </Text>
        ) : null}
      </View>

      <View style={[styles.mapControls, { bottom: collapsedHeight + spacing.lg }]}>
        {!inTrip ? (
          <Pressable
            style={styles.mapButton}
            onPress={() => setRouteOverview(!routeOverview)}
            accessibilityRole="button"
            accessibilityLabel={showRoute ? 'Show pickup area' : 'Show trip route'}
          >
            <Ionicons
              name={showRoute ? 'location-outline' : 'git-compare-outline'}
              size={23}
              color={colors.deepBrown}
            />
          </Pressable>
        ) : null}
        <Pressable
          style={styles.mapButton}
          onPress={() => setCameraVersion((value) => value + 1)}
          accessibilityRole="button"
          accessibilityLabel="Recenter map"
        >
          <Ionicons name="locate-outline" size={23} color={colors.deepBrown} />
        </Pressable>
      </View>

      <Animated.View
        style={[
          styles.sheet,
          {
            height: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [collapsedHeight, expandedHeight],
            }),
          },
        ]}
      >
        <View {...pan.panHandlers}>
          <Pressable
            style={styles.grabberTarget}
            onPress={() => setExpanded(!expanded)}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Hide ride details' : 'Show ride details'}
            accessibilityState={{ expanded }}
          >
            <View style={styles.grabber} />
          </Pressable>
        </View>
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.statusRow}>
            <View style={styles.flex}>
              <Text
                style={styles.title}
                accessibilityRole="header"
                accessibilityLiveRegion="polite"
              >
                {title}
              </Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <Ionicons name="car-sport-outline" size={36} color={colors.deepBrown} />
          </View>

          {!inTrip && ride.pickupOtp ? (
            <View style={styles.otpRow}>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>Pickup code</Text>
                <Text style={styles.caption}>Share when you meet your driver</Text>
              </View>
              <Text
                style={styles.otp}
                accessibilityLabel={`Pickup code ${ride.pickupOtp.split('').join(' ')}`}
              >
                {ride.pickupOtp}
              </Text>
            </View>
          ) : null}

          <View style={styles.driverActions}>
            <View style={styles.driverSummary}>
              <View style={styles.driverIcon}>
                <Ionicons name="person-outline" size={21} color={colors.deepBrown} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>Your driver</Text>
                <Text style={styles.caption}>
                  {VEHICLE_CATEGORY_REGISTRY[ride.vehicleCategory].displayName}
                </Text>
              </View>
            </View>
            <Pressable
              style={styles.action}
              onPress={onShare}
              accessibilityRole="button"
              accessibilityLabel="Share trip"
            >
              <View style={styles.actionIcon}>
                <Ionicons name="share-social-outline" size={23} color={colors.deepBrown} />
              </View>
              <Text style={styles.actionLabel}>Share trip</Text>
            </Pressable>
            <Pressable
              style={styles.action}
              onPress={onSafety}
              accessibilityRole="button"
              accessibilityLabel="Safety options"
            >
              <View style={styles.actionIcon}>
                <Ionicons name="shield-checkmark-outline" size={23} color={colors.deepBrown} />
              </View>
              <Text style={styles.actionLabel}>Safety</Text>
            </Pressable>
          </View>

          <Text style={styles.caption} accessibilityLiveRegion="polite">
            {!driverLocation
              ? 'Waiting for driver location'
              : locationFresh
                ? 'Driver location is live'
                : 'Location update delayed · showing last known position'}
          </Text>

          <View style={styles.fareRow}>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>Cash or UPI</Text>
              <Text style={styles.caption}>Pay your driver directly after the trip</Text>
            </View>
            <Text
              style={styles.fare}
              accessibilityLabel={`Agreed fare ${formatRupeesFromPaise(fare)}`}
            >
              {formatRupeesFromPaise(fare)}
            </Text>
          </View>

          {expanded ? (
            <>
              <View style={styles.route}>
                <Text style={styles.sectionTitle}>Your ride</Text>
                <View style={styles.stop}>
                  <Ionicons name="radio-button-on" size={20} color={colors.success} />
                  <View style={styles.flex}>
                    <Text style={styles.caption}>Pickup</Text>
                    <Text style={styles.address}>{pickup.address}</Text>
                  </View>
                </View>
                <View style={styles.stop}>
                  <Ionicons name="location" size={20} color={colors.brandBrown} />
                  <View style={styles.flex}>
                    <Text style={styles.caption}>Destination</Text>
                    <Text style={styles.address}>{drop.address}</Text>
                  </View>
                </View>
                <Text style={styles.caption}>
                  {(ride.routeSnapshot.distanceM / 1000).toFixed(1)} km · {passengerLabel}
                </Text>
              </View>
              {!inTrip ? (
                <Pressable style={styles.cancel} onPress={onCancel} accessibilityRole="button">
                  <Text style={styles.cancelText}>Cancel ride</Text>
                </Pressable>
              ) : null}
              <Text style={styles.reference}>Ride #{ride.id.slice(0, 8).toUpperCase()}</Text>
            </>
          ) : null}
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  mapButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 10px rgba(58,36,20,0.12)',
  },
  connection: {
    ...typography.caption,
    color: colors.deepBrown,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  mapControls: { position: 'absolute', right: spacing.lg, gap: spacing.md },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    boxShadow: '0 -3px 18px rgba(58,36,20,0.08)',
    overflow: 'hidden',
  },
  grabberTarget: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 40, height: 5, borderRadius: radii.pill, backgroundColor: colors.border },
  sheetScroll: { flex: 1 },
  sheetContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...typography.h1, color: colors.deepBrown },
  subtitle: { ...typography.body, color: colors.secondary, marginTop: spacing.xs },
  rowTitle: { ...typography.bodyBold, color: colors.deepBrown },
  caption: { ...typography.caption, color: colors.secondary },
  otpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderSubtle,
  },
  otp: {
    ...typography.hero,
    color: colors.deepBrown,
    letterSpacing: 5,
    fontVariant: ['tabular-nums'],
  },
  driverActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  driverSummary: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  driverIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: { alignItems: 'center', gap: spacing.xs, minWidth: 56 },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { ...typography.caption, color: colors.deepBrown },
  fareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderColor: colors.borderSubtle,
  },
  fare: { ...typography.h1, color: colors.deepBrown },
  route: {
    gap: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderColor: colors.borderSubtle,
  },
  sectionTitle: { ...typography.h2, color: colors.deepBrown },
  stop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  address: { ...typography.body, color: colors.deepBrown },
  cancel: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  cancelText: { ...typography.bodyBold, color: colors.error },
  reference: { ...typography.caption, color: colors.secondary },
  error: { ...typography.caption, color: colors.error },
});
