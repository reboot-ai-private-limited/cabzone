import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '@/context/auth-context';
import { ridesApi } from '@/services/api';
import { colors } from '@/design-system';

export function RidePaymentQr({
  rideId,
  amountPaise,
  onPaid,
}: {
  rideId: string;
  amountPaise: number;
  onPaid: () => Promise<void>;
}) {
  const { token } = useAuth();
  const [qr, setQr] = useState<{ imageDataUrl: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const checking = useRef(false);

  const check = useCallback(
    async (explicit = false) => {
      if (!token || inFlight.current || (!explicit && checking.current)) return;
      checking.current = true;
      if (explicit) {
        inFlight.current = true;
        setBusy(true);
        setMessage(null);
      }
      try {
        const result = await ridesApi.checkUpiPayment(token, rideId);
        if (result.paid) {
          setQr(null);
          await onPaid();
        } else if (explicit)
          setMessage(
            'Payment is not confirmed yet. Ask the rider to finish checkout, then check again.',
          );
      } catch (error) {
        if (explicit)
          setMessage(
            error instanceof Error ? error.message : 'Unable to check payment. Please retry.',
          );
      } finally {
        checking.current = false;
        if (explicit) {
          inFlight.current = false;
          setBusy(false);
        }
      }
    },
    [token, rideId, onPaid],
  );

  useEffect(() => {
    const poll = () => {
      if (AppState.currentState !== 'active') return;
      if (qr && Date.parse(qr.expiresAt) <= Date.now()) {
        setQr(null);
        setMessage('This QR has expired. Show a new QR to continue.');
      }
      void check();
    };
    poll();
    const timer = setInterval(poll, 5000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') poll();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [check, qr]);

  const showQr = async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await ridesApi.getPaymentQr(token, rideId);
      if (result.paid) {
        setQr(null);
        await onPaid();
      } else if (result.imageDataUrl && result.expiresAt)
        setQr({ imageDataUrl: result.imageDataUrl, expiresAt: result.expiresAt });
      else throw new Error('Payment QR is unavailable. Please retry.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unable to create payment QR. Please retry.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Collect ride payment</Text>
      <Text style={styles.amount}>₹{(amountPaise / 100).toFixed(2)}</Text>
      <Text style={styles.body}>
        Show the QR to your rider. They can scan it with their phone camera and pay by UPI in the
        browser.
      </Text>
      {qr ? (
        <Image
          source={{ uri: qr.imageDataUrl }}
          style={styles.qr}
          resizeMode="contain"
          accessibilityLabel="Ride payment QR. Scan with the rider’s phone camera."
          onError={() => {
            setQr(null);
            setMessage('The QR could not load. Please try again.');
          }}
        />
      ) : null}
      <Pressable
        style={styles.primary}
        onPress={() => void showQr()}
        disabled={busy || !token}
        accessibilityRole="button"
        accessibilityLabel={qr ? 'Refresh payment QR' : 'Show payment QR'}
        accessibilityState={{ disabled: busy || !token, busy }}
      >
        {busy ? (
          <ActivityIndicator color={colors.deepBrown} />
        ) : (
          <Text style={styles.primaryText}>{qr ? 'Refresh QR' : 'Show payment QR'}</Text>
        )}
      </Pressable>
      <Pressable
        style={styles.secondary}
        onPress={() => void check(true)}
        disabled={busy || !token}
        accessibilityRole="button"
        accessibilityLabel="Check payment status"
      >
        <Text style={styles.primaryText}>Check payment status</Text>
      </Pressable>
      <Text style={styles.caption}>
        Test payment · No real money is charged. This QR opens checkout; it is not a GPay or PhonePe
        UPI QR.
      </Text>
      <Text style={styles.caption}>
        You can return to Home while waiting. This ride stays pending until payment is confirmed.
      </Text>
      {message ? (
        <Text style={styles.error} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  title: { fontSize: 20, lineHeight: 27, fontWeight: '800', color: colors.deepBrown },
  amount: { fontSize: 32, lineHeight: 40, fontWeight: '800', color: colors.deepBrown },
  body: { fontSize: 15, lineHeight: 22, color: colors.deepBrown },
  caption: { fontSize: 13, lineHeight: 19, color: colors.secondary },
  qr: {
    width: '100%',
    maxWidth: 288,
    aspectRatio: 1,
    alignSelf: 'center',
    backgroundColor: colors.white,
  },
  primary: {
    minHeight: 56,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.amber,
  },
  primaryText: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: colors.deepBrown },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 13, lineHeight: 19, color: colors.error },
});
