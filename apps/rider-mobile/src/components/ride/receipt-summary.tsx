import React, { useMemo, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { decodePolyline } from '@cabzone/geo';
import type { RideDto, RideEventDto } from '@cabzone/contracts';
import BookingMap from '@/components/booking/booking-map';
import { colors, spacing, typography } from '@/design-system';
import { rideReceipt } from '@/services/ride-receipt';

const milestoneLabels: Record<string, string> = {
  REQUESTED: 'Ride requested',
  DRIVER_ASSIGNED: 'Driver assigned',
  DRIVER_EN_ROUTE: 'Driver on the way',
  DRIVER_ARRIVED: 'Driver arrived',
  TRIP_STARTED: 'Trip started',
  TRIP_COMPLETED: 'Trip completed',
  PAYMENT_CONFIRMED: 'Payment confirmed',
  CANCELLED: 'Ride cancelled',
  PAYMENT_DISPUTED: 'Payment under review',
  PAYMENT_DISPUTE_RESOLVED: 'Payment issue resolved',
};

export function ReceiptSummary({
  ride,
  events,
  onReceipt,
  onSupport,
  onRepeat,
  onReturn,
  children,
}: {
  ride: RideDto;
  events: RideEventDto[];
  onReceipt: () => void;
  onSupport: () => void;
  onRepeat: () => void;
  onReturn: () => void;
  children?: ReactNode;
}) {
  const receipt = rideReceipt(ride, events);
  const milestones = events.filter((event) => milestoneLabels[event.eventType]);
  const coordinates = useMemo(() => {
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
  const actions = [
    { label: 'Receipt', icon: 'receipt-outline' as const, onPress: onReceipt },
    { label: 'Support', icon: 'chatbubbles-outline' as const, onPress: onSupport },
    { label: 'Repeat ride', icon: 'refresh-outline' as const, onPress: onRepeat },
    { label: 'Return route', icon: 'swap-horizontal-outline' as const, onPress: onReturn },
  ];
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.date} accessibilityRole="header">
        {receipt.date}
      </Text>
      <View style={styles.map} accessibilityLabel="Booked pickup to destination route">
        <BookingMap
          pickup={{ ...ride.pickup, address: receipt.pickup }}
          drop={{ ...ride.drop, address: receipt.drop }}
          routeCoordinates={coordinates}
          bottomInset={0}
          readOnly
        />
      </View>
      <View style={styles.section}>
        <View style={styles.stop}>
          <View style={[styles.dot, styles.pickupDot]} />
          <Text style={styles.address}>{receipt.pickup}</Text>
          <Text style={styles.time}>{receipt.pickupTime}</Text>
        </View>
        <View style={styles.stop}>
          <View style={styles.dot} />
          <Text style={styles.address}>{receipt.drop}</Text>
          <Text style={styles.time}>{receipt.dropTime}</Text>
        </View>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Ionicons name="time-outline" size={23} color={colors.deepBrown} />
            <View>
              <Text style={styles.caption}>{receipt.durationLabel}</Text>
              <Text style={styles.value}>{receipt.duration}</Text>
            </View>
          </View>
          <View style={styles.stat}>
            <Ionicons name="git-compare-outline" size={23} color={colors.deepBrown} />
            <View>
              <Text style={styles.caption}>Route distance</Text>
              <Text style={styles.value}>{receipt.distance}</Text>
            </View>
          </View>
        </View>
      </View>
      {receipt.driver ? (
        <View style={[styles.section, styles.driver]}>
          {receipt.driver.profilePhotoUrl ? (
            <Image
              source={{ uri: receipt.driver.profilePhotoUrl }}
              style={styles.avatar}
              accessibilityLabel={`${receipt.driver.driverName} photo`}
            />
          ) : (
            <View style={styles.avatar}>
              <Ionicons name="person-outline" size={24} color={colors.deepBrown} />
            </View>
          )}
          <View style={styles.flex}>
            <Text style={styles.value}>
              {receipt.driver.ratingLabel
                ? `${receipt.driver.driverName} · ★ ${receipt.driver.ratingLabel}`
                : receipt.driver.driverName}
            </Text>
            <Text style={styles.caption}>{receipt.driver.vehicleLabel}</Text>
            {receipt.driver.registrationNumber ? (
              <Text style={styles.plate}>{receipt.driver.registrationNumber}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
      <View style={[styles.section, styles.actions]}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            style={styles.action}
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <View style={styles.actionIcon}>
              <Ionicons name={action.icon} size={23} color={colors.deepBrown} />
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.section}>
        <Text style={styles.title}>{receipt.paid ? 'Payment' : 'Fare'}</Text>
        <View style={styles.moneyRow}>
          <Text style={styles.body}>{receipt.paid ? 'Recorded fare' : 'Agreed fare'}</Text>
          <Text style={styles.total}>{receipt.amount}</Text>
        </View>
        <View style={styles.moneyRow}>
          <Text style={styles.caption}>{receipt.payment}</Text>
          <Text style={styles.paymentStatus}>{receipt.status}</Text>
        </View>
        {receipt.testPayment ? (
          <Text style={styles.caption}>Test payment · No money was charged</Text>
        ) : null}
        <Text style={styles.reference}>Ride {receipt.reference}</Text>
      </View>
      {milestones.length ? (
        <View style={styles.section}>
          <Text style={styles.title}>Trip activity</Text>
          {milestones.map((event) => (
            <View key={event.id} style={styles.moneyRow}>
              <Text style={styles.body}>{milestoneLabels[event.eventType]}</Text>
              <Text style={styles.caption}>
                {new Date(event.createdAt).toLocaleTimeString('en-IN', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32, backgroundColor: colors.white },
  flex: { flex: 1 },
  date: { ...typography.h2, color: colors.deepBrown, padding: spacing.xl },
  map: { height: 210, marginHorizontal: spacing.xl, borderRadius: 16, overflow: 'hidden' },
  section: {
    padding: spacing.xl,
    gap: spacing.lg,
    borderBottomWidth: 1,
    borderColor: colors.borderSubtle,
  },
  stop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  dot: { width: 10, height: 10, marginTop: 6, borderRadius: 5, backgroundColor: colors.brandBrown },
  pickupDot: { backgroundColor: colors.success },
  address: { ...typography.bodyBold, color: colors.deepBrown, flex: 1 },
  time: { ...typography.caption, color: colors.secondary, maxWidth: '30%', textAlign: 'right' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxl, paddingTop: spacing.md },
  stat: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexGrow: 1 },
  caption: { ...typography.caption, color: colors.secondary, flexShrink: 1 },
  value: { ...typography.bodyBold, color: colors.deepBrown },
  driver: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  plate: { ...typography.label, color: colors.deepBrown, marginTop: 4 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  action: { flex: 1, minWidth: 64, alignItems: 'center', gap: spacing.sm },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: { ...typography.caption, color: colors.deepBrown, textAlign: 'center' },
  title: { ...typography.h2, color: colors.deepBrown },
  body: { ...typography.body, color: colors.deepBrown, flexShrink: 1 },
  moneyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  total: { ...typography.h1, color: colors.deepBrown },
  paymentStatus: { ...typography.bodyBold, color: colors.deepBrown },
  reference: { ...typography.caption, color: colors.secondary, marginTop: spacing.sm },
});
