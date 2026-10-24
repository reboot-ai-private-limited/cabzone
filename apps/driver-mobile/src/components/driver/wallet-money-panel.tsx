import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { DriverWalletActivityDto, WalletOperationDto } from '@cabzone/contracts';
import { useAuth } from '@/context/auth-context';
import { useDuty } from '@/context/duty-context';
import { walletApi } from '@/services/api';
import { colors } from '@/design-system';
import { walletAmountPaise, walletRequestKey } from './wallet-money-helpers';

const money = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
const operationLabel = (entry: WalletOperationDto) =>
  entry.status === 'CREATED'
    ? 'Awaiting payment'
    : entry.status === 'PENDING'
      ? 'Pending review'
      : entry.status === 'REJECTED'
        ? 'Returned'
        : entry.kind === 'RECHARGE'
          ? 'Added'
          : 'Paid · Test';

export function WalletMoneyPanel({ refreshVersion = 0 }: { refreshVersion?: number }) {
  const { token } = useAuth();
  const { refreshSummary } = useDuty();
  const [activity, setActivity] = useState<DriverWalletActivityDto | null>(null);
  const [form, setForm] = useState<'recharge' | 'cashout' | null>(null);
  const [amount, setAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const loading = useRef(false);
  const key = useRef<{ details: string; id: string } | null>(null);

  const load = useCallback(async () => {
    if (!token || loading.current || inFlight.current) return;
    loading.current = true;
    try {
      let next = await walletApi.activity(token);
      setActivity(next);
      const pending = next.operations.find(
        (entry) => entry.kind === 'RECHARGE' && entry.status === 'CREATED',
      );
      if (pending) {
        const status = await walletApi.rechargeStatus(token, pending.id);
        if (status.operation.status === 'COMPLETED') {
          await refreshSummary();
          next = await walletApi.activity(token);
          setMessage('Recharge added to your wallet.');
        }
      }
      setActivity(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet could not refresh. Please retry.');
    } finally {
      loading.current = false;
    }
  }, [token, refreshSummary]);

  useEffect(() => {
    void Promise.resolve().then(load);
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void load();
    }, 15000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [load, refreshVersion]);

  const submit = async () => {
    if (!token || !form || inFlight.current) return;
    const amountPaise = walletAmountPaise(amount);
    if (!amountPaise || (form === 'recharge' && amountPaise < 10000)) {
      setError(
        form === 'recharge'
          ? 'Enter ₹100 to ₹1,00,000.'
          : 'Enter ₹1 to ₹1,00,000 with up to two decimal places.',
      );
      return;
    }
    if (form === 'cashout' && amountPaise > (activity?.availableCashoutPaise ?? 0)) {
      setError('Amount exceeds your available cashout balance.');
      return;
    }
    const details = `${form}:${amountPaise}:${form === 'cashout' ? upiId.trim().toLowerCase() : ''}`;
    if (key.current?.details !== details) key.current = { details, id: walletRequestKey() };
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (form === 'recharge') {
        const result = await walletApi.recharge(token, amountPaise, key.current.id);
        key.current = null;
        setForm(null);
        if (result.operation.status !== 'COMPLETED') {
          try {
            await Linking.openURL(result.checkoutUrl);
          } catch {
            setError(
              'Checkout could not open. Use Resume recharge below to retry the same payment.',
            );
          }
        }
        setMessage('Recharge saved. Your balance updates after payment is verified.');
      } else {
        await walletApi.cashout(token, amountPaise, upiId.trim(), key.current.id);
        setForm(null);
        key.current = null;
        setMessage('Cashout submitted for Finance review. No transfer has been made yet.');
      }
      setActivity(await walletApi.activity(token));
      await refreshSummary();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Request could not complete. Retry safely with the same details.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const resume = async (id: string) => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await walletApi.rechargeStatus(token, id);
      if (result.operation.status === 'COMPLETED') {
        setMessage('Recharge already added.');
        await refreshSummary();
      } else await Linking.openURL(result.checkoutUrl);
      setActivity(await walletApi.activity(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reopen recharge. Please retry.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Add money & cash out</Text>
      <Text style={styles.caption}>Test mode · No money is charged or sent.</Text>
      {activity ? (
        <>
          <View style={styles.row}>
            <Text style={styles.label}>Online earnings</Text>
            <Text style={styles.value}>{money(activity.earningsBalancePaise)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Available to cash out</Text>
            <Text style={styles.value}>{money(activity.availableCashoutPaise)}</Text>
          </View>
          {activity.pendingCashoutPaise > 0 ? (
            <Text style={styles.caption}>
              {money(activity.pendingCashoutPaise)} reserved for your pending cashout.
            </Text>
          ) : null}
          {activity.cashoutBlockedReason ? (
            <Text style={styles.caption}>{activity.cashoutBlockedReason}</Text>
          ) : null}
        </>
      ) : (
        <ActivityIndicator color={colors.deepBrown} />
      )}
      <Text style={styles.caption}>
        Cash fares are already with you. Online earnings and unused recharge credit can be cashed
        out after dues are cleared.
      </Text>
      <View style={styles.row}>
        <Pressable
          style={[styles.button, styles.primary]}
          disabled={busy || !token}
          accessibilityRole="button"
          onPress={() => {
            setAmount('500');
            setError(null);
            setForm('recharge');
          }}
        >
          <Text style={styles.buttonText}>Add money</Text>
        </Pressable>
        <Pressable
          style={styles.button}
          disabled={
            busy ||
            !activity ||
            activity.availableCashoutPaise < 100 ||
            activity.pendingCashoutPaise > 0
          }
          accessibilityRole="button"
          onPress={() => {
            setAmount('');
            setError(null);
            setForm('cashout');
          }}
        >
          <Text style={styles.buttonText}>Cash out</Text>
        </Pressable>
      </View>
      {error && !form ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {message ? (
        <Text style={styles.caption} accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
      {activity?.operations.length ? (
        <Text style={styles.subtitle}>Requests & recharges</Text>
      ) : null}
      {activity?.operations.slice(0, 10).map((entry) => (
        <View style={styles.request} key={entry.id}>
          <View style={styles.row}>
            <Text style={styles.value}>
              {entry.kind === 'RECHARGE' ? 'Recharge' : 'Cashout'} · {money(entry.amountPaise)}
            </Text>
            <Text style={styles.caption}>{operationLabel(entry)}</Text>
          </View>
          <Text style={styles.caption}>{new Date(entry.createdAt).toLocaleString('en-IN')}</Text>
          {entry.reason ? <Text style={styles.caption}>{entry.reason}</Text> : null}
          {entry.transferReference ? (
            <Text style={styles.caption}>Transfer reference: {entry.transferReference}</Text>
          ) : null}
          {entry.kind === 'RECHARGE' && entry.status === 'CREATED' ? (
            <Pressable
              style={styles.button}
              disabled={busy}
              accessibilityRole="button"
              onPress={() => void resume(entry.id)}
            >
              <Text style={styles.buttonText}>Resume recharge</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      <Pressable
        style={styles.button}
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void load()}
      >
        <Text style={styles.buttonText}>Check wallet status</Text>
      </Pressable>
      <Modal
        visible={form !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!busy) setForm(null);
        }}
      >
        <KeyboardAvoidingView
          style={styles.shade}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheet}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>
              {form === 'recharge' ? 'Add money' : 'Request cashout'}
            </Text>
            <Text style={styles.caption}>
              {form === 'recharge'
                ? 'Test UPI recharge · ₹100 minimum.'
                : 'Funds are reserved for Finance review. Withdrawing all recharge credit can stop new ride offers.'}
            </Text>
            <Text style={styles.label}>Amount in rupees</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              accessibilityLabel="Amount in rupees"
              editable={!busy}
            />
            {form === 'cashout' ? (
              <>
                <Text style={styles.label}>UPI ID to receive cashout</Text>
                <TextInput
                  style={styles.input}
                  value={upiId}
                  onChangeText={setUpiId}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  accessibilityLabel="Cashout UPI ID"
                  placeholder="name@bank"
                  editable={!busy}
                />
              </>
            ) : null}
            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <Pressable
              style={[styles.button, styles.primary]}
              disabled={busy || !token}
              accessibilityRole="button"
              onPress={() => void submit()}
            >
              {busy ? (
                <ActivityIndicator color={colors.deepBrown} />
              ) : (
                <Text style={styles.buttonText}>
                  {form === 'recharge'
                    ? 'Continue to UPI test checkout'
                    : 'Confirm cashout request'}
                </Text>
              )}
            </Pressable>
            <Pressable
              style={styles.button}
              disabled={busy}
              accessibilityRole="button"
              onPress={() => setForm(null)}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.white,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.deepBrown },
  subtitle: { fontSize: 16, fontWeight: '700', color: colors.deepBrown },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  label: { fontSize: 14, color: colors.deepBrown },
  value: { fontSize: 15, fontWeight: '700', color: colors.deepBrown },
  caption: { fontSize: 13, lineHeight: 19, color: colors.secondary },
  error: { fontSize: 13, lineHeight: 19, color: colors.error },
  button: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.amber, borderColor: colors.amber },
  buttonText: { color: colors.deepBrown, fontSize: 14, fontWeight: '700' },
  request: { gap: 6, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 },
  shade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheetScroll: { maxHeight: '90%', flexGrow: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheet: {
    backgroundColor: colors.white,
    padding: 24,
    paddingBottom: 36,
    gap: 14,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    color: colors.deepBrown,
    fontSize: 17,
  },
});
