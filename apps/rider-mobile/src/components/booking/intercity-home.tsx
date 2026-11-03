import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography, createStyles } from '@/design-system';
import type { SavedRouteTemplate } from '@/services/rider-helpers';
import { formatApproxKm, type IntercityDestination } from './intercity-routes';

export type RouteHomeVariant = 'CITY' | 'INTERCITY';

const COPY: Record<
  RouteHomeVariant,
  {
    title: string;
    subtitle: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    toPlaceholder: string;
    toLabel: string;
    sectionLabel: string;
    switchText: string;
    switchLabel: string;
    switchIcon: React.ComponentProps<typeof Ionicons>['name'];
  }
> = {
  CITY: {
    title: 'City rides',
    subtitle: 'Book a cab and choose your fare.',
    icon: 'car-sport',
    toPlaceholder: 'Where to?',
    toLabel: 'Choose your destination',
    sectionLabel: 'POPULAR PLACES',
    switchText: 'Going to another city? Book city to city',
    switchLabel: 'Book a city to city ride instead',
    switchIcon: 'trail-sign-outline',
  },
  INTERCITY: {
    title: 'City to city',
    subtitle: 'Travel to another city. Set your own fare.',
    icon: 'trail-sign',
    toPlaceholder: 'Which city are you going to?',
    toLabel: 'Choose your destination city',
    sectionLabel: 'POPULAR ROUTES',
    switchText: 'Going within the city? Book a city ride',
    switchLabel: 'Book a ride within the city instead',
    switchIcon: 'car-sport-outline',
  },
};

export interface IntercityHomeContentProps {
  /** Extra content between the route card / popular cards and the saved routes. */
  middle?: React.ReactNode;
  /** Show the link that opens the other tab (default true). */
  showSwitch?: boolean;
  /** Which tab this sheet belongs to; defaults to city-to-city. */
  variant?: RouteHomeVariant;
  pickup: { address: string };
  destinations: IntercityDestination[];
  locationError: string | null;
  onOpenLocationSettings?: (() => void) | undefined;
  templates: SavedRouteTemplate[];
  onSearch: () => void;
  onEditPickup: () => void;
  onChoosePickupOnMap?: (() => void) | undefined;
  onSelectDestination: (destination: IntercityDestination) => void;
  onSelectTemplate: (template: SavedRouteTemplate) => void;
  /** Opens the other tab (city rides from city-to-city, and the reverse). */
  onSwitchMode: () => void;
}

/**
 * City-to-city home sheet. Same bones as city rides (pickup row, search, saved routes) with the
 * route shown as From / To, and popular destination cities one tap away.
 */
export function IntercityHomeContent({
  variant = 'INTERCITY',
  middle,
  showSwitch = true,
  pickup,
  destinations,
  locationError,
  onOpenLocationSettings,
  templates,
  onSearch,
  onEditPickup,
  onChoosePickupOnMap,
  onSelectDestination,
  onSelectTemplate,
  onSwitchMode,
}: IntercityHomeContentProps) {
  const copy = COPY[variant];
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerBadge}>
          <Ionicons name={copy.icon} size={18} color={colors.brandBrown} />
        </View>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            {copy.title}
          </Text>
          <Text style={styles.subtitle}>{copy.subtitle}</Text>
        </View>
      </View>

      <View style={styles.routeCard}>
        <View style={styles.timeline} accessibilityElementsHidden importantForAccessibility="no">
          <View style={styles.dotFrom} />
          <View style={styles.dashes}>
            <View style={styles.dash} />
            <View style={styles.dash} />
            <View style={styles.dash} />
          </View>
          <Ionicons name="location" size={16} color={colors.brandBrown} />
        </View>

        <View style={styles.stops}>
          <View style={styles.stopRow}>
            <Pressable
              style={styles.stopMain}
              accessibilityRole="button"
              accessibilityLabel={`Change pickup: ${pickup.address}`}
              onPress={onEditPickup}
            >
              <Text style={styles.stopLabel}>FROM</Text>
              <Text style={styles.stopValue} numberOfLines={1}>
                {pickup.address}
              </Text>
            </Pressable>
            <Pressable
              style={styles.mapButton}
              accessibilityRole="button"
              accessibilityLabel="Choose pickup on map"
              onPress={onChoosePickupOnMap ?? onEditPickup}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="map-outline" size={16} color={colors.brandBrown} />
            </Pressable>
          </View>

          <View style={styles.divider} />

          <Pressable
            style={styles.stopRow}
            accessibilityRole="button"
            accessibilityLabel={copy.toLabel}
            onPress={onSearch}
          >
            <View style={styles.stopMain}>
              <Text style={styles.stopLabel}>TO</Text>
              <Text style={styles.stopPlaceholder} numberOfLines={1}>
                {copy.toPlaceholder}
              </Text>
            </View>
            <View style={styles.searchArrow}>
              <Ionicons name="arrow-forward" size={16} color={colors.deepBrown} />
            </View>
          </Pressable>
        </View>
      </View>

      {locationError ? (
        <View style={styles.errorRow}>
          <Text accessibilityRole="alert" style={styles.error}>
            {locationError}
          </Text>
          {onOpenLocationSettings ? (
            <Pressable
              style={styles.settingsButton}
              accessibilityRole="button"
              accessibilityLabel="Open location settings"
              onPress={onOpenLocationSettings}
            >
              <Ionicons name="settings-outline" size={14} color={colors.deepBrown} />
              <Text style={styles.settingsText}>Open settings</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {destinations.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{copy.sectionLabel}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cards}
            keyboardShouldPersistTaps="handled"
          >
            {destinations.map((destination) => (
              <Pressable
                key={destination.id}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Ride to ${destination.title}, ${formatApproxKm(destination.distanceKm)}`}
                onPress={() => onSelectDestination(destination)}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardIcon}>
                    <Ionicons name="navigate" size={16} color={colors.brandBrown} />
                  </View>
                  <Text style={styles.cardDistance}>{formatApproxKm(destination.distanceKm)}</Text>
                </View>
                <Text style={styles.cardCity} numberOfLines={1}>
                  {destination.title}
                </Text>
                <Text style={styles.cardState} numberOfLines={1}>
                  {destination.caption}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {middle}

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

      {showSwitch ? (
        <Pressable
          style={styles.switchRow}
          accessibilityRole="button"
          accessibilityLabel={copy.switchLabel}
          onPress={onSwitchMode}
        >
          <Ionicons name={copy.switchIcon} size={20} color={colors.deepBrown} />
          <Text style={styles.switchText}>{copy.switchText}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = createStyles(() => ({
  root: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerBadge: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    backgroundColor: '#FFF3D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1 },
  title: { fontSize: 17, lineHeight: 21, fontWeight: '800', color: colors.deepBrown },
  subtitle: { fontSize: 12, lineHeight: 15, color: colors.secondary },
  routeCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeline: { alignItems: 'center', paddingTop: 15, paddingBottom: 12, width: 16 },
  dotFrom: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 2.5,
    borderColor: colors.success,
    backgroundColor: colors.white,
  },
  dashes: { flex: 1, justifyContent: 'space-evenly', alignItems: 'center', paddingVertical: 4 },
  dash: { width: 2, height: 5, borderRadius: 1, backgroundColor: colors.border },
  stops: { flex: 1 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 40 },
  // FROM / TO sits inline with its value so each stop is one line.
  stopMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  stopLabel: { width: 36, fontSize: 10, fontWeight: '800', color: colors.brandBrown, letterSpacing: 0.6 },
  stopValue: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.deepBrown },
  stopPlaceholder: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.muted },
  divider: { height: 1, backgroundColor: colors.borderSubtle },
  mapButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorRow: { gap: spacing.sm },
  error: { ...typography.caption, color: colors.error },
  settingsButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  settingsText: { fontSize: 13, fontWeight: '700', color: colors.deepBrown },
  section: { gap: spacing.sm },
  sectionLabel: { ...typography.caption, fontWeight: '700', color: colors.secondary, letterSpacing: 0.8 },
  cards: { gap: spacing.md, paddingRight: spacing.lg },
  card: {
    width: 148,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: '#FFF9EC',
    borderWidth: 1,
    borderColor: '#F6E3B4',
    gap: 2,
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cardIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDistance: { ...typography.caption, fontWeight: '700', color: colors.deepBrown },
  cardCity: { fontSize: 18, fontWeight: '800', color: colors.deepBrown },
  cardState: { ...typography.caption, color: colors.secondary },
  savedRoute: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  savedRouteText: { ...typography.body, flex: 1, color: colors.deepBrown },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  switchText: { ...typography.body, flex: 1, color: colors.deepBrown },
}));
