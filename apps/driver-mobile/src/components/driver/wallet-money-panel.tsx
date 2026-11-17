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
  Text,
  TextInput,
  View,
} from 'react-native';
import type { DriverWalletActivityDto, WalletOperationDto } from '@cabzone/contracts';
import { useAuth } from '@/context/auth-context';
import { useDuty } from '@/context/duty-context';
import { walletApi } from '@/services/api';
import { colors, createStyles } from '@/design-system';
import { walletAmountPaise, walletRequestKey } from './wallet-money-helpers';

// Mirrors the API limits (walletMoney.usecase.ts).
const MIN_RECHARGE_PAISE = 50_000;
const MIN_CASHOUT_PAISE = 20_000;

const money = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
const operationLabel = (entry: WalletOperationDto) =>
  entry.status === 'CREATED'
    ? 'Awaiting payment'
    : entry.status === 'PENDING'
      ? 'Processing'
      : entry.status === 'PROCESSING'
        ? 'Sending payout'
        : entry.status === 'REJECTED'
          ? 'Returned'
          : entry.kind === 'RECHARGE'
            ? 'Added'
            : entry.testMode
              ? 'Paid · Test'
              : 'Paid';

export function WalletMoneyPanel({ refreshVersion = 0 }: { refreshVersion?: number }) {
  const { token } = useAuth();
  const { refreshSummary } = useDuty();
  const [activity, setActivity] = useState<DriverWalletActivityDto | null>(null);
  const [form, setForm] = useState<'recharge' | 'cashout' | null>(null);
  const [amount, setAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [method, setMethod] = useState<'upi' | 'bank'>('upi');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [holderName, setHolderName] = useState('');
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
    if (!amountPaise || (form === 'recharge' && amountPaise < MIN_RECHARGE_PAISE) ||
      (form === 'cashout' && amountPaise < MIN_CASHOUT_PAISE)) {
      setError(
        form === 'recharge'
          ? 'Enter ₹500 to ₹1,00,000.'
          : 'Enter ₹200 to ₹1,00,000 with up to two decimal places.',
      );
      return;
    }
    if (form === 'cashout' && amountPaise > (activity?.availableCashoutPaise ?? 0)) {
      setError('Amount exceeds your available cashout balance.');
      return;
    }
    let destination:
      | { upiId: string }
      | { bank: { accountNumber: string; ifsc: string; accountHolderName: string } }
      | null = null;
    if (form === 'cashout') {
      if (method === 'upi') {
        if (!/^[a-z0-9._-]{2,256}@[a-z0-9][a-z0-9.-]{1,63}$/i.test(upiId.trim())) {
          setError('Enter a valid UPI ID, for example name@bank.');
          return;
        }
        destination = { upiId: upiId.trim().toLowerCase() };
      } else {
        const account = accountNumber.replace(/\s/g, '');
        const code = ifsc.trim().toUpperCase();
        if (!/^\d{9,18}$/.test(account)) {
          setError('Enter a valid bank account number (9–18 digits).');
          return;
        }
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) {
          setError('Enter a valid 11-character IFSC code, for example HDFC0001234.');
          return;
        }
        if (holderName.trim().length < 2) {
          setError('Enter the account holder name as it appears at your bank.');
          return;
        }
        destination = {
          bank: { accountNumber: account, ifsc: code, accountHolderName: holderName.trim() },
        };
      }
    }
    const destinationKey = !destination
      ? ''
      : 'upiId' in destination
        ? destination.upiId
        : `${destination.bank.accountNumber}:${destination.bank.ifsc}`;
    const details = `${form}:${amountPaise}:${destinationKey}`;
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
        if (!destination) return;
        const result = await walletApi.cashout(token, amountPaise, destination, key.current.id);
        setForm(null);
        key.current = null;
        setAccountNumber('');
        setMessage(
          result.status === 'COMPLETED'
            ? 'Cashout paid. Check the transfer reference below.'
            : result.status === 'REJECTED'
              ? 'Cashout was rejected. Check the reason below; reserved funds will return to your wallet.'
              : 'Cashout requested. Track its payout status below.',
        );
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
      {activity?.testMode ? (
        <Text style={styles.caption}>Test mode · No real money is charged or sent.</Text>
      ) : null}
      {activity ? (
        <>
          <View style={styles.row}>
            <Text style={styles.label}>Wallet balance</Text>
            <Text style={styles.value}>{money(activity.commissionBalancePaise)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Available to cash out</Text>
            <Text style={styles.value}>{money(activity.availableCashoutPaise)}</Text>
          </View>
          {activity.pendingCashoutPaise > 0 ? (
            <Text style={styles.caption}>
              {money(activity.pendingCashoutPaise)} is reserved for cashout. Check its status below.
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
        Cash fares are already with you. Your wallet balance (recharges plus online earnings, less
        commission) can be cashed out after dues are cleared.
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
            activity.availableCashoutPaise < MIN_CASHOUT_PAISE ||
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
                ? `${activity?.testMode ? 'Test UPI recharge' : 'UPI recharge'} · ₹500 minimum.`
                : 'Minimum ₹200. Request a transfer to your UPI ID or bank account and track its status here. Finance may need to process it. Rejected payouts return to your wallet. Withdrawing all recharge credit can stop new ride offers.'}
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
                <View style={styles.row}>
                  <Pressable
                    style={[styles.button, method === 'upi' && styles.primary]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: method === 'upi' }}
                    disabled={busy}
                    onPress={() => setMethod('upi')}
                  >
                    <Text style={styles.buttonText}>UPI ID</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.button, method === 'bank' && styles.primary]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: method === 'bank' }}
                    disabled={busy}
                    onPress={() => setMethod('bank')}
                  >
                    <Text style={styles.buttonText}>Bank account</Text>
                  </Pressable>
                </View>
                {method === 'upi' ? (
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
                ) : (
                  <>
                    <Text style={styles.label}>Account holder name</Text>
                    <TextInput
                      style={styles.input}
                      value={holderName}
                      onChangeText={setHolderName}
                      autoCapitalize="words"
                      accessibilityLabel="Account holder name"
                      placeholder="As on your bank account"
                      editable={!busy}
                    />
                    <Text style={styles.label}>Account number</Text>
                    <TextInput
                      style={styles.input}
                      value={accountNumber}
                      onChangeText={setAccountNumber}
                      keyboardType="number-pad"
                      secureTextEntry
                      accessibilityLabel="Bank account number"
                      editable={!busy}
                    />
                    <Text style={styles.label}>IFSC code</Text>
                    <TextInput
                      style={styles.input}
                      value={ifsc}
                      onChangeText={(text) => setIfsc(text.toUpperCase())}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={11}
                      accessibilityLabel="Bank IFSC code"
                      placeholder="HDFC0001234"
                      editable={!busy}
                    />
                  </>
                )}
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
                  {form === 'recharge' ? 'Continue to secure payment' : 'Confirm cashout request'}
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

const styles = createStyles(() => ({
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
}));
