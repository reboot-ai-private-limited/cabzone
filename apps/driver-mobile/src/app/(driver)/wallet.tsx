import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { WalletTransactionDto } from '@cabzone/contracts';
import { useAuth } from '@/context/auth-context';
import { useDuty } from '@/context/duty-context';
import { walletApi } from '@/services/api';
import { colors, typography } from '@/design-system';
import { WalletMoneyPanel } from '@/components/driver/wallet-money-panel';

type TxFilter = 'ALL' | 'DEBIT' | 'CREDIT';
const TX_PAGE_SIZE = 20;

export default function DriverWalletScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { walletBalancePaise, summaryError, refreshSummary } = useDuty();
  const [txFilter, setTxFilter] = useState<TxFilter>('ALL');
  const [txItems, setTxItems] = useState<WalletTransactionDto[]>([]);
  const [txTotal, setTxTotal] = useState<number>(0);
  const [txHasMore, setTxHasMore] = useState<boolean>(false);
  const [isLoadingTx, setIsLoadingTx] = useState<boolean>(true);
  const [isLoadingMoreTx, setIsLoadingMoreTx] = useState<boolean>(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [walletRevision, setWalletRevision] = useState<number>(0);
  const txSeqRef = useRef(0);

  const loadFirstTxPage = useCallback(
    async (direction: TxFilter, opts?: { clearCurrent?: boolean }) => {
      if (!token) {
        setTxItems([]);
        setTxTotal(0);
        setTxHasMore(false);
        setIsLoadingTx(false);
        return;
      }
      const seq = ++txSeqRef.current;
      if (opts?.clearCurrent) {
        setTxItems([]);
        setTxTotal(0);
        setTxHasMore(false);
      }
      setIsLoadingTx(true);
      setTxError(null);
      try {
        const page = await walletApi.listMyTransactions(token, {
          direction,
          limit: TX_PAGE_SIZE,
          offset: 0,
        });
        if (txSeqRef.current !== seq) return;
        setTxItems(page.items);
        setTxTotal(page.total);
        setTxHasMore(page.hasMore);
      } catch (err: unknown) {
        if (txSeqRef.current !== seq) return;
        setTxError(err instanceof Error ? err.message : 'Unable to load wallet ledger entries.');
      } finally {
        if (txSeqRef.current === seq) {
          setIsLoadingTx(false);
        }
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) return;
    const seq = ++txSeqRef.current;
    walletApi
      .listMyTransactions(token, {
        direction: txFilter,
        limit: TX_PAGE_SIZE,
        offset: 0,
      })
      .then((page) => {
        if (txSeqRef.current !== seq) return;
        setTxItems(page.items);
        setTxTotal(page.total);
        setTxHasMore(page.hasMore);
        setTxError(null);
      })
      .catch((err: unknown) => {
        if (txSeqRef.current !== seq) return;
        setTxError(err instanceof Error ? err.message : 'Unable to load wallet ledger entries.');
      })
      .finally(() => {
        if (txSeqRef.current === seq) {
          setIsLoadingTx(false);
        }
      });
  }, [token, txFilter]);

  const handleSelectTxFilter = (next: TxFilter) => {
    if (next === txFilter) return;
    setTxItems([]);
    setTxTotal(0);
    setTxHasMore(false);
    setTxError(null);
    setIsLoadingTx(true);
    setTxFilter(next);
  };

  const handleLoadMoreTx = async () => {
    if (!token || isLoadingMoreTx || !txHasMore) return;
    const seq = txSeqRef.current;
    setIsLoadingMoreTx(true);
    setTxError(null);
    try {
      const page = await walletApi.listMyTransactions(token, {
        direction: txFilter,
        limit: TX_PAGE_SIZE,
        offset: txItems.length,
      });
      if (txSeqRef.current !== seq) return;
      setTxItems((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        const appended = page.items.filter((item) => !seen.has(item.id));
        return [...prev, ...appended];
      });
      setTxTotal(page.total);
      setTxHasMore(page.hasMore);
    } catch (err: unknown) {
      if (txSeqRef.current !== seq) return;
      setTxError(err instanceof Error ? err.message : 'Unable to load older wallet entries.');
    } finally {
      if (txSeqRef.current === seq) {
        setIsLoadingMoreTx(false);
      }
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refreshSummary(), loadFirstTxPage(txFilter)]);
    } finally {
      setIsRefreshing(false);
      setWalletRevision((value) => value + 1);
    }
  };

  const isNegative = walletBalancePaise != null && walletBalancePaise < 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>Wallet</Text>
        <Pressable
          style={styles.refreshBtn}
          onPress={handleRefresh}
          disabled={isRefreshing}
          accessibilityRole="button"
          accessibilityLabel="Refresh wallet">
          {isRefreshing ? (
            <ActivityIndicator size="small" color={colors.deepBrown} />
          ) : (
            <Ionicons name="refresh" size={18} color={colors.deepBrown} />
          )}
        </Pressable>
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
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>RECHARGE CREDIT</Text>
          <Text style={[styles.balanceValue, isNegative && { color: colors.error }]}>
            {walletBalancePaise != null ? `₹${(walletBalancePaise / 100).toFixed(2)}` : '—'}
          </Text>
          <Text style={styles.balanceSub}>
            {walletBalancePaise == null
              ? summaryError || 'Wallet balance is temporarily unavailable.'
              : isNegative
                ? 'Commission balance due. Settle dues with Cabzone Support to maintain uninterrupted dispatch.'
                : walletBalancePaise > 0
                  ? 'Recharge credit covers commission on cash trips.'
                  : 'Add money to cover commission on cash trips.'}
          </Text>

          {walletBalancePaise == null && summaryError ? (
            <Pressable
              style={styles.retryPill}
              accessibilityRole="button"
              accessibilityLabel="Retry loading wallet balance"
              onPress={handleRefresh}>
              <Text style={styles.retryPillText}>Retry Balance Sync</Text>
            </Pressable>
          ) : null}

          <View style={styles.noticeBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.deepBrown} />
            <Text style={styles.noticeText}>
              Wallet recharges and cashouts update this wallet balance only — they never inflate or
              reduce your passenger trip earnings.
            </Text>
          </View>
        </View>

        <WalletMoneyPanel refreshVersion={walletRevision} />

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          {(['ALL', 'DEBIT', 'CREDIT'] as TxFilter[]).map((key) => {
            const active = txFilter === key;
            return (
              <Pressable
                key={key}
                style={[styles.filterPill, active && styles.filterPillActive]}
                accessibilityRole="button"
                accessibilityLabel={key}
                accessibilityState={{ selected: active }}
                onPress={() => handleSelectTxFilter(key)}>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {key === 'ALL'
                    ? 'All Entries'
                    : key === 'DEBIT'
                      ? 'Commission & Debits'
                      : 'Top-Ups & Credits'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Server-Paginated Transactions List */}
        <View style={styles.ledgerCard}>
          <View style={styles.ledgerHeader}>
            <Text style={styles.ledgerTitle}>Transaction history</Text>
            {txItems.length > 0 ? (
              <Text style={styles.ledgerCount}>
                {txItems.length} of {txTotal}
              </Text>
            ) : null}
          </View>

          {txError && txItems.length === 0 ? (
            <View style={styles.txErrorBox}>
              <Text style={styles.txErrorText}>{txError}</Text>
              <Pressable
                style={styles.retryPill}
                accessibilityRole="button"
                accessibilityLabel="Retry loading transactions"
                onPress={() => void loadFirstTxPage(txFilter, { clearCurrent: true })}>
                <Text style={styles.retryPillText}>Retry</Text>
              </Pressable>
            </View>
          ) : isLoadingTx && txItems.length === 0 ? (
            <View style={styles.txLoadingBox}>
              <ActivityIndicator size="small" color={colors.deepBrown} />
              <Text style={styles.emptyText}>Loading ledger entries...</Text>
            </View>
          ) : txItems.length === 0 ? (
            <Text style={styles.emptyText}>No ledger entries match this filter.</Text>
          ) : (
            <>
              {txError ? (
                <View style={styles.inlineTxError}>
                  <Text style={styles.txErrorText}>{txError}</Text>
                  <Pressable accessibilityRole="button" onPress={handleLoadMoreTx}>
                    <Text style={styles.inlineRetryLink}>Retry</Text>
                  </Pressable>
                </View>
              ) : null}

              {txItems.map((tx) => {
                const isCredit = tx.type === 'CREDIT' || tx.type === 'REVERSAL';
                return (
                  <View key={tx.id} style={styles.txItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txRef}>
                        {tx.referenceType ? tx.referenceType.replace(/_/g, ' ') : tx.type}
                        {tx.bucket === 'EARNINGS' ? ' · Earnings' : ''}
                      </Text>
                      <Text style={styles.txDate}>
                        {new Date(tx.createdAt).toLocaleString('en-IN')}
                      </Text>
                      {tx.note ? <Text style={styles.txNote}>{tx.note}</Text> : null}
                      <Text style={styles.txBalanceAfter}>
                        Balance after: ₹{(tx.balanceAfterPaise / 100).toFixed(2)}
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
              })}

              {txHasMore ? (
                <Pressable
                  style={[styles.loadMoreBtn, isLoadingMoreTx && styles.disabledBtn]}
                  disabled={isLoadingMoreTx}
                  accessibilityRole="button"
                  accessibilityLabel="Load more transactions"
                  onPress={handleLoadMoreTx}>
                  {isLoadingMoreTx ? (
                    <ActivityIndicator size="small" color={colors.deepBrown} />
                  ) : (
                    <Text style={styles.loadMoreText}>Load older entries</Text>
                  )}
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backText: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  topTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  refreshBtn: {
    minWidth: 44,
    minHeight: 44,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.lightCream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
    gap: 16,
  },
  balanceCard: {
    backgroundColor: colors.cream,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.brandBrown,
    letterSpacing: 0.6,
  },
  balanceValue: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.deepBrown,
    marginVertical: 6,
  },
  balanceSub: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  retryPill: {
    backgroundColor: colors.amber,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    marginBottom: 12,
  },
  retryPillText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeText: {
    flex: 1,
    fontSize: 11,
    color: colors.deepBrown,
    lineHeight: 16,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    minHeight: 44,
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  filterPillActive: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  filterText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondary,
  },
  filterTextActive: {
    color: colors.deepBrown,
    fontWeight: '800',
  },
  ledgerCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  ledgerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ledgerTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  ledgerCount: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondary,
  },
  txLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  txErrorBox: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  inlineTxError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.amber,
  },
  txErrorText: {
    flex: 1,
    fontSize: typography.sizes.xs,
    color: colors.deepBrown,
    fontWeight: '600',
  },
  inlineRetryLink: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.brandBrown,
  },
  emptyText: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    paddingVertical: 12,
  },
  txItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  txRef: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  txDate: {
    fontSize: 11,
    color: colors.secondary,
    marginTop: 2,
  },
  txNote: {
    fontSize: 11,
    color: colors.deepBrown,
    marginTop: 2,
  },
  txBalanceAfter: {
    fontSize: 11,
    color: colors.secondary,
    marginTop: 2,
    fontWeight: '600',
  },
  txAmount: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
  },
  loadMoreBtn: {
    backgroundColor: colors.lightCream,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  loadMoreText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  disabledBtn: {
    opacity: 0.5,
  },
});
