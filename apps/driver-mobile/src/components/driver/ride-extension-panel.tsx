import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RideDto } from '@cabzone/contracts';
import { useAuth } from '@/context/auth-context';
import { ridesApi } from '@/services/api';
import { colors, spacing, typography } from '@/design-system';

export function RideExtensionPanel({
  ride,
  onRefresh,
}: {
  ride: RideDto;
  onRefresh: () => void | Promise<void>;
}) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);
  const proposal = ride.extensionProposal;
  useEffect(() => {
    if (proposal?.status !== 'REQUESTED') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [proposal?.id, proposal?.status]);
  if (ride.status !== 'TRIP_STARTED' || !proposal) return null;
  const expired = Date.parse(proposal.expiresAt) <= now;
  const respond = async (decision: 'ACCEPT' | 'REJECT') => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await ridesApi.respondExtension(token, ride.id, proposal.id, decision);
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to respond. Refresh the trip and retry.',
      );
      void onRefresh();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Destination extension</Text>
      <Text style={styles.body}>
        {proposal.newDrop.address || 'New destination'} · +
        {(proposal.additionalDistanceM / 1000).toFixed(1)} km · +₹
        {(proposal.additionalFarePaise / 100).toFixed(2)} fare
      </Text>
      <Text style={styles.body}>
        Your net addition after commission: ₹
        {(
          (proposal.additionalFarePaise * (1 - ride.pricingSnapshot.commissionPercent / 100)) /
          100
        ).toFixed(2)}
        . Tolls and permits remain separate.
      </Text>
      {proposal.status === 'REQUESTED' && !expired ? (
        <>
          <Text style={styles.body}>
            Respond within {Math.max(0, Math.ceil((Date.parse(proposal.expiresAt) - now) / 1000))}{' '}
            seconds. Your route changes after acceptance.
          </Text>
          <View style={styles.row}>
            {(['ACCEPT', 'REJECT'] as const).map((decision) => (
              <Pressable
                key={decision}
                accessibilityRole="button"
                disabled={busy}
                accessibilityState={{ disabled: busy, busy }}
                style={styles.button}
                onPress={() => void respond(decision)}
              >
                <Text style={styles.buttonText}>
                  {busy
                    ? 'Saving…'
                    : decision === 'ACCEPT'
                      ? 'Accept extension'
                      : 'Keep agreed trip'}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.body} accessibilityLiveRegion="polite">
          {proposal.status === 'ACCEPTED'
            ? 'Accepted. Destination and fare updated.'
            : proposal.status === 'REJECTED'
              ? 'Declined. Original destination and fare retained.'
              : 'Proposal expired. Ask the rider to request again.'}
        </Text>
      )}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: {
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  title: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.bold,
    color: colors.deepBrown,
  },
  body: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.sm,
    color: colors.secondary,
  },
  error: { fontFamily: typography.fontFamily, fontSize: typography.sizes.sm, color: colors.error },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  button: {
    minHeight: 48,
    justifyContent: 'center',
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  buttonText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.bold,
    color: colors.deepBrown,
  },
});
