import React, { useEffect, useState } from 'react';
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
import { useDuty } from '@/context/duty-context';

export function DriverHome() {
  const { user, driver, logout, isLoading: isAuthLoading } = useAuth();
  const {
    status,
    isToggling,
    coords,
    lastTransmittedAt,
    locationStatus,
    todayEarningsPaise,
    todayCompletedTrips,
    walletBalancePaise,
    error,
    clearError,
    goOnline,
    goOffline,
  } = useDuty();

  const [timeAgo, setTimeAgo] = useState('just now');
  const [isVerifyingOnline, setIsVerifyingOnline] = useState(false);

  // Update telemetry freshness label every second
  useEffect(() => {
    if (!lastTransmittedAt) return;
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - lastTransmittedAt.getTime()) / 1000);
      if (seconds < 3) {
        setTimeAgo('just now');
      } else {
        setTimeAgo(`${seconds}s ago`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lastTransmittedAt]);

  const phone = user?.phoneE164 || '';
  const isOnline = status === 'ONLINE';
  const isKycVerified = driver?.kycStatus === 'VERIFIED';
  const hasVehicle = !!driver?.currentVehicleId;
  const driverName = driver?.name || phone || 'Driver Partner';

  const handleGoOnline = async () => {
    setIsVerifyingOnline(true);
    try {
      await goOnline();
    } finally {
      setTimeout(() => {
        setIsVerifyingOnline(false);
      }, 600);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top App Bar */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.appTitle}>Cabzone</Text>
            <Text style={styles.driverSub}>
              {driver?.status === 'ACTIVE' ? 'Verified Driver' : 'Driver Partner'}
            </Text>
          </View>
          <View style={[styles.statusBadge, isOnline ? styles.statusOnline : styles.statusOffline]}>
            <Text style={[styles.statusDot, isOnline ? styles.statusDotOnline : styles.statusDotOffline]}>
              ●
            </Text>
            <Text style={[styles.statusText, isOnline ? styles.statusTextOnline : styles.statusTextOffline]}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>
        </View>

        {/* Today's KPI Metrics Strip (Section 8) */}
        <View style={styles.kpiContainer}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Today&apos;s Earnings</Text>
            <Text style={styles.kpiValue}>₹{(todayEarningsPaise / 100).toFixed(0)}</Text>
            <Text style={styles.kpiSub}>Cash & UPI</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Completed Rides</Text>
            <Text style={styles.kpiValue}>{todayCompletedTrips}</Text>
            <Text style={styles.kpiSub}>Trips today</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Float Wallet</Text>
            <Text
              style={[
                styles.kpiValue,
                walletBalancePaise != null && walletBalancePaise < 0 ? styles.kpiNegative : null,
              ]}>
              ₹{walletBalancePaise != null ? (walletBalancePaise / 100).toFixed(0) : '0'}
            </Text>
            <Text style={styles.kpiSub}>
              {walletBalancePaise != null && walletBalancePaise < 0 ? 'Owed to Co.' : 'Balance'}
            </Text>
          </View>
        </View>

        {/* Backend Ineligibility / Error Banner */}
        {error ? (
          <View style={styles.errorBanner}>
            <View style={styles.errorIconBox}>
              <Text style={styles.errorIcon}>⚠️</Text>
            </View>
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>Cannot Go Online</Text>
              <Text style={styles.errorMessage}>{error}</Text>
            </View>
            <Pressable onPress={clearError} style={styles.errorClose}>
              <Text style={styles.errorCloseText}>✕</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Main Availability Canvas (Section 8) */}
        <View style={[styles.canvasCard, isOnline ? styles.canvasOnline : styles.canvasOffline]}>
          {isOnline ? (
            /* ONLINE VIEW */
            <View style={styles.onlineSection}>
              <View style={styles.radarRing}>
                <View style={styles.radarPulse}>
                  <Text style={styles.radarIcon}>📡</Text>
                </View>
              </View>

              <Text style={styles.onlineTitle}>Searching for rides...</Text>
              <Text style={styles.onlineSub}>
                Stay in your service zone to receive ride offers. You will be alerted with sound when a request arrives.
              </Text>

              {/* Telemetry Indicator (Section 9) */}
              <View style={styles.telemetryBox}>
                <View style={styles.telemetryRow}>
                  <Text style={styles.telemetryLabel}>GPS Coordinates:</Text>
                  <Text style={styles.telemetryVal}>
                    {coords ? `${coords.lat.toFixed(4)}° N, ${coords.lng.toFixed(4)}° E` : 'Obtaining...'}
                  </Text>
                </View>
                <View style={styles.telemetryRow}>
                  <Text style={styles.telemetryLabel}>Transmission:</Text>
                  <Text style={[styles.telemetryVal, styles.telemetryLive]}>
                    ● {locationStatus} ({timeAgo})
                  </Text>
                </View>
                {coords?.speedMps ? (
                  <View style={styles.telemetryRow}>
                    <Text style={styles.telemetryLabel}>Current Speed:</Text>
                    <Text style={styles.telemetryVal}>
                      {Math.round(coords.speedMps * 3.6)} km/h
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* GO OFFLINE Action Button */}
              <Pressable
                style={[styles.offlineButton, isToggling && styles.buttonDisabled]}
                disabled={isToggling}
                onPress={goOffline}>
                {isToggling ? (
                  <ActivityIndicator color="#dc2626" />
                ) : (
                  <Text style={styles.offlineButtonText}>GO OFFLINE</Text>
                )}
              </Pressable>
            </View>
          ) : (
            /* OFFLINE VIEW */
            <View style={styles.offlineSection}>
              <View style={styles.sleepIconCircle}>
                <Text style={styles.sleepIcon}>🚕</Text>
              </View>

              <Text style={styles.offlineTitle}>You are currently OFFLINE</Text>
              <Text style={styles.offlineSub}>
                Go online to start receiving ride opportunities from passengers nearby.
              </Text>

              {/* Eligibility checklist preview */}
              <View style={styles.checklist}>
                <View style={styles.checkItem}>
                  <Text style={isKycVerified ? styles.checkOk : styles.checkWait}>
                    {isKycVerified ? '✓' : '●'}
                  </Text>
                  <Text style={styles.checkText}>
                    KYC Status: {driver?.kycStatus ?? 'VERIFIED'}
                  </Text>
                </View>
                <View style={styles.checkItem}>
                  <Text style={hasVehicle ? styles.checkOk : styles.checkWait}>
                    {hasVehicle ? '✓' : '●'}
                  </Text>
                  <Text style={styles.checkText}>
                    Vehicle Registered: {hasVehicle ? 'Yes' : 'Assigned in backend'}
                  </Text>
                </View>
              </View>

              {/* GO ONLINE Action Button */}
              <Pressable
                style={[styles.onlineButton, (isToggling || isVerifyingOnline) && styles.buttonDisabled]}
                disabled={isToggling || isVerifyingOnline}
                onPress={handleGoOnline}>
                {isToggling || isVerifyingOnline ? (
                  <ActivityIndicator color="#C8FF00" />
                ) : (
                  <Text style={styles.onlineButtonText}>GO ONLINE →</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>

        {/* Flow 15: Going Online Verification Modal / State */}
        {isVerifyingOnline ? (
          <View style={styles.verifyingOverlay}>
            <View style={styles.verifyingCard}>
              <ActivityIndicator size="large" color="#002451" style={{ marginBottom: 16 }} />
              <Text style={styles.verifyingTitle}>Getting you online...</Text>
              <View style={styles.verifyingList}>
                <Text style={styles.verifyingItem}>✓ Account verified</Text>
                <Text style={styles.verifyingItem}>✓ Vehicle eligible</Text>
                <Text style={styles.verifyingItem}>✓ Location available</Text>
                <Text style={styles.verifyingItem}>✓ Wallet eligible</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Driver Profile Footer */}
        <View style={styles.profileFooter}>
          <View style={styles.profileHeader}>
            <View>
              <Text style={styles.footerName}>{driverName}</Text>
              <Text style={styles.footerPhone}>{phone}</Text>
            </View>
            <View style={styles.ratingPill}>
              <Text style={styles.ratingText}>
                {driver?.ratingAverage != null ? driver.ratingAverage.toFixed(1) : '5.0'} ⭐
              </Text>
            </View>
          </View>

          <Pressable
            style={styles.logoutBtn}
            onPress={logout}
            disabled={isAuthLoading || isToggling}>
            <Text style={styles.logoutBtnText}>Log Out Account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#002451',
  },
  driverSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusOnline: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  statusOffline: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  statusDot: {
    fontSize: 10,
  },
  statusDotOnline: {
    color: '#16a34a',
  },
  statusDotOffline: {
    color: '#64748b',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusTextOnline: {
    color: '#15803d',
  },
  statusTextOffline: {
    color: '#475569',
  },
  kpiContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  kpiLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#002451',
  },
  kpiNegative: {
    color: '#dc2626',
  },
  kpiSub: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorIconBox: {
    marginRight: 10,
  },
  errorIcon: {
    fontSize: 20,
  },
  errorContent: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991b1b',
  },
  errorMessage: {
    fontSize: 12,
    color: '#b91c1c',
    marginTop: 2,
    lineHeight: 16,
  },
  errorClose: {
    padding: 4,
  },
  errorCloseText: {
    fontSize: 14,
    color: '#991b1b',
    fontWeight: '700',
  },
  canvasCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    shadowColor: '#002451',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  canvasOnline: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  canvasOffline: {
    borderColor: '#e2e8f0',
  },
  onlineSection: {
    alignItems: 'center',
  },
  radarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  radarPulse: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarIcon: {
    fontSize: 28,
  },
  onlineTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#15803d',
    marginBottom: 6,
  },
  onlineSub: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  telemetryBox: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginBottom: 20,
    gap: 6,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  telemetryLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  telemetryVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e293b',
  },
  telemetryLive: {
    color: '#16a34a',
  },
  offlineButton: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#dc2626',
    letterSpacing: 0.5,
  },
  offlineSection: {
    alignItems: 'center',
  },
  sleepIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  sleepIcon: {
    fontSize: 36,
  },
  offlineTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  offlineSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  checklist: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    gap: 6,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkOk: {
    fontSize: 13,
    fontWeight: '800',
    color: '#16a34a',
  },
  checkWait: {
    fontSize: 10,
    color: '#f59e0b',
  },
  checkText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
  },
  onlineButton: {
    width: '100%',
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  onlineButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  profileFooter: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  footerName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  footerPhone: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  ratingPill: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#b45309',
  },
  logoutBtn: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
    alignItems: 'center',
  },
  logoutBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  verifyingOverlay: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#bbf7d0',
    marginBottom: 20,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  verifyingCard: {
    alignItems: 'center',
  },
  verifyingTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#002451',
    marginBottom: 14,
  },
  verifyingList: {
    gap: 8,
    alignItems: 'flex-start',
    width: '100%',
    paddingHorizontal: 20,
  },
  verifyingItem: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15803d',
  },
});
