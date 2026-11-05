import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, createStyles } from '@/design-system';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useAuth } from '@/context/auth-context';

export function KycPendingHome() {
  const { user, driver, application, refreshProfile, testApprove, logout } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const displayName = driver?.name || user?.phoneE164 || 'Driver Partner';

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setStatusMsg(null);
    try {
      await refreshProfile();
      setStatusMsg('Status refreshed');
    } catch {
      setStatusMsg('Failed to refresh status');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDevApprove = async () => {
    setIsApproving(true);
    setStatusMsg(null);
    try {
      const ok = await testApprove();
      if (!ok) {
        setStatusMsg('Fast-track approval failed');
      }
    } catch {
      setStatusMsg('Fast-track approval error');
    } finally {
      setIsApproving(false);
    }
  };

  const appStatus = application?.status || 'SUBMITTED';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top Header */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.greetingText}>{getGreeting()},</Text>
            <Text style={styles.driverName}>{displayName}</Text>
          </View>
          <View style={styles.underReviewBadge}>
            <Text style={styles.underReviewDot}>●</Text>
            <Text style={styles.underReviewText}>UNDER REVIEW</Text>
          </View>
        </View>

        {/* Status Message Notification */}
        {statusMsg ? (
          <View style={styles.statusToast}>
            <Text style={styles.statusToastText}>{statusMsg}</Text>
          </View>
        ) : null}

        {/* Flow 13 — Verification in Progress Hero Card */}
        <View style={styles.verificationCard}>
          <View style={styles.shieldIconCircle}>
            <Text style={styles.shieldIcon}>🛡️</Text>
          </View>

          <Text style={styles.cardHeading}>Verification in progress</Text>
          <Text style={styles.cardSubheading}>
            We&apos;re reviewing your documents. Our compliance team verifies your driving license, vehicle
            RC, and background before activating your account.
          </Text>

          {/* Stepper Timeline */}
          <View style={styles.timeline}>
            <View style={styles.timelineRow}>
              <View style={[styles.dotCircle, styles.dotDone]}>
                <Text style={styles.dotDoneCheck}>✓</Text>
              </View>
              <View style={styles.timelineTextWrap}>
                <Text style={[styles.timelineLabel, styles.labelDone]}>Application submitted</Text>
                <Text style={styles.timelineSub}>Details and documents received</Text>
              </View>
            </View>

            <View style={styles.timelineTrack} />

            <View style={styles.timelineRow}>
              <View style={[styles.dotCircle, styles.dotActive]}>
                <Text style={styles.dotActiveIcon}>●</Text>
              </View>
              <View style={styles.timelineTextWrap}>
                <Text style={[styles.timelineLabel, styles.labelActive]}>Documents under review</Text>
                <Text style={styles.timelineSub}>
                  {appStatus === 'UNDER_REVIEW_ADMIN'
                    ? 'Senior admin reviewing credentials'
                    : 'Automated identity checks in progress'}
                </Text>
              </View>
            </View>

            <View style={styles.timelineTrack} />

            <View style={styles.timelineRow}>
              <View style={[styles.dotCircle, styles.dotPending]}>
                <Text style={styles.dotPendingIcon}>○</Text>
              </View>
              <View style={styles.timelineTextWrap}>
                <Text style={[styles.timelineLabel, styles.labelPending]}>Account approved</Text>
                <Text style={styles.timelineSub}>You can then go online & receive rides</Text>
              </View>
            </View>
          </View>

          <View style={styles.cardFooterNotice}>
            <Text style={styles.cardFooterNoticeText}>
              🔔 We&apos;ll notify you when you&apos;re ready to drive.
            </Text>
          </View>

          {/* Refresh Action Button */}
          <Pressable
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.btnPressed]}
            onPress={handleRefresh}
            disabled={isRefreshing}>
            {isRefreshing ? (
              <ActivityIndicator color="#12304A" size="small" />
            ) : (
              <Text style={styles.refreshBtnText}>🔄 Check Verification Status</Text>
            )}
          </Pressable>
        </View>

        {/* Today's KPI Preview Strip */}
        <View style={styles.kpiContainer}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Today&apos;s Earnings</Text>
            <Text style={styles.kpiValue}>₹0</Text>
            <Text style={styles.kpiSub}>Account pending</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Completed Rides</Text>
            <Text style={styles.kpiValue}>0</Text>
            <Text style={styles.kpiSub}>Trips today</Text>
          </View>
        </View>

        {/* Developer Quick-Approve Banner (Only in Dev Mode) */}
        {__DEV__ ? <View style={styles.devCard}>
          <View style={styles.devHeader}>
            <Text style={styles.devBadge}>⚡ DEV MODE TESTER</Text>
          </View>
          <Text style={styles.devTitle}>Fast-Track Approval</Text>
          <Text style={styles.devSub}>
            Simulate administrative KYC verification instantly to test Flow 14 (Approved / OFFLINE) and
            going online.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.devBtn, pressed && styles.btnPressed]}
            onPress={handleDevApprove}
            disabled={isApproving}>
            {isApproving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.devBtnText}>⚡ Fast-Track / Test Approve</Text>
            )}
          </Pressable>
        </View> : null}

        {/* Footer Logout */}
        <Pressable onPress={logout} style={styles.logoutBtn} hitSlop={12}>
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = createStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greetingText: {
    fontSize: typography.sizes.label,
    color: colors.secondary,
    fontWeight: '500',
  },
  driverName: {
    fontSize: typography.sizes.xl,
    fontWeight: '800',
    color: colors.text,
  },
  underReviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  underReviewDot: {
    fontSize: typography.sizes.xs,
    color: '#D97706',
  },
  underReviewText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  statusToast: {
    backgroundColor: '#E0F2FE',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  statusToastText: {
    fontSize: typography.sizes.sm,
    color: '#0369A1',
    fontWeight: '600',
    textAlign: 'center',
  },
  verificationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    marginBottom: 20,
  },
  shieldIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  shieldIcon: {
    fontSize: typography.sizes.xxl,
  },
  cardHeading: {
    fontSize: typography.sizes.xl,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  cardSubheading: {
    fontSize: typography.sizes.label,
    color: colors.secondary,
    lineHeight: 20,
    marginBottom: 24,
  },
  timeline: {
    gap: 0,
    marginBottom: 20,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  timelineTrack: {
    width: 2,
    height: 24,
    backgroundColor: colors.border,
    marginLeft: 14,
  },
  dotCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: {
    backgroundColor: '#DCFCE7',
  },
  dotDoneCheck: {
    fontSize: typography.sizes.label,
    fontWeight: '800',
    color: '#16A34A',
  },
  dotActive: {
    backgroundColor: '#FEF3C7',
  },
  dotActiveIcon: {
    fontSize: typography.sizes.label,
    color: '#D97706',
  },
  dotPending: {
    backgroundColor: '#F3F4F6',
  },
  dotPendingIcon: {
    fontSize: typography.sizes.base,
    color: '#9CA3AF',
  },
  timelineTextWrap: {
    flex: 1,
    paddingTop: 4,
  },
  timelineLabel: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
  },
  labelDone: {
    color: '#16A34A',
  },
  labelActive: {
    color: '#B45309',
  },
  labelPending: {
    color: '#9CA3AF',
  },
  timelineSub: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    marginTop: 2,
  },
  cardFooterNotice: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  cardFooterNoticeText: {
    fontSize: typography.sizes.sm,
    color: '#4B5563',
    fontWeight: '600',
    textAlign: 'center',
  },
  refreshBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  refreshBtnText: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.darkNavy,
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  kpiContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kpiLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: colors.secondary,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  kpiSub: {
    fontSize: typography.sizes.xs,
    color: '#9CA3AF',
    marginTop: 2,
  },
  devCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  devHeader: {
    marginBottom: 8,
  },
  devBadge: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 1,
  },
  devTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  devSub: {
    fontSize: typography.sizes.sm,
    color: '#94A3B8',
    lineHeight: 18,
    marginBottom: 16,
  },
  devBtn: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devBtnText: {
    fontSize: typography.sizes.label,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  logoutBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  logoutText: {
    fontSize: typography.sizes.label,
    fontWeight: '700',
    color: '#9CA3AF',
  },
}));
