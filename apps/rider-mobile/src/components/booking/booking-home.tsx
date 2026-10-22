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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radii, spacing, typography } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { SavedRouteTemplate } from '@/services/rider-helpers';
import BookingMap, { type BookingMapProps } from './booking-map';

interface BookingHomeProps {
  pickup: BookingMapProps['pickup'];
  drop: BookingMapProps['drop'];
  bookingStarted: boolean;
  onSearch: () => void;
  onEditPickup: () => void;
  onLocate: () => void;
  isLocating: boolean;
  locationError: string | null;
  templates: SavedRouteTemplate[];
  onSelectTemplate: (template: SavedRouteTemplate) => void;
  activeRide: { label: string; onPress: () => void } | null;
  passenger: { label: string; onPress: () => void };
  children: React.ReactNode;
}

export function BookingHome({
  pickup,
  drop,
  bookingStarted,
  onSearch,
  onEditPickup,
  onLocate,
  isLocating,
  locationError,
  templates,
  onSelectTemplate,
  activeRide,
  passenger,
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
  const collapsedHeight = Math.min(390, height * 0.56);
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

  return (
    <View
      style={styles.container}
      onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}
    >
      <BookingMap
        pickup={pickup}
        drop={bookingStarted ? drop : undefined}
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
                <Text accessibilityRole="header" style={styles.bookingTitle}>
                  Your route
                </Text>
                <Pressable
                  style={styles.passenger}
                  onPress={passenger.onPress}
                  accessibilityRole="button"
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
              <Pressable
                style={styles.pickup}
                accessibilityRole="button"
                accessibilityLabel={`Change pickup: ${pickup.address}`}
                onPress={onEditPickup}
              >
                <View style={styles.pickupDot} />
                <View style={styles.pickupCopy}>
                  <Text style={styles.pickupLabel}>Pickup</Text>
                  <Text style={styles.pickupAddress} numberOfLines={1}>
                    {pickup.address}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
              </Pressable>
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
                  <Text style={styles.tileCaption}>Choose your fare</Text>
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
                    <Ionicons name="bicycle-outline" size={22} color={colors.secondary} />
                    <Text style={styles.smallTileTitle}>E-rickshaw</Text>
                    <Text style={styles.soonLabel}>Coming soon</Text>
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
    justifyContent: 'flex-start',
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
  pickup: {
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
  services: { flexDirection: 'row', gap: spacing.md, minHeight: 166, marginTop: spacing.xs },
  cityTile: {
    flex: 1.2,
    borderRadius: radii.lg,
    backgroundColor: colors.lightCream,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    overflow: 'hidden',
    minHeight: 166,
  },
  tileTitle: { ...typography.h2, color: colors.deepBrown },
  tileCaption: { ...typography.caption, color: colors.secondary, marginTop: spacing.xs },
  cityCar: { position: 'absolute', bottom: -4, right: -24, width: 190, height: 102 },
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
  soonTile: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  soonLabel: { ...typography.caption, fontSize: 11, color: colors.secondary },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  bookingTitle: { ...typography.h1, color: colors.deepBrown },
  passenger: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  passengerText: { ...typography.bodyBold, color: colors.deepBrown },
});
