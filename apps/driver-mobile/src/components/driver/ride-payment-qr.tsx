import type { RideDto, RideStatus } from '@cabzone/contracts';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '@/context/auth-context';
import { colors } from '@/design-system';
import { ridesApi } from '@/services/api';
import { RidePaymentQrSheet } from './ride-payment-qr-sheet';

export function RidePaymentQr({
  rideId,
  rideStatus = 'PAYMENT_PENDING',
  amountPaise,
  farePaise,
  arrearsPaise,
  commissionPaise,
  cashAllowed = true,
  cashBlockedReason,
  onRide,
  onPaid,
  onCashReceived,
  onMarkUnpaid,
}: {
  rideId: string;
  rideStatus?: RideStatus | undefined;
  amountPaise: number;
  farePaise?: number | undefined;
  arrearsPaise?: number | undefined;
  commissionPaise?: number | undefined;
  cashAllowed?: boolean | undefined;
  cashBlockedReason?: string | null | undefined;
  onRide?: ((ride: RideDto) => void) | undefined;
  onPaid: () => Promise<void>;
  onCashReceived: () => Promise<void>;
  onMarkUnpaid?: (() => Promise<void>) | undefined;
}) {
  const { token } = useAuth();
  const [qrOpen, setQrOpen] = useState(false);
  const [qrPaidSeen, setQrPaidSeen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'confirm' | 'unpaid' | null>(null);
  const inFlight = useRef(false);

  const onRideRef = useRef(onRide);
  const onPaidRef = useRef(onPaid);

  useEffect(() => {
    onRideRef.current = onRide;
    onPaidRef.current = onPaid;
  }, [onRide, onPaid]);

  const isAwaitingPayment =
    rideStatus === 'PAYMENT_PENDING' || rideStatus === 'PAYMENT_CASH_CLAIMED';
  const isCashClaimed = rideStatus === 'PAYMENT_CASH_CLAIMED';
  const resolvedArrearsPaise = Math.max(0, arrearsPaise ?? 0);
  const resolvedFarePaise =
    typeof farePaise === 'number' && Number.isFinite(farePaise)
      ? Math.max(0, farePaise)
      : Math.max(0, amountPaise - resolvedArrearsPaise);
  const resolvedCommissionPaise = Math.max(0, commissionPaise ?? 0);
  const canAcceptCash = cashAllowed !== false;

  const checkStatus = useCallback(async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await ridesApi.checkUpiPayment(token, rideId);
      await onPaidRef.current();
      if (!result.paid && !result.requiresReview) {
        setMessage(
          result.cashClaimedByRider
            ? 'Passenger marked cash paid. Confirm receipt if you received cash, or tap "Rider didn\'t pay".'
            : 'Payment is not confirmed yet. Tap "Show QR" for UPI or "Cash received" after collecting cash.',
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unable to check payment. Please retry.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [token, rideId]);

  const handleSheetRide = useCallback((updatedRide: RideDto) => {
    onRideRef.current?.(updatedRide);
    if (updatedRide.status === 'SETTLED' || updatedRide.status === 'PAYMENT_CONFIRMED') {
      setQrPaidSeen(true);
    }
  }, []);

  const handleSheetClose = useCallback(() => {
    setQrOpen(false);
    if (qrPaidSeen || rideStatus === 'SETTLED' || rideStatus === 'PAYMENT_CONFIRMED') {
      setQrPaidSeen(false);
      void onPaidRef.current();
    }
  }, [qrPaidSeen, rideStatus]);

  const handleCashFromQrSheet = useCallback(() => {
    setQrOpen(false);
    if (!canAcceptCash) return;
    setSheet('confirm');
  }, [canAcceptCash]);

  const submitSheetAction = async () => {
    if (!token || inFlight.current || !sheet) return;
    const activeSheet = sheet;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      if (activeSheet === 'confirm') {
        await onCashReceived();
        await onPaid();
      } else if (activeSheet === 'unpaid' && onMarkUnpaid) {
        await onMarkUnpaid();
      }
      setSheet(null);
    } catch (error) {
      setSheet(null);
      setMessage(
        error instanceof Error ? error.message : 'Unable to update payment status. Please retry.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (!isAwaitingPayment && !qrOpen) {
    return null;
  }

  if (!isAwaitingPayment && qrOpen) {
    return (
      <RidePaymentQrSheet
        visible={qrOpen}
        rideId={rideId}
        cashAllowed={canAcceptCash}
        cashBlockedReason={cashBlockedReason}
        onRide={handleSheetRide}
        onClose={handleSheetClose}
        onCash={handleCashFromQrSheet}
      />
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Collect ride payment</Text>
      <Text style={styles.amount}>₹{(amountPaise / 100).toFixed(2)}</Text>

      {isCashClaimed ? (
        <View style={styles.cashClaimedNotice} accessibilityRole="alert">
          <Text style={styles.cashClaimedTitle}>Passenger marked cash paid</Text>
          <Text style={styles.cashClaimedBody}>
            Confirm receipt below if you collected ₹{(amountPaise / 100).toFixed(2)} in cash, or
            tap &quot;Rider didn&apos;t pay&quot; if you did not receive payment.
          </Text>
        </View>
      ) : null}

      {resolvedArrearsPaise > 0 ? (
        <View style={styles.breakdownBox}>
          <View style={styles.breakdownRow}>
            <Text style={styles.caption}>Agreed trip fare</Text>
            <Text style={styles.breakdownValue}>₹{(resolvedFarePaise / 100).toFixed(2)}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.caption}>Rider prior cancellation fee</Text>
            <Text style={styles.breakdownValue}>₹{(resolvedArrearsPaise / 100).toFixed(2)}</Text>
          </View>
          <View style={[styles.breakdownRow, styles.breakdownTotal]}>
            <Text style={styles.breakdownValue}>Total to collect from rider</Text>
            <Text style={styles.breakdownValue}>₹{(amountPaise / 100).toFixed(2)}</Text>
          </View>
          <Text style={styles.caption}>
            {canAcceptCash
              ? `Cash: keep ₹${(amountPaise / 100).toFixed(2)} cash (₹${((resolvedCommissionPaise + resolvedArrearsPaise) / 100).toFixed(2)} commission + rider arrears deducted from wallet). UPI QR: net trip earnings credit to your wallet.`
              : `UPI wallet effect: Net trip earnings credit to your wallet; Cabzone retains commission and ₹${(resolvedArrearsPaise / 100).toFixed(2)} rider arrears.`}
          </Text>
        </View>
      ) : null}

      <Text style={styles.body}>
        Accept payment in Cash or UPI. Tap &quot;Show QR&quot; only when the passenger wants to
        scan a UPI QR code.
      </Text>

      <Pressable
        style={styles.primary}
        onPress={() => {
          setMessage(null);
          setQrOpen(true);
        }}
        disabled={busy || !token}
        accessibilityRole="button"
        accessibilityLabel="Show QR"
        accessibilityState={{ disabled: busy || !token, busy }}
      >
        {busy ? (
          <ActivityIndicator color={colors.deepBrown} />
        ) : (
          <Text style={styles.primaryText}>Show QR</Text>
        )}
      </Pressable>

      {canAcceptCash ? (
        <Pressable
          style={styles.cashOutlineBtn}
          onPress={() => {
            setMessage(null);
            setSheet('confirm');
          }}
          disabled={busy || !token}
          accessibilityRole="button"
          accessibilityLabel="Cash received"
        >
          <Text style={styles.primaryText}>Cash received</Text>
        </Pressable>
      ) : (
        <Text style={styles.cashBlockedNotice}>
          {cashBlockedReason ||
            'Cash collection is disabled while prior rider cancellation fees are due. Collect the full total via UPI QR.'}
        </Text>
      )}

      <Pressable
        style={styles.secondary}
        onPress={() => void checkStatus()}
        disabled={busy || !token}
        accessibilityRole="button"
        accessibilityLabel="Check payment status"
      >
        <Text style={styles.primaryText}>Check payment status</Text>
      </Pressable>

      {onMarkUnpaid ? (
        <Pressable
          style={styles.secondary}
          onPress={() => {
            setMessage(null);
            setSheet('unpaid');
          }}
          disabled={busy || !token}
          accessibilityRole="button"
          accessibilityLabel="Rider didn't pay"
        >
          <Text style={styles.unpaidText}>Rider didn&apos;t pay</Text>
        </Pressable>
      ) : null}

      <Text style={styles.caption}>
        You can return to Home anytime — pending payment never blocks new ride offers or going
        offline.
      </Text>

      {message ? (
        <Text style={styles.error} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}

      <RidePaymentQrSheet
        visible={qrOpen}
        rideId={rideId}
        cashAllowed={canAcceptCash}
        cashBlockedReason={cashBlockedReason}
        onRide={handleSheetRide}
        onClose={handleSheetClose}
        onCash={handleCashFromQrSheet}
      />

      <Modal
        visible={sheet !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSheet(null)}
      >
        <View style={styles.shade}>
          <View style={styles.sheet}>
            <Text style={styles.title}>
              {sheet === 'confirm' ? 'Have you received the cash?' : 'Report unpaid ride?'}
            </Text>
            <Text style={styles.body}>
              {sheet === 'confirm'
                ? `Confirm only after receiving ₹${(amountPaise / 100).toFixed(2)} in cash from your rider. Any open UPI QR will be closed automatically.`
                : isCashClaimed
                  ? 'Your rider marked this trip paid in cash. Reporting unpaid will open a payment dispute for Cabzone Support with ₹0 commission charged right now.'
                  : 'Use this if the passenger left without paying. You will be charged ₹0 commission, and the passenger must settle before booking again.'}
            </Text>
            <Pressable
              style={sheet === 'unpaid' ? styles.dangerBtn : styles.primary}
              disabled={busy || !token}
              onPress={() => void submitSheetAction()}
              accessibilityRole="button"
              accessibilityLabel={
                sheet === 'confirm' ? 'Confirm cash received' : "Confirm rider didn't pay"
              }
            >
              {busy ? (
                <ActivityIndicator
                  color={sheet === 'unpaid' ? colors.white : colors.deepBrown}
                />
              ) : (
                <Text style={sheet === 'unpaid' ? styles.dangerBtnText : styles.primaryText}>
                  {sheet === 'confirm' ? 'Confirm cash received' : "Confirm rider didn't pay"}
                </Text>
              )}
            </Pressable>
            <Pressable
              style={styles.secondary}
              disabled={busy}
              onPress={() => setSheet(null)}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>{sheet === 'confirm' ? 'Not yet' : 'Go back'}</Text>
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
  cashClaimedNotice: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  cashClaimedTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  cashClaimedBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.deepBrown,
  },
  breakdownBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  breakdownTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  breakdownValue: { fontSize: 13, lineHeight: 19, fontWeight: '700', color: colors.deepBrown },
  cashBlockedNotice: { fontSize: 13, lineHeight: 19, fontWeight: '600', color: colors.brandBrown },
  body: { fontSize: 15, lineHeight: 22, color: colors.deepBrown },
  caption: { fontSize: 13, lineHeight: 19, color: colors.secondary },
  primary: {
    minHeight: 56,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.amber,
  },
  cashOutlineBtn: {
    minHeight: 52,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  dangerBtn: {
    minHeight: 56,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
  },
  dangerBtnText: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: colors.white },
  primaryText: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: colors.deepBrown },
  unpaidText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.error },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 13, lineHeight: 19, color: colors.error },
});
