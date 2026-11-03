import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { DriverEarningsPeriod, DriverEarningsSummaryDto } from '@cabzone/contracts';
import { useAuth } from '@/context/auth-context';
import { useDuty } from '@/context/duty-context';
import { ridesApi } from '@/services/api';
import { colors, typography, createStyles } from '@/design-system';

const PERIOD_TABS: { key: DriverEarningsPeriod; label: string }[] = [
  { key: 'TODAY', label: 'Today' },
  { key: 'WEEK', label: 'Last 7 Days' },
  { key: 'MONTH', label: 'Last 30 Days' },
  { key: 'ALL', label: 'All Time' },
];

export default function DriverEarningsTab() {
  const router = useRouter();
  const { token } = useAuth();
  const { walletBalancePaise, walletTransactions, summaryError, refreshSummary } = useDuty();
  const [period, setPeriod] = useState<DriverEarningsPeriod>('TODAY');
  const [summary, setSummary] = useState<DriverEarningsSummaryDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const loadPeriodSummary = useCallback(
    async (targetPeriod: DriverEarningsPeriod, opts?: { clearCurrent?: boolean }) => {
      if (!token) {
        setSummary(null);
        setIsLoading(false);
        return;
      }
      const seq = ++requestSeqRef.current;
      if (opts?.clearCurrent) {
        setSummary(null);
      }
      setIsLoading(true);
      setLoadError(null);
      try {
        const res = await ridesApi.getDriverEarnings(token, targetPeriod);
        if (requestSeqRef.current !== seq) return;
        setSummary(res);
      } catch (err: unknown) {
        if (requestSeqRef.current !== seq) return;
        setLoadError(
          err instanceof Error ? err.message : 'Unable to load server earnings summary.',
        );
      } finally {
        if (requestSeqRef.current === seq) {
          setIsLoading(false);
        }
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) return;
    const seq = ++requestSeqRef.current;
    ridesApi
      .getDriverEarnings(token, period)
      .then((res) => {
        if (requestSeqRef.current !== seq) return;
        setSummary(res);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (requestSeqRef.current !== seq) return;
        setLoadError(
          err instanceof Error ? err.message : 'Unable to load server earnings summary.',
        );
      })
      .finally(() => {
        if (requestSeqRef.current === seq) {
          setIsLoading(false);
        }
      });
  }, [token, period]);

  const handleSelectPeriod = (next: DriverEarningsPeriod) => {
    if (next === period) return;
    setSummary(null);
    setLoadError(null);
    setIsLoading(true);
    setPeriod(next);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadPeriodSummary(period), refreshSummary()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const recentLedger = useMemo(() => walletTransactions.slice(0, 5), [walletTransactions]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Earnings & Commission</Text>
          <Text style={styles.subtitle}>
            Server-verified trip earnings & platform ledger (IST)
          </Text>
        </View>
        <Pressable
          style={styles.refreshBtn}
          onPress={handleRefresh}
          disabled={isRefreshing || isLoading}
          accessibilityRole="button"
          accessibilityLabel="Refresh earnings">
          {isRefreshing || isLoading ? (
            <ActivityIndicator size="small" color={colors.deepBrown} />
          ) : (
            <Ionicons name="refresh" size={18} color={colors.deepBrown} />
          )}
        </Pressable>
      </View>

      {/* Period Selector */}
      <View style={styles.periodBar}>
        {PERIOD_TABS.map((t) => {
          const active = period === t.key;
          return (
            <Pressable
              key={t.key}
              style={[styles.periodBtn, active && styles.periodBtnActive]}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              onPress={() => handleSelectPeriod(t.key)}>
              <Text style={[styles.periodBtnText, active && styles.periodBtnTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.deepBrown}
          />
        }>
        {/* Primary Net Earnings Card or Explicit Unavailable State */}
        {loadError && !summary ? (
          <View style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={32} color={colors.brandBrown} />
            <Text style={styles.errorTitle}>Earnings summary unavailable</Text>
            <Text style={styles.errorSub}>{loadError}</Text>
            <Pressable
              style={styles.retryBtn}
              accessibilityRole="button"
              accessibilityLabel="Retry loading earnings"
              onPress={() => void loadPeriodSummary(period, { clearCurrent: true })}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : !summary ? (
          <View style={styles.heroCard}>
            <ActivityIndicator size="small" color={colors.deepBrown} />
            <Text style={styles.loadingLabel}>Loading server earnings...</Text>
          </View>
        ) : (
          <>
            {loadError ? (
              <View style={styles.inlineWarning}>
                <Text style={styles.inlineWarningText}>
                  Showing last synced totals · {loadError}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void loadPeriodSummary(period)}>
                  <Text style={styles.inlineRetryLink}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.heroCard}>
              <Text style={styles.heroLabel}>NET DRIVER EARNINGS ({summary.period})</Text>
              <Text style={styles.heroValue}>
                ₹{(summary.netEarningsPaise / 100).toFixed(2)}
              </Text>
              <Text style={styles.heroSub}>
                Across {summary.completedTripsCount} settled{' '}
                {summary.completedTripsCount === 1 ? 'trip' : 'trips'} · {summary.timezone}
              </Text>

              <View style={styles.heroBreakdownStrip}>
                <View style={styles.heroCol}>
                  <Text style={styles.heroColLabel}>Gross Fare</Text>
                  <Text style={styles.heroColVal}>
                    ₹{(summary.grossFarePaise / 100).toFixed(2)}
                  </Text>
                  <Text style={styles.heroColHint}>
                    Cash ₹{(summary.cashGrossPaise / 100).toFixed(0)} · Online ₹
                    {(summary.onlineGrossPaise / 100).toFixed(0)}
                  </Text>
                </View>
                <View style={styles.heroDivider} />
                <View style={styles.heroCol}>
                  <Text style={styles.heroColLabel}>Net Platform Fee</Text>
                  <Text style={[styles.heroColVal, { color: colors.brandBrown }]}>
                    -₹{(summary.netCommissionPaise / 100).toFixed(2)}
                  </Text>
                  {summary.commissionRefundedPaise > 0 ? (
                    <Text style={styles.heroColRefund}>
                      Refunded +₹{(summary.commissionRefundedPaise / 100).toFixed(2)}
                    </Text>
                  ) : (
                    <Text style={styles.heroColHint}>Ledger verified</Text>
                  )}
                </View>
              </View>
            </View>

            {summary.pendingPaymentTripsCount > 0 ? (
              <View style={styles.statusNoticeCard}>
                <Ionicons name="time-outline" size={20} color={colors.brandBrown} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusNoticeTitle}>
                    {summary.pendingPaymentTripsCount} completed{' '}
                    {summary.pendingPaymentTripsCount === 1 ? 'trip' : 'trips'} awaiting payment
                  </Text>
                  <Text style={styles.statusNoticeSub}>
                    ₹{(summary.pendingPaymentGrossPaise / 100).toFixed(2)} gross is excluded from
                    settled earnings until payment is confirmed.
                  </Text>
                </View>
              </View>
            ) : null}

            {summary.disputedTripsCount > 0 ? (
              <View style={styles.statusNoticeCard}>
                <Ionicons name="alert-circle-outline" size={20} color={colors.brandBrown} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusNoticeTitle}>
                    {summary.disputedTripsCount}{' '}
                    {summary.disputedTripsCount === 1 ? 'trip' : 'trips'} under payment review
                  </Text>
                  <Text style={styles.statusNoticeSub}>
                    ₹{(summary.disputedGrossPaise / 100).toFixed(2)} is held out of settled totals
                    until support resolves the dispute.
                  </Text>
                </View>
              </View>
            ) : null}

            {summary.cancellationCompensationPaise > 0 ? (
              <View style={styles.statusNoticeCard}>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusNoticeTitle}>
                    Cancellation compensation: +₹
                    {(summary.cancellationCompensationPaise / 100).toFixed(2)}
                  </Text>
                  <Text style={styles.statusNoticeSub}>
                    Credited separately to your wallet without inflating completed trip counts.
                  </Text>
                </View>
              </View>
            ) : null}
          </>
        )}

        {/* Wallet & Commission Ledger Card */}
        <Pressable
          style={styles.walletCard}
          accessibilityRole="button"
          onPress={() => router.push('/(driver)/wallet')}>
          <View style={styles.walletCardTop}>
            <View style={styles.walletIconBox}>
              <Ionicons name="wallet-outline" size={22} color={colors.deepBrown} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.walletLabel}>Platform Commission & Earnings Wallet</Text>
              <Text
                style={[
                  styles.walletBalance,
                  walletBalancePaise != null && walletBalancePaise < 0
                    ? { color: colors.error }
                    : null,
                ]}>
                {walletBalancePaise != null
                  ? `₹${(walletBalancePaise / 100).toFixed(2)}`
                  : '—'}
              </Text>
              {walletBalancePaise == null && summaryError ? (
                <Text style={styles.walletUnavailableText}>Wallet balance unavailable</Text>
              ) : null}
            </View>
            <View style={styles.walletOpenPill}>
              <Text style={styles.walletOpenText}>Full Ledger →</Text>
            </View>
          </View>
          <Text style={styles.walletExplain}>
            Cash trip commission is deducted from your recharge balance; Razorpay online UPI trip
            payouts credit your withdrawable earnings bucket directly. Wallet top-ups and cashouts
            never alter trip earnings above.
          </Text>
        </Pressable>

        {/* Recent Ledger Entries */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Wallet Entries</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(driver)/wallet')}>
              <Text style={styles.sectionLink}>See all</Text>
            </Pressable>
          </View>

          {walletBalancePaise == null && summaryError ? (
            <Text style={styles.emptyText}>
              Recent wallet entries unavailable. Pull to refresh or retry above.
            </Text>
          ) : recentLedger.length === 0 ? (
            <Text style={styles.emptyText}>No wallet ledger transactions recorded yet.</Text>
          ) : (
            recentLedger.map((tx) => {
              const isCredit = tx.type === 'CREDIT' || tx.type === 'REVERSAL';
              return (
                <View key={tx.id} style={styles.txRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txTitle}>
                      {tx.referenceType ? tx.referenceType.replace(/_/g, ' ') : tx.type}
                    </Text>
                    <Text style={styles.txSub}>
                      {new Date(tx.createdAt).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {tx.note ? ` · ${tx.note}` : ''}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.txAmount,
                      isCredit ? { color: colors.success } : { color: colors.brandBrown },
                    ]}>
                    {isCredit ? '+' : '-'}₹{(Math.abs(tx.amountPaise) / 100).toFixed(2)}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = createStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    marginTop: 2,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.lightCream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  periodBtnActive: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  periodBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondary,
  },
  periodBtnTextActive: {
    color: colors.deepBrown,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
    gap: 16,
  },
  heroCard: {
    backgroundColor: colors.cream,
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  loadingLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: colors.secondary,
    marginTop: 8,
  },
  errorCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.amber,
    alignItems: 'center',
    gap: 8,
  },
  errorTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  errorSub: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 4,
    backgroundColor: colors.amber,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  inlineWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.amber,
  },
  inlineWarningText: {
    flex: 1,
    fontSize: 11,
    color: colors.deepBrown,
    fontWeight: '600',
  },
  inlineRetryLink: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.brandBrown,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.brandBrown,
    letterSpacing: 0.6,
  },
  heroValue: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.deepBrown,
    marginVertical: 4,
  },
  heroSub: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    fontWeight: '600',
    marginBottom: 16,
  },
  heroBreakdownStrip: {
    flexDirection: 'row',
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 14,
  },
  heroCol: {
    flex: 1,
    alignItems: 'center',
  },
  heroDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  heroColLabel: {
    fontSize: 11,
    color: colors.secondary,
    fontWeight: '600',
  },
  heroColVal: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
    marginTop: 2,
  },
  heroColHint: {
    fontSize: 10,
    color: colors.secondary,
    marginTop: 2,
  },
  heroColRefund: {
    fontSize: 10,
    color: colors.success,
    fontWeight: '700',
    marginTop: 2,
  },
  statusNoticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusNoticeTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  statusNoticeSub: {
    fontSize: 11,
    color: colors.secondary,
    lineHeight: 16,
    marginTop: 2,
  },
  walletCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  walletCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  walletIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.lightCream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletLabel: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    fontWeight: '600',
  },
  walletBalance: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.deepBrown,
    marginTop: 2,
  },
  walletUnavailableText: {
    fontSize: 11,
    color: colors.brandBrown,
    fontWeight: '600',
    marginTop: 2,
  },
  walletOpenPill: {
    backgroundColor: colors.amber,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  walletOpenText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  walletExplain: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  sectionLink: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.brandBrown,
  },
  emptyText: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    paddingVertical: 8,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  txTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  txSub: {
    fontSize: 11,
    color: colors.secondary,
    marginTop: 2,
  },
  txAmount: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
  },
}));
