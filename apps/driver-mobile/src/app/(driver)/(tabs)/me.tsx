import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatPublicRatingLabel } from '@cabzone/contracts';
import { useAuth } from '@/context/auth-context';
import { useDuty } from '@/context/duty-context';
import { useRide } from '@/context/ride-context';
import { deriveKycBannerState } from '@/services/profile';
import { colors, typography, createStyles } from '@/design-system';
import { AppearanceToggle } from '@/components/common/appearance-toggle';

export default function DriverMeTab() {
  const router = useRouter();
  const {
    user,
    driver,
    driverProfile,
    vehicle,
    documents,
    compliance,
    logout,
    isLoading: isAuthLoading,
  } = useAuth();
  const { status: dutyStatus, goOffline } = useDuty();
  const { activeRide } = useRide();

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const [photoFailed, setPhotoFailed] = useState(false);
  const photoUrl = driver?.profilePhotoUrl || null;
  const driverName = driver?.name || 'Driver Partner';
  const phone = user?.phoneE164 || '';
  const rating = formatPublicRatingLabel(driver?.ratingAverage, driver?.ratingCount);
  const kycBanner = deriveKycBannerState(driverProfile);
  const isExpired = driver?.kycStatus === 'EXPIRED' || compliance?.overallStatus === 'EXPIRED';

  const handleConfirmLogout = async () => {
    if (activeRide) {
      setLogoutError('Please complete or settle your active ride before signing out.');
      return;
    }
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      if (dutyStatus === 'ONLINE') {
        await goOffline();
      }
      await logout();
      setShowLogoutModal(false);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const kycSubtitle =
    compliance?.overallStatus === 'EXPIRED'
      ? `Action needed · ${compliance.expiredTypes.length || 1} expired`
      : compliance?.overallStatus === 'EXPIRING_SOON'
        ? `${compliance.expiringSoonTypes.length} expiring within 30 days`
        : `${documents.length} uploaded · Status: ${driver?.kycStatus ?? 'VERIFIED'}`;

  const menuItems = [
    {
      label: 'Personal Details',
      sub: driver?.address
        ? `Operating city: ${driver.address}`
        : 'Name, DOB, gender & emergency contact',
      icon: 'person-circle-outline' as const,
      href: '/(driver)/account/personal-details' as const,
    },
    {
      label: 'Registered Vehicle',
      sub: vehicle
        ? `${vehicle.make} ${vehicle.model} · ${vehicle.registrationNumber}`
        : 'View vehicle registration & category',
      icon: 'car-sport-outline' as const,
      href: '/(driver)/account/vehicle' as const,
    },
    {
      label: 'KYC & Compliance Documents',
      sub: kycSubtitle,
      icon: 'document-text-outline' as const,
      href: '/(driver)/account/documents' as const,
    },
    {
      label: 'Commission Wallet & Ledger',
      sub: 'View balance, commission debits & top-ups',
      icon: 'wallet-outline' as const,
      href: '/(driver)/wallet' as const,
    },
    {
      label: 'Driver Support & Help',
      sub: 'Call support, WhatsApp desk & FAQs',
      icon: 'help-buoy-outline' as const,
      href: '/(driver)/account/help' as const,
    },
    {
      label: 'Terms, Privacy & Platform Rules',
      sub: 'Cash/UPI payment & commission policy',
      icon: 'shield-checkmark-outline' as const,
      href: '/(driver)/account/legal' as const,
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Driver Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            {photoUrl && !photoFailed ? (
              <Image
                source={{ uri: photoUrl }}
                style={styles.avatarImage}
                onError={() => setPhotoFailed(true)}
                accessibilityLabel="Driver profile photo"
              />
            ) : (
              <Text style={styles.avatarInitial}>
                {driverName.trim().charAt(0).toUpperCase() || 'D'}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.driverName}>{driverName}</Text>
            <Text style={styles.driverPhone}>{phone}</Text>
            <View style={styles.badgeRow}>
              <View style={isExpired ? styles.expiredPill : styles.verifiedPill}>
                <Text style={isExpired ? styles.expiredPillText : styles.verifiedPillText}>
                  {isExpired ? '! KYC EXPIRED' : '✓ VERIFIED DRIVER'}
                </Text>
              </View>
              <View style={styles.ratingPill}>
                <Text style={styles.ratingPillText}>⭐ {rating}</Text>
              </View>
            </View>
          </View>
        </View>

        {kycBanner ? (
          <Pressable
            style={[
              styles.kycAlertCard,
              kycBanner.tone === 'danger' ? styles.kycAlertDanger : styles.kycAlertWarn,
            ]}
            onPress={() => router.push('/(driver)/account/documents')}
            accessibilityRole="button"
            accessibilityLabel={kycBanner.ctaLabel}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.kycAlertTitle}>{kycBanner.title}</Text>
              <Text style={styles.kycAlertSub}>{kycBanner.message}</Text>
            </View>
            <Text style={styles.kycAlertAction}>{kycBanner.ctaLabel} →</Text>
          </Pressable>
        ) : null}

        {/* Menu Sections */}
        <View style={styles.menuCard}>
          {menuItems.map((item, idx) => (
            <Pressable
              key={item.label}
              style={[styles.menuRow, idx > 0 && styles.menuRowBorder]}
              onPress={() => router.push(item.href)}
            >
              <View style={styles.menuIconWrap}>
                <Ionicons name={item.icon} size={22} color={colors.deepBrown} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuSub} numberOfLines={1}>
                  {item.sub}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
            </Pressable>
          ))}
        </View>

        {/* Appearance */}
        <View style={styles.menuCard}>
          <AppearanceToggle />
        </View>

        {/* Sign Out Button */}
        <Pressable
          style={styles.logoutTrigger}
          onPress={() => {
            setLogoutError(null);
            setShowLogoutModal(true);
          }}
          disabled={isAuthLoading}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutTriggerText}>Log Out of Cabzone Driver</Text>
        </Pressable>
        <Pressable
          style={styles.logoutTrigger}
          onPress={() => void Linking.openURL('https://cabzone.site/account-deletion')}
          accessibilityRole="link"
          accessibilityLabel="Request account deletion"
        >
          <Text style={styles.logoutTriggerText}>Request account deletion</Text>
        </Pressable>
      </ScrollView>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Log Out of Account?</Text>
            <Text style={styles.modalSub}>
              {dutyStatus === 'ONLINE'
                ? 'You are currently ONLINE. Logging out will automatically switch your availability to OFFLINE.'
                : 'You will need to verify your phone number with an OTP the next time you sign in.'}
            </Text>

            {logoutError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{logoutError}</Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setShowLogoutModal(false)}
                disabled={isLoggingOut}
              >
                <Text style={styles.cancelBtnText}>Stay Signed In</Text>
              </Pressable>

              <Pressable
                style={styles.confirmLogoutBtn}
                onPress={handleConfirmLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.confirmLogoutText}>Log Out</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = createStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
    gap: 18,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  driverName: {
    fontSize: typography.sizes.xl,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  driverPhone: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    marginTop: 2,
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  verifiedPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  verifiedPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  expiredPill: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  expiredPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.error,
  },
  ratingPill: {
    backgroundColor: colors.lightCream,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ratingPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  kycAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  kycAlertDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  kycAlertWarn: {
    backgroundColor: '#FFFBEB',
    borderColor: colors.amber,
  },
  kycAlertTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  kycAlertSub: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    marginTop: 3,
    lineHeight: 16,
  },
  kycAlertAction: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  menuCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  menuRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.lightCream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  menuSub: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    marginTop: 2,
  },
  logoutTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  logoutTriggerText: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.error,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  modalTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  modalSub: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: {
    fontSize: typography.sizes.xs,
    color: colors.error,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.lightCream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  confirmLogoutBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmLogoutText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.white,
  },
}));
