import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Modal,
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
  onCashReceived,
}: {
  rideId: string;
  amountPaise: number;
  onPaid: () => Promise<void>;
  onCashReceived: () => Promise<void>;
}) {
  const { token } = useAuth();
  const [qr, setQr] = useState<{
    imageDataUrl: string;
    expiresAt: string;
    testMode: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cash, setCash] = useState(false);
  const [sheet, setSheet] = useState<'cash' | 'confirm' | null>(null);
  const inFlight = useRef(false);
  const checking = useRef(false);

  const check = useCallback(
    async (explicit = false) => {
      if (!token || inFlight.current || checking.current) return;
      checking.current = true;
      if (explicit) {
        inFlight.current = true;
        setBusy(true);
        setMessage(null);
      }
      try {
        const result = await ridesApi.checkUpiPayment(token, rideId);
        setCash((previous) => previous || result.method === 'CASH');
        if (result.method === 'CASH') setQr(null);
        if (result.paid || result.requiresReview) {
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
        setMessage('This QR has expired. Check payment status before retrying.');
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

  const showQr = useCallback(async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await ridesApi.getPaymentQr(token, rideId);
      setCash((previous) => previous || result.method === 'CASH');
      if (result.paid || result.requiresReview) {
        setQr(null);
        await onPaid();
      } else if (result.method === 'CASH') setQr(null);
      else if (result.imageDataUrl && result.expiresAt)
        setQr({
          imageDataUrl: result.imageDataUrl,
          expiresAt: result.expiresAt,
          testMode: result.testMode !== false,
        });
      else throw new Error('Payment QR is unavailable. Please retry.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unable to create payment QR. Please retry.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [token, rideId, onPaid]);

  const cashAction = async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      if (sheet === 'confirm') {
        await onCashReceived();
        await onPaid();
      } else {
        const result = await ridesApi.switchToCash(token, rideId);
        setCash((previous) => previous || result.method === 'CASH');
        setQr(null);
        if (result.paid || result.requiresReview) await onPaid();
      }
      setSheet(null);
    } catch (error) {
      setSheet(null);
      setMessage(
        error instanceof Error ? error.message : 'Unable to change payment. Please retry.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void showQr();
    });
    return () => {
      active = false;
    };
  }, [showQr]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Collect ride payment</Text>
      <Text style={styles.amount}>₹{(amountPaise / 100).toFixed(2)}</Text>
      <Text style={styles.body}>
        {cash
          ? 'Collect cash from your rider. Confirm receipt only after you have received the full fare.'
          : qr?.testMode === false
            ? 'Ask your rider to scan with GPay, PhonePe, or another UPI app. Payment updates automatically.'
            : 'Show the QR to your rider. They can scan it with their phone camera to open test checkout.'}
      </Text>
      {qr && !cash ? (
        <Image
          source={{ uri: qr.imageDataUrl }}
          style={styles.qr}
          resizeMode="contain"
          accessibilityLabel={
            qr.testMode
              ? 'Ride payment QR. Scan with the rider’s phone camera.'
              : 'Ride payment QR. Scan with a UPI app.'
          }
          onError={() => {
            setQr(null);
            setMessage('The QR could not load. Please try again.');
          }}
        />
      ) : null}
      <Pressable
        style={styles.primary}
        onPress={() => (cash ? setSheet('confirm') : void showQr())}
        disabled={busy || !token}
        accessibilityRole="button"
        accessibilityLabel={cash ? 'Cash received' : qr ? 'Refresh payment QR' : 'Show payment QR'}
        accessibilityState={{ disabled: busy || !token, busy }}
      >
        {busy ? (
          <ActivityIndicator color={colors.deepBrown} />
        ) : (
          <Text style={styles.primaryText}>
            {cash ? 'Cash received' : qr ? 'Refresh QR' : 'Show payment QR'}
          </Text>
        )}
      </Pressable>
      {!cash ? (
        <Pressable
          style={styles.secondary}
          onPress={() => setSheet('cash')}
          disabled={busy || !token}
          accessibilityRole="button"
          accessibilityLabel="Change payment"
        >
          <Text style={styles.primaryText}>Change payment</Text>
        </Pressable>
      ) : null}
      <Pressable
        style={styles.secondary}
        onPress={() => void check(true)}
        disabled={busy || !token}
        accessibilityRole="button"
        accessibilityLabel="Check payment status"
      >
        <Text style={styles.primaryText}>Check payment status</Text>
      </Pressable>
      {qr?.testMode ? (
        <Text style={styles.caption}>
          Test payment · No real money is charged. This QR opens checkout; it is not a GPay or
          PhonePe UPI QR.
        </Text>
      ) : null}
      <Text style={styles.caption}>
        You can return to Home while waiting. This ride stays pending until payment is confirmed.
      </Text>
      {message ? (
        <Text style={styles.error} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
      <Modal
        visible={sheet !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSheet(null)}
      >
        <View style={styles.shade}>
          <View style={styles.sheet}>
            <Text style={styles.title}>
              {sheet === 'confirm' ? 'Have you received the cash?' : 'Switch to cash?'}
            </Text>
            <Text style={styles.body}>
              {sheet === 'confirm'
                ? `Confirm only after receiving ₹${(amountPaise / 100).toFixed(2)} from your rider. This completes payment for the ride.`
                : 'The UPI checkout will close. Make sure the rider has not paid online. You will confirm receipt after collecting cash.'}
            </Text>
            <Pressable
              style={styles.primary}
              disabled={busy || !token}
              onPress={() => void cashAction()}
              accessibilityRole="button"
              accessibilityLabel={sheet === 'confirm' ? 'Confirm cash received' : 'Switch to cash'}
            >
              {busy ? (
                <ActivityIndicator color={colors.deepBrown} />
              ) : (
                <Text style={styles.primaryText}>
                  {sheet === 'confirm' ? 'Confirm cash received' : 'Switch to cash'}
                </Text>
              )}
            </Pressable>
            <Pressable
              style={styles.secondary}
              disabled={busy}
              onPress={() => setSheet(null)}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>{sheet === 'confirm' ? 'Not yet' : 'Keep UPI'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  shade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
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
