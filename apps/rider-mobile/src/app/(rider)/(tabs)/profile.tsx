import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth-context';
import { colors, radii, spacing, typography } from '@/design-system';

export default function ProfileTabScreen() {
  const router = useRouter();
  const {
    user,
    profile,
    templates,
    preferences,
    updatePreferences,
    logout,
  } = useAuth();

  const initials = (profile?.name || 'C R')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>ACCOUNT & PREFERENCES</Text>
        <Text style={styles.title}>Profile</Text>

        {/* Profile Identity Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{profile?.name || 'Cabzone Rider'}</Text>
            <Text style={styles.profilePhone}>{user?.phoneE164 || ''}</Text>
            {profile?.email ? (
              <Text style={styles.profileEmail}>{profile.email}</Text>
            ) : null}
          </View>
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={14} color={colors.deepBrown} />
            <Text style={styles.ratingText}>
              {profile?.ratingAverage ? profile.ratingAverage.toFixed(1) : 'New'}
            </Text>
          </View>
        </View>

        {/* Account & Safety Menu */}
        <Text style={styles.sectionHeader}>ACCOUNT & SAFETY</Text>
        <View style={styles.menuGroup}>
          <Pressable
            style={styles.menuRow}
            onPress={() => router.push('/(rider)/account/edit-profile')}
          >
            <Ionicons name="person-outline" size={20} color={colors.deepBrown} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Edit Personal Profile & City</Text>
              <Text style={styles.menuSub}>
                Name, email & operational city ({preferences.operationalCity})
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            style={styles.menuRow}
            onPress={() => router.push('/(rider)/account/emergency-contact')}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.deepBrown} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Emergency Safety Contact</Text>
              <Text style={styles.menuSub}>
                {profile?.emergencyContact
                  ? `${profile.emergencyContact.name} (${profile.emergencyContact.phoneE164})`
                  : 'Not configured · Tap to add trusted contact'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            style={styles.menuRow}
            onPress={() => router.push('/(rider)/account/saved-routes')}
          >
            <Ionicons name="bookmark-outline" size={20} color={colors.deepBrown} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Saved Route Templates</Text>
              <Text style={styles.menuSub}>
                {templates.length} saved quick-launch routes
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
          </Pressable>
        </View>

        {/* Preferences (Units & Language) */}
        <Text style={styles.sectionHeader}>APP PREFERENCES</Text>
        <View style={styles.menuGroup}>
          <View style={styles.prefRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Distance Units</Text>
              <Text style={styles.menuSub}>Used on route maps and quotes</Text>
            </View>
            <View style={styles.segmentedToggle}>
              {(['km', 'mi'] as const).map((unit) => (
                <Pressable
                  key={unit}
                  style={[
                    styles.segBtn,
                    preferences.distanceUnit === unit && styles.segBtnActive,
                  ]}
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

          <View style={styles.divider} />

          <View style={styles.prefRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Preferred Language</Text>
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
                  style={[
                    styles.segBtn,
                    preferences.language === lang.code && styles.segBtnActive,
                  ]}
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
        </View>

        {/* Support & Legal */}
        <Text style={styles.sectionHeader}>HELP & LEGAL</Text>
        <View style={styles.menuGroup}>
          <Pressable
            style={styles.menuRow}
            onPress={() => router.push('/(rider)/account/support')}
          >
            <Ionicons name="help-buoy-outline" size={20} color={colors.deepBrown} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Help & Payment Disputes</Text>
              <Text style={styles.menuSub}>FAQs, safety guide & trip dispute assistance</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            style={styles.menuRow}
            onPress={() => router.push('/(rider)/account/legal')}
          >
            <Ionicons name="document-lock-outline" size={20} color={colors.deepBrown} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Terms, Privacy & Fare Policy</Text>
              <Text style={styles.menuSub}>Direct Cash/UPI rules & cancellation policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
          </Pressable>
        </View>

        {/* Logout */}
        <Pressable
          style={styles.logoutButton}
          onPress={() => void logout()}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutButtonText}>Sign Out of Cabzone</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 40,
    gap: spacing.md,
  },
  eyebrow: {
    ...typography.label,
    color: colors.brandBrown,
  },
  title: {
    ...typography.h1,
    color: colors.deepBrown,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.cream,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.amber,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  profileName: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  profilePhone: {
    ...typography.caption,
    color: colors.secondary,
  },
  profileEmail: {
    fontSize: 12,
    color: colors.secondary,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warmBeige,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  ratingText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  sectionHeader: {
    ...typography.label,
    color: colors.secondary,
    marginTop: 6,
  },
  menuGroup: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
  },
  menuTitle: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  menuSub: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginHorizontal: spacing.md,
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
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    paddingVertical: 15,
    borderRadius: radii.lg,
    marginTop: spacing.sm,
  },
  logoutButtonText: {
    ...typography.bodyBold,
    color: colors.error,
  },
});
