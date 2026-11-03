import type { ProposeRideExtensionRequestDto, RideDto } from '@cabzone/contracts';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BookingMap from '@/components/booking/booking-map';
import { useAuth } from '@/context/auth-context';
import { geoAndPricingApi, riderRidesApi } from '@/services/api';
import { createBookingIdempotencyKey, formatRupeesFromPaise } from '@/services/rider-helpers';
import { colors, spacing, typography, createStyles } from '@/design-system';

export function RideExtensionPanel({
  ride,
  onRefresh,
}: {
  ride: RideDto;
  onRefresh: () => void | Promise<void>;
}) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState<RideDto['drop'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const selecting = useRef(0);
  const submitting = useRef(false);
  const intent = useRef<ProposeRideExtensionRequestDto | null>(null);
  const proposal = ride.extensionProposal;
  if (ride.status !== 'TRIP_STARTED') return null;
  const pending = proposal?.status === 'REQUESTED' && Date.parse(proposal.expiresAt) > now;
  const select = async (lat: number, lng: number) => {
    if (submitting.current) return;
    const selection = ++selecting.current;
    intent.current = null;
    const selected = { lat, lng, address: 'Selected destination' };
    setPoint(selected);
    try {
      const result = await geoAndPricingApi.reverseGeocode(token, lat, lng);
      if (selection === selecting.current && !submitting.current)
        setPoint({
          ...selected,
          address:
            result.formattedAddress ||
            [result.city, result.state].filter(Boolean).join(', ') ||
            selected.address,
        });
    } catch {
      /* The map pin remains usable when its address is unavailable. */
    }
  };
  const submit = async () => {
    if (!token || !point || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    intent.current ??= { requestId: createBookingIdempotencyKey(), newDrop: point };
    try {
      await riderRidesApi.proposeExtension(token, ride.id, intent.current);
      setOpen(false);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to request an extension.');
      void onRefresh();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <View style={styles.panel}>
      {proposal ? (
        <Text style={styles.body} accessibilityLiveRegion="polite">
          {pending
            ? `Waiting for driver approval: ${proposal.newDrop.address || 'New destination'}, +${formatRupeesFromPaise(proposal.additionalFarePaise)} for ${(proposal.additionalDistanceM / 1000).toFixed(1)} km.`
            : proposal.status === 'ACCEPTED'
              ? 'Destination extension accepted. Your fare and route are updated.'
              : proposal.status === 'REJECTED'
                ? 'Driver declined. Your agreed destination and fare still apply.'
                : 'Extension proposal expired. Your agreed destination and fare still apply.'}
        </Text>
      ) : null}
      {!pending ? (
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() => {
            setPoint(null);
            intent.current = null;
            setError(null);
            setOpen(true);
          }}
        >
          <Text style={styles.buttonText}>Extend destination</Text>
        </Pressable>
      ) : null}
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => {
          if (!busy) setOpen(false);
        }}
      >
        <SafeAreaView style={styles.screen}>
          <Text style={styles.title}>Choose a new destination</Text>
          <Text style={styles.body}>
            Tap the map to choose a farther destination. Only extra driving distance is charged;
            your driver must approve the quoted addition.
          </Text>
          <View
            style={styles.map}
            accessibilityLabel="Tap the map to choose the extension destination"
          >
            <BookingMap
              pickup={{ ...ride.drop, address: ride.drop.address || 'Agreed destination' }}
              {...(point
                ? { drop: { ...point, address: point.address || 'Selected destination' } }
                : {})}
              bottomInset={0}
              onSelectPoint={(lat, lng) => void select(lat, lng)}
            />
          </View>
          <Text style={styles.body}>{point?.address || 'Select a point on the map.'}</Text>
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={!point || busy}
            accessibilityState={{ disabled: !point || busy, busy }}
            style={[styles.button, (!point || busy) && styles.disabled]}
            onPress={() => void submit()}
          >
            <Text style={styles.buttonText}>
              {busy ? 'Calculating extension…' : 'Request extension quote'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={styles.button}
            onPress={() => setOpen(false)}
          >
            <Text style={styles.buttonText}>Keep current destination</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const styles = createStyles(() => ({
  panel: { gap: spacing.sm },
  screen: { flex: 1, backgroundColor: colors.white, padding: spacing.lg, gap: spacing.md },
  title: { ...typography.h2, color: colors.deepBrown },
  body: { ...typography.caption, color: colors.secondary },
  map: { flex: 1, minHeight: 240, overflow: 'hidden', borderRadius: 12 },
  button: {
    minHeight: 48,
    justifyContent: 'center',
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  buttonText: { ...typography.bodyBold, color: colors.deepBrown, textAlign: 'center' },
  disabled: { opacity: 0.45 },
  error: { ...typography.caption, color: colors.error },
}));
