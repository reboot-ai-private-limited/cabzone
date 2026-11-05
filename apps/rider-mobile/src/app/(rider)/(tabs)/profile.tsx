import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { colors, radii, spacing, typography, createStyles } from '@/design-system';
import { AppearanceToggle } from '@/components/common/appearance-toggle';
import { MAP_THEME_OPTIONS, normalizeMapTheme } from '@/services/map-theme';

type MenuItem = {
  label: string;
  sub: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  href: string;
};

export default function ProfileTabScreen() {
  const router = useRouter();
  const { user, profile, templates, preferences, updatePreferences, logout } = useAuth();

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const riderName = profile?.name || 'Cabzone Rider';
  const initial = riderName.trim().charAt(0).toUpperCase() || 'R';

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      setShowLogoutModal(false);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const menuItems: MenuItem[] = [
    {
      label: 'Personal Details',
      sub: `Name, email & operational city (${preferences.operationalCity})`,
      icon: 'person-circle-outline',
      href: '/(rider)/account/edit-profile',
    },
    {
      label: 'Emergency Safety Contact',
      sub: profile?.emergencyContact
        ? `${profile.emergencyContact.name} (${profile.emergencyContact.phoneE164})`
        : 'Not configured · Tap to add trusted contact',
      icon: 'shield-checkmark-outline',
      href: '/(rider)/account/emergency-contact',
    },
    {
      label: 'Saved Route Templates',
      sub: `${templates.length} saved quick-launch routes`,
      icon: 'bookmark-outline',
      href: '/(rider)/account/saved-routes',
    },
    {
      label: 'Help & Payment Disputes',
      sub: 'FAQs, safety guide & trip dispute assistance',
      icon: 'help-buoy-outline',
      href: '/(rider)/account/support',
    },
    {
      label: 'Terms, Privacy & Fare Policy',
      sub: 'Cash/UPI payment & cancellation policy',
      icon: 'document-lock-outline',
      href: '/(rider)/account/legal',
    },
  ];

  const renderMenuRow = (item: MenuItem, idx: number) => (
    <Pressable
      key={item.label}
      style={[styles.menuRow, idx > 0 && styles.menuRowBorder]}
      onPress={() => router.push(item.href as never)}
      accessibilityRole="button"
      accessibilityLabel={item.label}
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
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Rider Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.riderName}>{riderName}</Text>
            <Text style={styles.riderPhone}>{user?.phoneE164 || ''}</Text>
            {profile?.email ? (
              <Text style={styles.riderEmail} numberOfLines={1}>
                {profile.email}
              </Text>
            ) : null}
            <View style={styles.badgeRow}>
              <View style={styles.verifiedPill}>
                <Text style={styles.verifiedPillText}>✓ VERIFIED RIDER</Text>
              </View>
              <View style={styles.ratingPill}>
                <Text style={styles.ratingPillText}>
                  ⭐ {formatPublicRatingLabel(profile?.ratingAverage, profile?.ratingCount)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Account & Help Menu */}
        <View style={styles.menuCard}>{menuItems.map(renderMenuRow)}</View>

        {/* App Preferences */}
        <Text style={styles.sectionHeader}>APP PREFERENCES</Text>
        <View style={styles.menuCard}>
          <AppearanceToggle />
          <View style={[styles.prefRow, styles.menuRowBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Distance Units</Text>
              <Text style={styles.menuSub}>Used on route maps and quotes</Text>
            </View>
            <View style={styles.segmentedToggle}>
              {(['km', 'mi'] as const).map((unit) => (
                <Pressable
                  key={unit}
                  style={[styles.segBtn, preferences.distanceUnit === unit && styles.segBtnActive]}
                  onPress={() => void updatePreferences({ distanceUnit: unit })}
                >
                  <Text
                    style={[
                      styles.segBtnText,
                      preferences.distanceUnit === unit && styles.segBtnTextActive,
                    ]}
                  >
                    {unit.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[styles.prefRow, styles.menuRowBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Preferred Language</Text>
              <Text style={styles.menuSub}>Saved to your rider profile</Text>
            </View>
            <View style={styles.segmentedToggle}>
              {(
                [
                  { code: 'en', label: 'EN' },
                  { code: 'hi', label: 'हिं' },
                  { code: 'bn', label: 'বাং' },
                ] as const
              ).map((lang) => (
                <Pressable
                  key={lang.code}
                  style={[styles.segBtn, preferences.language === lang.code && styles.segBtnActive]}
                  onPress={() => void updatePreferences({ language: lang.code })}
                >
                  <Text
                    style={[
                      styles.segBtnText,
                      preferences.language === lang.code && styles.segBtnTextActive,
                    ]}
                  >
                    {lang.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[styles.mapThemeBlock, styles.menuRowBorder]}>
            <Text style={styles.menuLabel}>Map Theme</Text>
            <Text style={styles.menuSub}>Used on the booking and pickup maps</Text>
            <View style={styles.themeChips} accessibilityRole="radiogroup">
              {MAP_THEME_OPTIONS.map((option) => {
                const selected = normalizeMapTheme(preferences.mapTheme) === option.id;
                return (
                  <Pressable
                    key={option.id}
                    style={[styles.themeChip, selected && styles.themeChipActive]}
                    onPress={() => void updatePreferences({ mapTheme: option.id })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${option.label} map`}
                  >
                    <Ionicons
                      name={option.icon}
                      size={16}
                      color={selected ? colors.amber : colors.deepBrown}
                    />
                    <Text style={[styles.themeChipText, selected && styles.themeChipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Sign Out */}
        <Pressable
          style={styles.logoutTrigger}
          onPress={() => setShowLogoutModal(true)}
          accessibilityRole="button"
        >
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutTriggerText}>Log Out of Cabzone</Text>
        </Pressable>
        <Pressable
          style={styles.logoutTrigger}
          onPress={() => void Linking.openURL('https://cabzone-admin.vercel.app/account-deletion')}
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
              You will need to verify your phone number with an OTP the next time you sign in.
            </Text>
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
                onPress={() => void handleConfirmLogout()}
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
  content: {
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
  },
  avatarInitial: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  riderName: {
    ...typography.h2,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  riderPhone: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: 2,
    fontWeight: '600',
  },
  riderEmail: {
    fontSize: 12,
    color: colors.secondary,
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
  ratingPill: {
    backgroundColor: colors.warmBeige,
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
  sectionHeader: {
    ...typography.label,
    color: colors.secondary,
    marginBottom: -8,
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
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: 16,
  },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    ...typography.bodyBold,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  menuSub: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 2,
  },
  segmentedToggle: {
    flexDirection: 'row',
    backgroundColor: colors.cream,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
  },
  segBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  segBtnActive: {
    backgroundColor: colors.deepBrown,
  },
  segBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  segBtnTextActive: {
    color: colors.amber,
  },
  mapThemeBlock: {
    padding: 16,
  },
  themeChips: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  themeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cream,
  },
  themeChipActive: {
    backgroundColor: colors.deepBrown,
    borderColor: colors.deepBrown,
  },
  themeChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  themeChipTextActive: {
    color: colors.amber,
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
    ...typography.bodyBold,
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
    ...typography.h2,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  modalSub: {
    ...typography.caption,
    color: colors.secondary,
    lineHeight: 18,
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
    backgroundColor: colors.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: '800',
    color: colors.white,
  },
}));
