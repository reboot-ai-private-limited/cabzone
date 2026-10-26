import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { RideEventDto } from '@cabzone/contracts';
import { useRide } from '@/context/ride-context';
import type { RiderRideViewDto } from '@/services/api';
import { rideReceipt } from '@/services/ride-receipt';
import { ReceiptSummary } from '@/components/ride/receipt-summary';
import { ReceiptPreview } from '@/components/ride/receipt-preview';
import { RideRatingCard } from '@/components/ride/ride-rating-card';
import { colors, radii, spacing, typography } from '@/design-system';

export default function RideReceiptDetailScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const router = useRouter();
  const { refreshRideById, disputePayment, setBookingDraft } = useRide();

  const [ride, setRide] = useState<RiderRideViewDto | null>(null);
  const [events, setEvents] = useState<RideEventDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [disputeText, setDisputeText] = useState('');
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const receipt = useMemo(() => (ride ? rideReceipt(ride, events) : null), [ride, events]);

  const loadDetail = useCallback(async () => {
    if (!rideId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await refreshRideById(rideId);
      if (res) {
        setRide(res.ride);
        setEvents(res.events);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load receipt.');
    } finally {
      setIsLoading(false);
    }
  }, [refreshRideById, rideId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadDetail();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadDetail]);

  const handleDispute = async () => {
    if (!ride) return;
    if (disputeText.trim().length < 10) {
      setError('Please enter at least 10 characters explaining the payment issue.');
      return;
    }
    setIsSubmittingDispute(true);
    setError(null);
    try {
      const updated = await disputePayment(ride.id, disputeText.trim());
      setRide(updated);
      setDisputeText('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not file payment dispute.');
    } finally {
      setIsSubmittingDispute(false);
    }
  };

  const handleBookRoute = (reverse: boolean) => {
    if (!ride) return;
    const mode =
      ride.zoneSnapshot?.classification === 'OUTSTATION' ||
      ride.zoneSnapshot?.classification === 'INTERSTATE'
        ? 'OUTSTATION'
        : 'IN_CITY';

    const pickupLoc = {
      lat: ride.pickup.lat,
      lng: ride.pickup.lng,
      address: ride.pickup.address || 'Pickup location',
    };
    const dropLoc = {
      lat: ride.drop.lat,
      lng: ride.drop.lng,
      address: ride.drop.address || 'Destination',
    };

    setBookingDraft({
      mode,
      pickup: reverse ? dropLoc : pickupLoc,
      drop: reverse ? pickupLoc : dropLoc,
    });
    router.push(mode === 'OUTSTATION' ? '/(rider)/(tabs)/intercity' : '/(rider)/(tabs)/home');
  };

  if (isLoading && !ride)
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.deepBrown} />
      </SafeAreaView>
    );
  if (!ride || !receipt)
    return (
      <SafeAreaView style={styles.loading}>
        <Text style={styles.title}>Trip details unavailable</Text>
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Pressable
          style={styles.button}
          onPress={() => void loadDetail()}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.buttonText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          style={styles.iconButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to Activity"
        >
          <Ionicons name="arrow-back" size={22} color={colors.deepBrown} />
        </Pressable>
        <Text style={styles.title}>Your trip</Text>
        <Pressable
          style={styles.iconButton}
          onPress={() => void loadDetail()}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Refresh trip details"
        >
          {isLoading ? (
            <ActivityIndicator color={colors.deepBrown} />
          ) : (
            <Ionicons name="refresh-outline" size={22} color={colors.deepBrown} />
          )}
        </Pressable>
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <ReceiptSummary
        ride={ride}
        events={events}
        onReceipt={() => setShowReceipt(true)}
        onSupport={() => router.push('/(rider)/account/support')}
        onRepeat={() => handleBookRoute(false)}
        onReturn={() => handleBookRoute(true)}
      >
        {ride.status === 'SETTLED' ? (
          <View style={styles.ratingContainer}>
            <RideRatingCard
              rideId={ride.id}
              driverName={receipt.driver?.driverName || 'your driver'}
            />
          </View>
        ) : null}
        {ride.status === 'SETTLED' || ride.status === 'PAYMENT_CONFIRMED' ? (
          <View style={styles.dispute}>
            <Text style={styles.title}>Report a payment issue</Text>
            <Text style={styles.body}>
              Tell us what happened. Cabzone support will review your ride and payment.
            </Text>
            <TextInput
              style={styles.input}
              accessibilityLabel="Describe payment issue"
              placeholder="Describe the issue (at least 10 characters)"
              placeholderTextColor={colors.secondary}
              multiline
              value={disputeText}
              onChangeText={setDisputeText}
              editable={!isSubmittingDispute}
            />
            <Pressable
              style={styles.button}
              onPress={() => void handleDispute()}
              disabled={isSubmittingDispute || disputeText.trim().length < 10}
              accessibilityRole="button"
              accessibilityState={{
                disabled: isSubmittingDispute || disputeText.trim().length < 10,
                busy: isSubmittingDispute,
              }}
            >
              {isSubmittingDispute ? (
                <ActivityIndicator color={colors.deepBrown} />
              ) : (
                <Text style={styles.buttonText}>Submit issue</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </ReceiptSummary>
      {showReceipt ? (
        <ReceiptPreview receipt={receipt} onClose={() => setShowReceipt(false)} />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  iconButton: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  title: { ...typography.h2, color: colors.deepBrown },
  body: { ...typography.body, color: colors.secondary },
  error: { ...typography.caption, color: colors.error, padding: spacing.md },
  ratingContainer: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  dispute: { padding: spacing.xl, gap: spacing.md },
  input: {
    minHeight: 96,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    color: colors.deepBrown,
    textAlignVertical: 'top',
  },
  button: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: { ...typography.bodyBold, color: colors.deepBrown },
});
