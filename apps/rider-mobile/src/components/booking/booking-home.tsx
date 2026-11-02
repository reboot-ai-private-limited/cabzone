import React, { useCallback, useEffect, useState } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radii, spacing, typography } from '@/design-system';
import { ERickshawIcon } from '@/components/common/e-rickshaw-icon';
import { RoutePointIcon } from '@/components/common/route-point-icon';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { SavedRouteTemplate } from '@/services/rider-helpers';
import BookingMap, { type BookingMapProps } from './booking-map';

interface BookingHomeProps {
  pickup: BookingMapProps['pickup'];
  drop: BookingMapProps['drop'];
  stops?: BookingMapProps['stops'];
  routeCoordinates?: BookingMapProps['routeCoordinates'];
  bookingStarted: boolean;
  onSearch: () => void;
  onEditPickup: () => void;
  onChooseDropOnMap?: () => void;
  onChoosePickupOnMap?: () => void;
  onLocate: () => void;
  isLocating: boolean;
  locationError: string | null;
  templates: SavedRouteTemplate[];
  onSelectTemplate: (template: SavedRouteTemplate) => void;
  activeRide: { label: string; onPress: () => void } | null;
  passenger: { label: string; onPress: () => void };
  onBack?: () => void;
  topCard?: React.ReactNode;
  bottomCard?: React.ReactNode;
  children?: React.ReactNode;
}

export function BookingHome({
  pickup,
  drop,
  stops,
  routeCoordinates,
  bookingStarted,
  onSearch,
  onEditPickup,
  onChooseDropOnMap,
  onChoosePickupOnMap,
  onLocate,
  isLocating,
  locationError,
  templates,
  onSelectTemplate,
  activeRide,
  passenger,
  onBack,
  topCard,
  bottomCard,
  children,
}: BookingHomeProps) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [height, setHeight] = useState(700);
  const [expanded, setExpanded] = useState(bookingStarted);
  const [previousBookingStarted, setPreviousBookingStarted] = useState(bookingStarted);
  if (bookingStarted !== previousBookingStarted) {
    setPreviousBookingStarted(bookingStarted);
    setExpanded(bookingStarted);
  }
  const [progress] = useState(() => new Animated.Value(0));
  const open = expanded;
  const collapsedHeight = Math.min(430, height * 0.6);
  const expandedHeight = height * 0.88;

  const animateTo = useCallback(
    (next: boolean) => {
      Animated.timing(progress, {
        toValue: next ? 1 : 0,
        duration: reducedMotion ? 0 : 300,
        useNativeDriver: false,
      }).start();
    },
    [progress, reducedMotion],
  );

  useEffect(() => {
    animateTo(open);
    return () => progress.stopAnimation();
  }, [open, animateTo, progress]);

  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => progress.stopAnimation(),
    onPanResponderMove: (_, gesture) =>
      progress.setValue(
        Math.max(0, Math.min(1, (open ? 1 : 0) - gesture.dy / (expandedHeight - collapsedHeight))),
      ),
    onPanResponderRelease: (_, gesture) => {
      const next =
        Math.abs(gesture.vy) > 0.4
          ? gesture.vy < 0
          : Math.abs(gesture.dy) > 24
            ? gesture.dy < 0
            : open;
      setExpanded(next);
      if (next === open) animateTo(next);
    },
    onPanResponderTerminate: () => animateTo(open),
  });

  const isFloatingPage = bookingStarted && (Boolean(topCard) || Boolean(bottomCard));

  if (isFloatingPage) {
    return (
      <View style={styles.container}>
        {/* Full Screen Map */}
        <BookingMap
          pickup={pickup}
          drop={drop}
          stops={stops}
          routeCoordinates={routeCoordinates}
          fitPadding={{ top: 190, bottom: 300 }}
          bottomInset={0}
          onEditPickup={onEditPickup}
        />

        {/* Top Floating Slot: Pick/Drop component fixed at top */}
        <View style={styles.floatingTopContainer} pointerEvents="box-none">
          {topCard}
        </View>

        {/* Floating Right Controls (Layers + Locate) right above the bottom card */}
        <View style={styles.floatingLocateWrapper} pointerEvents="box-none">
          <Pressable
            style={styles.roundButton}
            accessibilityRole="button"
            accessibilityLabel="Use current location for pickup"
            accessibilityState={{ disabled: isLocating, busy: isLocating }}
            disabled={isLocating}
            onPress={onLocate}
          >
            <Ionicons name="locate-outline" size={24} color={colors.deepBrown} />
          </Pressable>
        </View>

        {/* Bottom Floating Slot: Fare selection / find cab fixed to bottom */}
        <View style={styles.floatingBottomContainer} pointerEvents="box-none">
          {bottomCard || children}
        </View>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}
    >
      <BookingMap
        pickup={pickup}
        drop={bookingStarted ? drop : undefined}
        stops={bookingStarted ? stops : undefined}
        routeCoordinates={bookingStarted ? routeCoordinates : undefined}
        bottomInset={collapsedHeight}
        onEditPickup={onEditPickup}
      />

      <View style={styles.topBar} pointerEvents="box-none">
        <View style={styles.logoPlate}>
          <Image
            source={require('@/assets/brand/cabzone-horizontal.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Cabzone"
          />
        </View>

        <Pressable
          style={styles.homePassengerPill}
          onPress={passenger?.onPress}
          accessibilityRole="button"
          accessibilityLabel={`Passenger: ${passenger.label}`}
        >
          <Ionicons name="person-outline" size={14} color={colors.deepBrown} />
          <Text style={styles.homePassengerText} numberOfLines={1}>
            {passenger.label}
          </Text>
          <Ionicons name="chevron-down" size={12} color={colors.secondary} />
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
        <View style={styles.mapActions} pointerEvents="box-none">
          {activeRide ? (
            <Pressable
              style={styles.activeRide}
              onPress={activeRide.onPress}
              accessibilityRole="button"
            >
              <Ionicons name="car-sport" size={18} color={colors.deepBrown} />
              <Text style={styles.activeRideText} numberOfLines={1}>
                {activeRide.label}
              </Text>
              <Ionicons name="arrow-forward" size={18} color={colors.deepBrown} />
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable
            style={styles.roundButton}
            accessibilityRole="button"
            accessibilityLabel="Use current location for pickup"
            accessibilityState={{ disabled: isLocating, busy: isLocating }}
            disabled={isLocating}
            onPress={onLocate}
          >
            <Ionicons name="locate-outline" size={24} color={colors.deepBrown} />
          </Pressable>
        </View>

        <View {...pan.panHandlers}>
          <Pressable
            style={styles.handleTarget}
            accessibilityRole="button"
            accessibilityLabel={open ? 'Collapse booking sheet' : 'Expand booking sheet'}
            accessibilityState={{ expanded: open }}
            onPress={() => setExpanded(!open)}
          >
            <View style={styles.handle} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {bookingStarted ? (
            <>
              <View style={styles.bookingHeader}>
                <View style={styles.bookingHeaderLeft}>
                  {onBack ? (
                    <Pressable
                      style={styles.backButton}
                      onPress={onBack}
                      accessibilityRole="button"
                      accessibilityLabel="Go back"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
                    </Pressable>
                  ) : null}
                  <Text accessibilityRole="header" style={styles.bookingTitle}>
                    Your ride
                  </Text>
                </View>
                <Pressable
                  style={styles.passenger}
                  onPress={passenger.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={`Passenger: ${passenger.label}`}
                >
                  <Ionicons name="person-outline" size={16} color={colors.deepBrown} />
                  <Text style={styles.passengerText}>{passenger.label}</Text>
                  <Ionicons name="chevron-down" size={14} color={colors.deepBrown} />
                </Pressable>
              </View>
              {children}
            </>
          ) : (
            <>
              <Pressable
                style={styles.search}
                accessibilityRole="button"
                accessibilityLabel="Choose your destination"
                onPress={onSearch}
              >
                <Ionicons name="search" size={24} color={colors.deepBrown} />
                <Text style={styles.searchText}>Where to?</Text>
                <View style={styles.searchArrow}>
                  <Ionicons name="arrow-forward" size={19} color={colors.deepBrown} />
                </View>
              </Pressable>
            
              <View style={styles.pickupRowContainer}>
                <Pressable
                  style={styles.pickup}
                  accessibilityRole="button"
                  accessibilityLabel={`Change pickup: ${pickup.address}`}
                  onPress={onEditPickup}
                >
                  <RoutePointIcon type="pickup" size={20} style={{ marginRight: spacing.md }} />
                  <View style={styles.pickupCopy}>
                    <Text style={styles.pickupLabel}>Pickup</Text>
                    <Text style={styles.pickupAddress} numberOfLines={2}>
                      {pickup.address}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  style={styles.pickupMapButton}
                  accessibilityRole="button"
                  accessibilityLabel="Choose pickup on map"
                  onPress={onChoosePickupOnMap || onEditPickup}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="map-outline" size={18} color={colors.brandBrown} />
                </Pressable>
              </View>
              {locationError && (
                <Text accessibilityRole="alert" style={styles.locationError}>
                  {locationError}
                </Text>
              )}
              {templates.slice(0, 2).map((template) => (
                <Pressable
                  key={template.id}
                  style={styles.savedRoute}
                  accessibilityRole="button"
                  onPress={() => onSelectTemplate(template)}
                >
                  <Ionicons name="bookmark-outline" size={18} color={colors.brandBrown} />
                  <Text style={styles.savedRouteText} numberOfLines={1}>
                    {template.label}
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.secondary} />
                </Pressable>
              ))}
              <View style={styles.services}>
                <Pressable
                  style={styles.cityTile}
                  accessibilityRole="button"
                  accessibilityLabel="Book a city ride"
                  onPress={onSearch}
                >
                  <Text style={styles.tileTitle}>City rides</Text>
                  <Text style={styles.tileCaption}>Book your cab</Text>
                  <Image
                    source={require('@/assets/images/cab.webp')}
                    style={styles.cityCar}
                    resizeMode="contain"
                  />
                </Pressable>
                <View style={styles.serviceColumn}>
                  <Pressable
                    style={styles.intercityTile}
                    accessibilityRole="button"
                    onPress={() => router.navigate('/(rider)/(tabs)/intercity')}
                  >
                    <Ionicons name="trail-sign-outline" size={23} color={colors.brandBrown} />
                    <Text style={styles.smallTileTitle}>City to city</Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.deepBrown} />
                  </Pressable>
                  <View
                    style={styles.soonTile}
                    accessible
                    accessibilityLabel="E-rickshaw, coming soon"
                  >
                    <View style={styles.soonTop}>
                      <ERickshawIcon size={22} color={colors.secondary} />
                      <Text style={styles.soonLabel}>Coming soon</Text>
                    </View>
                    <Text style={styles.smallTileTitle}>E-rickshaw</Text>
                  </View>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  topBar: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  homePassengerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    boxShadow: '0 2px 8px rgba(58,36,20,0.10)',
  },
  homePassengerText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  roundButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(58,36,20,0.10)',
  },
  logoPlate: {
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  logo: { width: 92, height: 30 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    boxShadow: '0 -4px 20px rgba(58,36,20,0.07)',
  },
  mapActions: {
    position: 'absolute',
    bottom: '100%',
    left: spacing.lg,
    right: spacing.lg,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  activeRide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.amber,
    minHeight: 48,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  activeRideText: { ...typography.bodyBold, color: colors.deepBrown, flex: 1 },
  handleTarget: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderSubtle },
  sheetContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
    minHeight: 64,
  },
  searchText: { fontSize: 22, fontWeight: '700', color: colors.deepBrown, flex: 1 },
  searchArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.amber,
  },
  chooseMapQuickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  chooseMapQuickIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chooseMapQuickText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  pickupRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    paddingRight: spacing.sm,
  },
  pickupMapButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
  },
  pickup: {
    flex: 1,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    minHeight: 48,
  },
  pickupDot: {
    width: 12,
    height: 12,
    borderWidth: 3,
    borderColor: colors.brandBrown,
    borderRadius: 6,
  },
  pickupCopy: { flex: 1, gap: 2 },
  pickupLabel: { ...typography.caption, color: colors.secondary },
  pickupAddress: { ...typography.bodyBold, color: colors.deepBrown },
  locationError: { ...typography.caption, color: colors.error },
  savedRoute: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  savedRouteText: { ...typography.body, flex: 1, color: colors.deepBrown },
  services: { flexDirection: 'row', gap: spacing.md, minHeight: 136, marginTop: spacing.xs },
  cityTile: {
    flex: 1.2,
    borderRadius: radii.lg,
    backgroundColor: colors.lightCream,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    overflow: 'hidden',
    minHeight: 136,
  },
  tileTitle: { ...typography.h2, color: colors.deepBrown },
  tileCaption: { ...typography.caption, color: colors.secondary, marginTop: spacing.xs },
  cityCar: { position: 'absolute', bottom: -2, right: -20, width: 160, height: 86 },
  serviceColumn: { flex: 1, gap: spacing.md },
  intercityTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    borderRadius: radii.lg,
    padding: spacing.md,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallTileTitle: { ...typography.bodyBold, color: colors.deepBrown, flexShrink: 1 },
  soonTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  soonTile: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  soonLabel: { ...typography.caption, fontSize: 11, color: colors.secondary },
  floatingTopContainer: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 10,
  },
  floatingLocateWrapper: {
    position: 'absolute',
    right: spacing.md,
    bottom: 245,
    zIndex: 9,
    gap: 12,
  },
  floatingBottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  bookingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingTitle: { ...typography.h1, color: colors.deepBrown },
  passenger: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  passengerText: { ...typography.bodyBold, color: colors.deepBrown },
});
