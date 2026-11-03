import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { RideStatus, RideUpiCheckoutDto } from '@cabzone/contracts';
import { useAuth } from '@/context/auth-context';
import { riderRidesApi } from '@/services/api';
import { formatRupeesFromPaise } from '@/services/rider-helpers';
import { colors, radii, spacing, typography, createStyles } from '@/design-system';
import { checkoutMessage, upiCheckoutHtml } from './upi-checkout-html';
import { upiPaymentUrl } from './upi-intent';

export function UpiPaymentPanel({
  rideId,
  amountPaise,
  farePaise,
  arrearsPaise = 0,
  cashAllowed = true,
  cashBlockedReason = null,
  rideStatus,
  onPaid,
  onClaimCashPaid,
  onDisputeUnpaid,
}: {
  rideId: string;
  amountPaise: number;
  farePaise?: number;
  arrearsPaise?: number;
  cashAllowed?: boolean;
  cashBlockedReason?: string | null;
  rideStatus?: RideStatus;
  onPaid: () => Promise<void>;
  onClaimCashPaid?: () => Promise<void>;
  onDisputeUnpaid?: () => void;
}) {
  const { token } = useAuth();
  const [checkout, setCheckout] = useState<RideUpiCheckoutDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cash, setCash] = useState(false);
  const [testMode, setTestMode] = useState<boolean | null>(null);
  const [chooseCash, setChooseCash] = useState(false);
  const inFlight = useRef(false);
  const recovering = useRef(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const recover = async () => {
      if (AppState.currentState !== 'active' || recovering.current || inFlight.current) return;
      recovering.current = true;
      try {
        const result = await riderRidesApi.upiPaymentStatus(token, rideId);
        if (!active) return;
        setCash((previous) => previous || result.method === 'CASH' || !!result.cashClaimedByRider);
        setTestMode(result.testMode ?? null);
        if (result.method === 'CASH') setCheckout(null);
        if (result.paid || result.requiresReview) {
          setCheckout(null);
          await onPaid();
        }
      } catch {
        /* The explicit status action exposes errors and retries. */
      } finally {
        recovering.current = false;
      }
    };
    void recover();
    const timer = setInterval(() => void recover(), 5000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recover();
    });
    return () => {
      active = false;
      clearInterval(timer);
      listener.remove();
    };
  }, [token, rideId, onPaid]);

  const run = async (
    action: 'open' | 'status' | 'verify' | 'cash',
    proof?: { orderId: string; paymentId: string; signature: string },
  ) => {
    if (!token || inFlight.current) return;
    if (action === 'cash' && !cashAllowed) {
      setMessage(
        cashBlockedReason ||
          'Cash payment is unavailable while previous cancellation fees are due. Please pay by UPI.',
      );
      setChooseCash(false);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      if (action === 'cash') {
        if (onClaimCashPaid) {
          await onClaimCashPaid();
          setCash(true);
          setCheckout(null);
          setMessage(
            'Marked as paid in cash. Your next booking is unlocked while your driver confirms receipt.',
          );
          return;
        }
        const switched = await riderRidesApi.switchToCash(token, rideId);
        setCash(true);
        setTestMode(switched.testMode ?? null);
        setCheckout(null);
        if (switched.paid || switched.requiresReview) {
          await onPaid();
          return;
        }
        setMessage('Pay your driver in cash. The driver will confirm receipt to complete payment.');
        return;
      }

      const result =
        action === 'verify' && proof
          ? await riderRidesApi.verifyUpiPayment(token, rideId, proof)
          : await riderRidesApi.upiPaymentStatus(token, rideId);
      setCash((previous) =>
        action === 'open' ? false : previous || result.method === 'CASH' || !!result.cashClaimedByRider,
      );
      setTestMode(result.testMode ?? null);
      if (result.paid || result.requiresReview) {
        setCheckout(null);
        await onPaid();
        return;
      }
      if (action === 'open') {
        const session = await riderRidesApi.createUpiSession(token, rideId);
        setCash(false);
        if (session.kind === 'checkout') {
          setTestMode(true);
          setMessage(
            cashAllowed
              ? 'Test mode: real UPI apps cannot be opened. Use simulated checkout or pay cash to your driver.'
              : 'Test mode: real UPI apps cannot be opened. Complete payment in simulated UPI checkout.',
          );
          setCheckout(session.checkout);
        } else {
          if (session.amountPaise !== amountPaise)
            throw new Error('The fare changed. Refresh your ride before paying.');
          const url = upiPaymentUrl(session, Platform.OS);
          try {
            await Linking.openURL(url);
            setMessage(
              'Complete payment in your UPI app, then return here. Payment will be checked automatically.',
            );
          } catch {
            setMessage(
              Platform.OS === 'ios'
                ? 'Google Pay could not open. Try again or scan the driver’s QR with your UPI app.'
                : 'No UPI app opened. Try again or scan the driver’s QR with your UPI app.',
            );
          }
        }
      } else {
        setMessage('Payment is not confirmed yet. If you paid, check again shortly.');
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unable to check payment. Please try again.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
      if (action === 'cash') setChooseCash(false);
    }
  };

  const resolvedFarePaise =
    typeof farePaise === 'number' && Number.isFinite(farePaise)
      ? farePaise
      : Math.max(0, amountPaise - Math.max(0, arrearsPaise));

  const isCashClaimed = rideStatus === 'PAYMENT_CASH_CLAIMED';
  const isUnpaid = rideStatus === 'PAYMENT_UNPAID';

  const panelTitle = isUnpaid
    ? 'Unpaid trip fare due'
    : isCashClaimed
      ? 'Cash payment awaiting driver confirmation'
      : 'Your trip is complete';

  const panelBody = isUnpaid
    ? 'Your driver reported this trip fare as unpaid. Pay by UPI below to clear this balance and unlock booking, or raise a dispute if you already paid.'
    : isCashClaimed
      ? 'You marked this fare as paid in cash. Your next ride is unlocked while your driver confirms receipt — or you can still pay by UPI below.'
      : cash
        ? 'Pay your driver in cash. Waiting for the driver to confirm receipt — or pay securely by UPI below.'
        : cashAllowed
          ? 'Pay securely by UPI, or hand cash to your driver and tap "I paid cash to driver".'
          : cashBlockedReason ||
            'Cash is unavailable while previous cancellation fees are due. Pay securely by UPI.';

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{panelTitle}</Text>
      <Text style={styles.fare}>{formatRupeesFromPaise(amountPaise)}</Text>
      {arrearsPaise > 0 ? (
        <View style={styles.breakdownBox} accessibilityRole="summary">
          <View style={styles.breakdownRow}>
            <Text style={styles.caption}>Agreed trip fare</Text>
            <Text style={styles.breakdownVal}>{formatRupeesFromPaise(resolvedFarePaise)}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.caption}>Previous cancellation fee</Text>
            <Text style={styles.breakdownVal}>{formatRupeesFromPaise(arrearsPaise)}</Text>
          </View>
          <View style={[styles.breakdownRow, styles.breakdownTotalRow]}>
            <Text style={styles.primaryText}>Total payable</Text>
            <Text style={styles.primaryText}>{formatRupeesFromPaise(amountPaise)}</Text>
          </View>
        </View>
      ) : null}
      <Text style={styles.body}>{panelBody}</Text>
      {testMode ? (
        <Text style={styles.caption}>
          {cashAllowed
            ? 'Test mode · UPI app payments need live credentials. You can use test checkout or pay cash.'
            : 'Test mode · UPI app payments need live credentials. Complete payment using test checkout.'}
        </Text>
      ) : null}
      <Pressable
        style={styles.primary}
        onPress={() => void run('open')}
        disabled={busy || !token}
        accessibilityRole="button"
        accessibilityLabel={testMode ? 'Open UPI test checkout' : 'Pay by UPI'}
        accessibilityState={{ disabled: busy || !token, busy }}
      >
        {busy ? (
          <ActivityIndicator color={colors.deepBrown} />
        ) : (
          <Text style={styles.primaryText}>
            {testMode
              ? 'Open UPI test checkout'
              : `Pay ${formatRupeesFromPaise(amountPaise)} by UPI`}
          </Text>
        )}
      </Pressable>
      {!isUnpaid && !isCashClaimed && cashAllowed ? (
        <Pressable
          style={styles.secondary}
          disabled={busy || !token}
          accessibilityRole="button"
          accessibilityLabel="I paid cash to driver"
          onPress={() => setChooseCash(true)}
        >
          <Text style={styles.primaryText}>I paid cash to driver</Text>
        </Pressable>
      ) : null}
      <Pressable
        style={styles.secondary}
        onPress={() => void run('status')}
        disabled={busy || !token}
        accessibilityRole="button"
        accessibilityLabel="Check payment status"
      >
        <Text style={styles.primaryText}>Check payment status</Text>
      </Pressable>
      {isUnpaid && onDisputeUnpaid ? (
        <Pressable
          style={styles.secondary}
          onPress={onDisputeUnpaid}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Dispute unpaid report"
        >
          <Text style={[styles.primaryText, { color: colors.error }]}>
            I already paid — Dispute
          </Text>
        </Pressable>
      ) : null}
      {message ? (
        <Text style={styles.error} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
      <Modal
        visible={chooseCash}
        transparent
        animationType="slide"
        onRequestClose={() => setChooseCash(false)}
      >
        <View style={styles.shade}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Confirm cash paid to driver?</Text>
            <Text style={styles.body}>
              {`Confirm only if you have handed ${formatRupeesFromPaise(amountPaise)} in cash to your driver. Your next booking will unlock while your driver confirms receipt.`}
            </Text>
            <Pressable
              style={styles.primary}
              disabled={busy || !token}
              accessibilityRole="button"
              accessibilityLabel="Confirm I paid cash"
              onPress={() => void run('cash')}
            >
              {busy ? (
                <ActivityIndicator color={colors.deepBrown} />
              ) : (
                <Text style={styles.primaryText}>Confirm I paid cash</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.secondary}
              disabled={busy}
              accessibilityRole="button"
              onPress={() => setChooseCash(false)}
            >
              <Text style={styles.primaryText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={!!checkout}
        animationType="slide"
        onRequestClose={() => {
          setCheckout(null);
          void run('status');
        }}
      >
        <SafeAreaView style={styles.screen}>
          <Pressable
            style={styles.close}
            onPress={() => {
              setCheckout(null);
              void run('status');
            }}
            accessibilityRole="button"
            accessibilityLabel="Close UPI checkout"
          >
            <Text style={styles.primaryText}>Close</Text>
          </Pressable>
          {checkout ? (
            <WebView
              source={{ html: upiCheckoutHtml(checkout), baseUrl: 'https://checkout.razorpay.com' }}
              originWhitelist={['https://*', 'about:blank']}
              onShouldStartLoadWithRequest={({ url }) =>
                url === 'about:blank' ||
                /^https:\/\/([a-z0-9-]+\.)*razorpay\.com(?:\/|$)/i.test(url)
              }
              onMessage={({ nativeEvent }) => {
                const result = checkoutMessage(nativeEvent.data);
                if (!result) return;
                setCheckout(null);
                if (result.type === 'success') void run('verify', result);
                else if (result.type === 'dismiss') void run('status');
                else setMessage('Payment was unsuccessful. You can try again.');
              }}
              onError={() => {
                setCheckout(null);
                setMessage('Checkout could not load. Check your connection and try again.');
              }}
              javaScriptEnabled
              domStorageEnabled
              mixedContentMode="never"
              style={styles.screen}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = createStyles(() => ({
  shade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  screen: { flex: 1, backgroundColor: colors.white },
  panel: { gap: spacing.md, paddingVertical: spacing.lg },
  title: { ...typography.h1, color: colors.deepBrown },
  fare: { ...typography.hero, color: colors.deepBrown },
  body: { ...typography.body, color: colors.deepBrown },
  caption: { ...typography.caption, color: colors.secondary },
  breakdownBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.xs,
    marginTop: 2,
  },
  breakdownVal: { ...typography.bodyBold, color: colors.deepBrown },
  primary: {
    minHeight: 56,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...typography.bodyBold, color: colors.deepBrown },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  close: {
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  error: { ...typography.caption, color: colors.error },
}));
