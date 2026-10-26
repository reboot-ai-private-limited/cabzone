import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Image,
  Linking,
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
import type { RiderRideViewDto } from '@/services/api';
import { formatAssignedDriverSummary, formatRupeesFromPaise } from '@/services/rider-helpers';
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
  onCallDriver?: ((phoneE164: string) => void) | undefined;
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
  onCallDriver,
}: OngoingRideViewProps) {
  const reducedMotion = useReducedMotion();
  const [height, setHeight] = useState(700);
  const [expanded, setExpanded] = useState(false);
  const [routeOverview, setRouteOverview] = useState(false);
  const [cameraVersion, setCameraVersion] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [progress] = useState(() => new Animated.Value(0));
  const inTrip = ride.status === 'TRIP_STARTED';
  const arrived = ride.status === 'DRIVER_ARRIVED';
  const showRoute = inTrip || routeOverview;
  const collapsedHeight = arrived
    ? Math.min(500, height * 0.65)
    : inTrip
      ? Math.min(460, height * 0.6)
      : Math.min(420, height * 0.55);
  const expandedHeight = Math.max(collapsedHeight + 1, height - 72);
  const fare = ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise;
  const pickup = { ...ride.pickup, address: ride.pickup.address || 'Pickup location' };
  const drop = { ...ride.drop, address: ride.drop.address || 'Destination' };
  const driverInfo = useMemo(() => formatAssignedDriverSummary(ride), [ride]);
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
  const arrivalTime = ride.arrivedAt ? Date.parse(ride.arrivedAt) : NaN;
  const waitingSeconds =
    arrived && Number.isFinite(arrivalTime) && arrivalTime <= now
      ? Math.floor((now - arrivalTime) / 1000)
      : null;
  const startTime = ride.startedAt ? Date.parse(ride.startedAt) : NaN;
  const tripMinutes =
    inTrip && Number.isFinite(startTime) && startTime <= now
      ? Math.floor((now - startTime) / 60_000)
      : null;
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
    const timer = setInterval(() => setNow(Date.now()), arrived ? 1000 : 5000);
    return () => clearInterval(timer);
  }, [arrived]);

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

  const handleCallDriver = useCallback(() => {
    if (!driverInfo.phoneE164) return;
    if (onCallDriver) {
      onCallDriver(driverInfo.phoneE164);
      return;
    }
    void Linking?.openURL?.(`tel:${driverInfo.phoneE164}`);
  }, [driverInfo.phoneE164, onCallDriver]);

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

  const pickupCode =
    !inTrip && ride.pickupOtp ? (
      <View style={styles.otpRow}>
        <View style={styles.flex}>
          <Text style={styles.rowTitle}>Pickup code</Text>
          <Text style={styles.caption}>Share only when you meet your driver</Text>
        </View>
        <Text
          style={styles.otp}
          accessibilityLabel={`Pickup code ${ride.pickupOtp.split('').join(' ')}`}
        >
          {ride.pickupOtp}
        </Text>
      </View>
    ) : null;

  const shareAction = (
    <Pressable
      style={styles.detailAction}
      onPress={onShare}
      accessibilityRole="button"
      accessibilityLabel="Share trip"
    >
      <Ionicons name="share-social-outline" size={22} color={colors.deepBrown} />
      <Text style={[styles.rowTitle, styles.flex]}>Share trip</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.secondary} />
    </Pressable>
  );

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
        {inTrip ? (
          <Pressable
            style={styles.mapButton}
            onPress={onShare}
            accessibilityRole="button"
            accessibilityLabel="Share trip"
          >
            <Ionicons name="share-social-outline" size={23} color={colors.deepBrown} />
          </Pressable>
        ) : null}
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
              <Text style={styles.vehicle}>{driverInfo.vehicleLabel}</Text>
            </View>
            <View style={styles.vehicleIdentity}>
              <Ionicons name="car-sport-outline" size={32} color={colors.deepBrown} />
              {driverInfo.registrationNumber ? (
                <View style={styles.plateBadge}>
                  <Text
                    style={styles.plateText}
                    accessibilityLabel={`Vehicle number ${driverInfo.registrationNumber}`}
                  >
                    {driverInfo.registrationNumber}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          {inTrip ? (
            <View style={styles.arrival}>
              <View style={styles.stop}>
                <Ionicons name="location-outline" size={22} color={colors.brandBrown} />
                <View style={styles.flex}>
                  <Text style={styles.caption}>Heading to</Text>
                  <Text style={styles.destination}>{drop.address}</Text>
                </View>
              </View>
              <View style={styles.tripFacts}>
                <Text style={styles.caption}>
                  {`${(ride.routeSnapshot.distanceM / 1000).toFixed(1)} km booked route`}
                </Text>
                {tripMinutes !== null ? (
                  <Text
                    style={styles.caption}
                    accessibilityLabel={`Trip time ${tripMinutes} minutes`}
                  >
                    {tripMinutes === 0 ? 'Trip just started' : `Trip time · ${tripMinutes} min`}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : arrived ? (
            <>
              <View style={styles.arrival}>
                <View style={styles.stop}>
                  <Ionicons name="location-outline" size={22} color={colors.brandBrown} />
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>Meet at your pickup</Text>
                    <Text style={styles.address}>{pickup.address}</Text>
                  </View>
                </View>
                {waitingSeconds !== null ? (
                  <View style={styles.waitingRow}>
                    <Text style={styles.caption}>Driver waiting</Text>
                    <Text
                      style={styles.waitingTime}
                      accessibilityLabel={`Driver waiting for ${Math.floor(waitingSeconds / 60)} minutes and ${waitingSeconds % 60} seconds`}
                    >
                      {`${Math.floor(waitingSeconds / 60)}:${String(waitingSeconds % 60).padStart(2, '0')}`}
                    </Text>
                  </View>
                ) : null}
              </View>
              {pickupCode}
            </>
          ) : (
            <Text style={styles.caption}>{subtitle}</Text>
          )}

          <View style={styles.driverActions}>
            <View style={styles.driverSummary}>
              <View style={styles.driverIcon}>
                {driverInfo.profilePhotoUrl ? (
                  <Image
                    source={{ uri: driverInfo.profilePhotoUrl }}
                    style={styles.driverPhoto}
                    accessibilityLabel={`${driverInfo.driverName} photo`}
                  />
                ) : (
                  <Ionicons name="person-outline" size={21} color={colors.deepBrown} />
                )}
              </View>
              <Text style={styles.driverName}>{driverInfo.driverName}</Text>
              <Text style={styles.caption}>{`★ ${driverInfo.ratingLabel || 'New'}`}</Text>
            </View>
            {driverInfo.phoneE164 ? (
              <Pressable
                style={styles.action}
                onPress={handleCallDriver}
                accessibilityRole="button"
                accessibilityLabel="Call driver"
              >
                <View style={styles.actionIcon}>
                  <Ionicons name="call-outline" size={22} color={colors.deepBrown} />
                </View>
                <Text style={styles.actionLabel}>Contact driver</Text>
              </Pressable>
            ) : null}
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

          {!arrived ? pickupCode : null}

          {!locationFresh ? (
            <Text style={styles.caption} accessibilityLiveRegion="polite">
              {!driverLocation
                ? 'Waiting for driver location'
                : 'Location update delayed · showing last known position'}
            </Text>
          ) : null}

          <View style={styles.fareRow}>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>UPI payment</Text>
              <Text style={styles.caption}>Pay in Cabzone after the trip</Text>
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
              {!inTrip ? shareAction : null}
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
  sheetContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  title: { ...typography.h1, color: colors.deepBrown },
  vehicle: { ...typography.body, color: colors.deepBrown, marginTop: spacing.sm },
  vehicleIdentity: { alignItems: 'center', gap: spacing.sm, maxWidth: '45%' },
  rowTitle: { ...typography.bodyBold, color: colors.deepBrown },
  caption: { ...typography.caption, color: colors.secondary },
  arrival: { gap: spacing.md },
  destination: { ...typography.h2, color: colors.deepBrown },
  tripFacts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  waitingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  waitingTime: { ...typography.h2, color: colors.deepBrown, fontVariant: ['tabular-nums'] },
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
    ...typography.h1,
    color: colors.deepBrown,
    letterSpacing: 5,
    fontVariant: ['tabular-nums'],
  },
  driverActions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.borderSubtle,
  },
  driverSummary: { flex: 1, alignItems: 'center', gap: spacing.sm },
  driverName: { ...typography.caption, color: colors.deepBrown, textAlign: 'center' },
  driverIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  driverPhoto: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  plateBadge: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  plateText: {
    ...typography.bodyBold,
    color: colors.deepBrown,
    letterSpacing: 0.6,
  },
  action: { flex: 1, alignItems: 'center', gap: spacing.sm, minHeight: 76 },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { ...typography.caption, color: colors.deepBrown, textAlign: 'center' },
  detailAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
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
