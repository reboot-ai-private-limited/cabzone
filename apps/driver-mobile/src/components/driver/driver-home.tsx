import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '@/context/auth-context';

export function DriverHome() {
  const { user, driverProfile, logout, isLoading } = useAuth();

  const phone = user?.phoneE164 || '';
  const isVerified = driverProfile?.kycStatus === 'VERIFIED';
  const isOperational = driverProfile?.status === 'ACTIVE';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top App Bar */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.appTitle}>Cabzone</Text>
            <Text style={styles.appSubtitle}>Driver Partner Portal</Text>
          </View>
          <View style={[styles.badge, isOperational ? styles.badgeApproved : styles.badgePending]}>
            <Text style={[styles.badgeText, isOperational ? styles.badgeTextApproved : styles.badgeTextPending]}>
              {isOperational ? '● ACTIVE' : '● PENDING'}
            </Text>
          </View>
        </View>

        {/* Driver Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarIcon}>👨‍✈️</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.driverName}>Driver Partner</Text>
            <Text style={styles.driverPhone}>{phone}</Text>
            <View style={styles.kycRow}>
              <Text style={styles.kycTag}>KYC: {driverProfile?.kycStatus || 'PENDING'}</Text>
              <Text style={styles.idTag}>ID: {user?.id.slice(0, 8)}</Text>
            </View>
          </View>
        </View>

        {/* Duty Status Placeholder Card (Foundation for Step 2) */}
        <View style={styles.dutyCard}>
          <View style={styles.dutyHeader}>
            <Text style={styles.dutyTitle}>Duty Status</Text>
            <Text style={styles.dutySub}>
              Current Mode: {driverProfile?.operationalStatus || 'OFFLINE'}
            </Text>
          </View>
          <View style={styles.offlineBox}>
            <Text style={styles.offlineText}>Currently OFFLINE</Text>
            <Text style={styles.offlineNote}>
              Duty toggle, radar map, and live GPS location tracking will be enabled in the next step.
            </Text>
          </View>
        </View>

        {/* Performance & Trust Metric Tiles */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Rating</Text>
            <Text style={styles.statValue}>
              {driverProfile?.ratingAverage != null ? driverProfile.ratingAverage.toFixed(1) : '5.0'} ⭐
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Trust Score</Text>
            <Text style={styles.statValue}>
              {driverProfile?.trustScore ?? 100}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Status</Text>
            <Text style={[styles.statValue, { fontSize: 13 }]}>
              {isVerified ? 'VERIFIED' : 'PENDING'}
            </Text>
          </View>
        </View>

        {/* Operational Guidelines Card */}
        <View style={styles.infoCard}>
          <Text style={styles.cardHeader}>Dev Mode Connected</Text>
          <Text style={styles.infoText}>
            Logged in securely via token session. In the next step, we will wire up the Online / Offline Duty switch and live GPS tracking.
          </Text>
        </View>

        {/* Logout Button */}
        <Pressable
          style={styles.logoutButton}
          onPress={logout}
          disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator color="#b91c1c" />
          ) : (
            <Text style={styles.logoutText}>Log Out</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#002451',
  },
  appSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  badgeApproved: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  badgePending: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  badgeTextApproved: {
    color: '#15803d',
  },
  badgeTextPending: {
    color: '#b45309',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    shadowColor: '#002451',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarIcon: {
    fontSize: 26,
  },
  profileInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  driverPhone: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginTop: 2,
  },
  kycRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  kycTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  idTag: {
    fontSize: 11,
    color: '#94a3b8',
    paddingVertical: 2,
  },
  dutyCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  dutyHeader: {
    marginBottom: 10,
  },
  dutyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  dutySub: {
    fontSize: 12,
    color: '#64748b',
  },
  offlineBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  offlineText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
  },
  offlineNote: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#002451',
  },
  infoCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20,
  },
  cardHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },
  logoutButton: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#b91c1c',
  },
});
