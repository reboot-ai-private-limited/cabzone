import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { RideUpiCheckoutDto } from '@cabzone/contracts';
import { useAuth } from '@/context/auth-context';
import { riderRidesApi } from '@/services/api';
import { formatRupeesFromPaise } from '@/services/rider-helpers';
import { colors, radii, spacing, typography } from '@/design-system';
import { checkoutMessage, upiCheckoutHtml } from './upi-checkout-html';

export function UpiPaymentPanel({
  rideId,
  amountPaise,
  onPaid,
}: {
  rideId: string;
  amountPaise: number;
  onPaid: () => Promise<void>;
}) {
  const { token } = useAuth();
  const [checkout, setCheckout] = useState<RideUpiCheckoutDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const recover = async () => {
      try {
        const result = await riderRidesApi.upiPaymentStatus(token, rideId);
        if (active && result.paid) await onPaid();
      } catch {
        /* The explicit status action exposes errors and retries. */
      }
    };
    void recover();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recover();
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [token, rideId, onPaid]);

  const run = async (
    action: 'open' | 'status' | 'verify',
    proof?: { orderId: string; paymentId: string; signature: string },
  ) => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result =
        action === 'verify' && proof
          ? await riderRidesApi.verifyUpiPayment(token, rideId, proof)
          : await riderRidesApi.upiPaymentStatus(token, rideId);
      if (result.paid) {
        setCheckout(null);
        await onPaid();
        return;
      }
      if (action === 'open') setCheckout(await riderRidesApi.createUpiPayment(token, rideId));
      else setMessage('Payment is not confirmed yet. If you paid, check again shortly.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unable to check payment. Please try again.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Your trip is complete</Text>
      <Text style={styles.fare}>{formatRupeesFromPaise(amountPaise)}</Text>
      <Text style={styles.body}>
        Pay securely by UPI. Cabzone will confirm your payment automatically.
      </Text>
      <Text style={styles.caption}>Test payment · No money will be charged</Text>
      <Pressable
        style={styles.primary}
        onPress={() => void run('open')}
        disabled={busy || !token}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || !token, busy }}
      >
        {busy ? (
          <ActivityIndicator color={colors.deepBrown} />
        ) : (
          <Text style={styles.primaryText}>Pay {formatRupeesFromPaise(amountPaise)} by UPI</Text>
        )}
      </Pressable>
      <Pressable
        style={styles.secondary}
        onPress={() => void run('status')}
        disabled={busy || !token}
        accessibilityRole="button"
      >
        <Text style={styles.primaryText}>Check payment status</Text>
      </Pressable>
      {message ? (
        <Text style={styles.error} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  panel: { gap: spacing.md, paddingVertical: spacing.lg },
  title: { ...typography.h1, color: colors.deepBrown },
  fare: { ...typography.hero, color: colors.deepBrown },
  body: { ...typography.body, color: colors.deepBrown },
  caption: { ...typography.caption, color: colors.secondary },
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
});
