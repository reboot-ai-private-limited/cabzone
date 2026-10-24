import React, { useMemo, useState } from 'react';
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
import { useDuty } from '@/context/duty-context';
import { colors, typography } from '@/design-system';
import { WalletMoneyPanel } from '@/components/driver/wallet-money-panel';

type TxFilter = 'ALL' | 'DEBIT' | 'CREDIT';

export default function DriverWalletScreen() {
  const router = useRouter();
  const { walletBalancePaise, walletTransactions, refreshSummary } = useDuty();
  const [txFilter, setTxFilter] = useState<TxFilter>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [walletRevision, setWalletRevision] = useState(0);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshSummary();
    } finally {
      setIsRefreshing(false);
      setWalletRevision((value) => value + 1);
    }
  };

  const filteredTx = useMemo(() => {
    return walletTransactions.filter((t) => {
      if (txFilter === 'ALL') return true;
      if (txFilter === 'CREDIT') return t.type === 'CREDIT' || t.type === 'REVERSAL';
      return t.type === 'DEBIT' || t.type === 'ADJUSTMENT';
    });
  }, [walletTransactions, txFilter]);

  const isNegative = (walletBalancePaise ?? 0) < 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>Wallet</Text>
        <Pressable
          style={styles.refreshBtn}
          onPress={handleRefresh}
          disabled={isRefreshing}
          accessibilityRole="button"
          accessibilityLabel="Refresh wallet"
        >
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
        }
      >
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>RECHARGE CREDIT</Text>
          <Text style={[styles.balanceValue, isNegative && { color: colors.error }]}>
            ₹{walletBalancePaise != null ? (walletBalancePaise / 100).toFixed(2) : '0.00'}
          </Text>
          <Text style={styles.balanceSub}>
            {isNegative
              ? 'Commission balance due. Settle dues with Cabzone Support to maintain uninterrupted dispatch.'
              : (walletBalancePaise ?? 0) > 0
                ? 'Recharge credit covers commission on cash trips.'
                : 'Add money to receive new ride offers.'}
          </Text>

          <View style={styles.noticeBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.deepBrown} />
            <Text style={styles.noticeText}>
              Wallet credits and top-ups increase your commission balance. They are separate from
              passenger trip earnings.
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
                onPress={() => setTxFilter(key)}
              >
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

        {/* Transactions List */}
        <View style={styles.ledgerCard}>
          <Text style={styles.ledgerTitle}>Transaction history</Text>
          {filteredTx.length === 0 ? (
            <Text style={styles.emptyText}>No ledger entries match this filter.</Text>
          ) : (
            filteredTx.map((tx) => {
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
                    ]}
                  >
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
  ledgerTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
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
});
