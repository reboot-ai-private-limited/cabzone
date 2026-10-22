import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth-context';
import { normalizeIndianPhoneE164 } from '@/services/rider-helpers';
import { colors, radii, spacing, typography } from '@/design-system';

export default function EmergencyContactScreen() {
  const router = useRouter();
  const { profile, updateProfile } = useAuth();

  const [contactName, setContactName] = useState(
    profile?.emergencyContact?.name ?? '',
  );
  const [contactPhone, setContactPhone] = useState(
    profile?.emergencyContact?.phoneE164?.replace(/^\+91/, '') ?? '',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmedName = contactName.trim();
    if (!trimmedName) {
      setError('Please enter your emergency contact’s name.');
      return;
    }
    const normalizedPhone = normalizeIndianPhoneE164(contactPhone);
    if (!normalizedPhone) {
      setError('Enter a valid 10-digit Indian mobile number starting with 6–9.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await updateProfile({
        emergencyContact: {
          name: trimmedName,
          phoneE164: normalizedPhone,
        },
      });
      router.back();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Unable to save emergency contact.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setIsSaving(true);
    try {
      await updateProfile({ emergencyContact: null });
      router.back();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Unable to remove emergency contact.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
        </Pressable>
        <Text style={styles.topBarTitle}>Emergency Safety Contact</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoBanner}>
          <Ionicons name="shield-checkmark" size={24} color={colors.deepBrown} />
          <Text style={styles.infoText}>
            Your trusted contact can be called or shared your live trip status with 1 tap from the in-ride Safety Toolkit.
          </Text>
        </View>

        <Text style={styles.label}>CONTACT FULL NAME</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Priya Chatterjee"
          placeholderTextColor={colors.muted}
          value={contactName}
          onChangeText={setContactName}
        />

        <Text style={styles.label}>MOBILE NUMBER (+91)</Text>
        <TextInput
          style={styles.input}
          placeholder="10-digit mobile number"
          placeholderTextColor={colors.muted}
          keyboardType="phone-pad"
          maxLength={13}
          value={contactPhone}
          onChangeText={setContactPhone}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={styles.saveBtn}
          onPress={() => void handleSave()}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color={colors.deepBrown} />
          ) : (
            <Text style={styles.saveBtnText}>Save Emergency Contact</Text>
          )}
        </Pressable>

        {profile?.emergencyContact ? (
          <Pressable
            style={styles.removeBtn}
            onPress={() => void handleRemove()}
            disabled={isSaving}
          >
            <Text style={styles.removeBtnText}>Remove Saved Contact</Text>
          </Pressable>
        ) : null}
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.cream,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: {
    flex: 1,
    ...typography.caption,
    color: colors.deepBrown,
  },
  label: {
    ...typography.label,
    color: colors.brandBrown,
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.cream,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.deepBrown,
  },
  errorText: {
    fontSize: 13,
    color: colors.error,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: colors.amber,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  saveBtnText: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  removeBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  removeBtnText: {
    ...typography.bodyBold,
    color: colors.error,
  },
});
