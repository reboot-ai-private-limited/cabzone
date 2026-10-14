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
import { computeRideEarningsBreakdown, useDuty } from '@/context/duty-context';
import { colors, typography } from '@/design-system';

type PeriodTab = 'TODAY' | 'WEEK' | 'MONTH' | 'ALL';

const PERIOD_TABS: { key: PeriodTab; label: string }[] = [
  { key: 'TODAY', label: 'Today' },
  { key: 'WEEK', label: 'Last 7 Days' },
  { key: 'MONTH', label: 'Last 30 Days' },
  { key: 'ALL', label: 'All Time' },
];

export default function DriverEarningsTab() {
  const router = useRouter();
  const { myRides, walletBalancePaise, walletTransactions, refreshSummary } = useDuty();
  const [period, setPeriod] = useState<PeriodTab>('TODAY');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshSummary();
    } finally {
      setIsRefreshing(false);
    }
  };

  const settledRides = useMemo(() => {
    const nowDate = new Date();
    const nowMs = nowDate.getTime();
    const todayStr = nowDate.toDateString();

    return myRides.filter((r) => {
      if (r.status !== 'SETTLED' && r.status !== 'PAYMENT_CONFIRMED') {
        return false;
      }
      const tsStr = r.settledAt || r.completedAt || r.updatedAt || r.createdAt;
      const ts = new Date(tsStr).getTime();
      if (Number.isNaN(ts)) return false;

      if (period === 'TODAY') {
        return new Date(ts).toDateString() === todayStr;
      }
      if (period === 'WEEK') {
        return nowMs - ts <= 7 * 24 * 60 * 60 * 1000;
      }
      if (period === 'MONTH') {
        return nowMs - ts <= 30 * 24 * 60 * 60 * 1000;
      }
      return true;
    });
  }, [myRides, period]);

  const metrics = useMemo(() => {
    let grossPaise = 0;
    let commissionPaise = 0;
    let netPaise = 0;

    for (const r of settledRides) {
      const b = computeRideEarningsBreakdown(r);
      grossPaise += b.grossPaise;
      commissionPaise += b.commissionPaise;
      netPaise += b.netPaise;
    }

    return {
      grossPaise,
      commissionPaise,
      netPaise,
      tripsCount: settledRides.length,
    };
  }, [settledRides]);

  const recentLedger = useMemo(() => walletTransactions.slice(0, 5), [walletTransactions]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Earnings & Commission</Text>
          <Text style={styles.subtitle}>Direct passenger collection & 8% platform ledger</Text>
        </View>
        <Pressable
          style={styles.refreshBtn}
          onPress={handleRefresh}
          disabled={isRefreshing}
          accessibilityRole="button"
          accessibilityLabel="Refresh earnings">
          {isRefreshing ? (
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
              onPress={() => setPeriod(t.key)}>
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
        {/* Primary Net Earnings Card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>NET DRIVER EARNINGS ({period})</Text>
          <Text style={styles.heroValue}>₹{(metrics.netPaise / 100).toFixed(2)}</Text>
          <Text style={styles.heroSub}>
            Across {metrics.tripsCount} settled {metrics.tripsCount === 1 ? 'trip' : 'trips'}
          </Text>

          <View style={styles.heroBreakdownStrip}>
            <View style={styles.heroCol}>
              <Text style={styles.heroColLabel}>Gross Collected</Text>
              <Text style={styles.heroColVal}>₹{(metrics.grossPaise / 100).toFixed(2)}</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroCol}>
              <Text style={styles.heroColLabel}>Platform Fee (8%)</Text>
              <Text style={[styles.heroColVal, { color: colors.brandBrown }]}>
                -₹{(metrics.commissionPaise / 100).toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Wallet & Commission Ledger Card */}
        <Pressable style={styles.walletCard} onPress={() => router.push('/(driver)/wallet')}>
          <View style={styles.walletCardTop}>
            <View style={styles.walletIconBox}>
              <Ionicons name="wallet-outline" size={22} color={colors.deepBrown} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.walletLabel}>Platform Commission Wallet</Text>
              <Text
                style={[
                  styles.walletBalance,
                  walletBalancePaise != null && walletBalancePaise < 0
                    ? { color: colors.error }
                    : null,
                ]}>
                ₹{walletBalancePaise != null ? (walletBalancePaise / 100).toFixed(2) : '0.00'}
              </Text>
            </View>
            <View style={styles.walletOpenPill}>
              <Text style={styles.walletOpenText}>Full Ledger →</Text>
            </View>
          </View>
          <Text style={styles.walletExplain}>
            Passengers pay you 100% of the fare directly in Cash or UPI. The 8% platform commission is deducted from this wallet balance upon settlement.
          </Text>
        </Pressable>

        {/* Recent Ledger Entries */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Wallet Entries</Text>
            <Pressable onPress={() => router.push('/(driver)/wallet')}>
              <Text style={styles.sectionLink}>See all</Text>
            </Pressable>
          </View>

          {recentLedger.length === 0 ? (
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

const styles = StyleSheet.create({
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
    borderColor: colors.warmBeige,
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
    borderColor: colors.warmBeige,
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
});
