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
import { driverApi } from '@/services/api';
import { colors, typography } from '@/design-system';

export default function PersonalDetailsScreen() {
  const router = useRouter();
  const { user, driver, token, refreshProfile } = useAuth();

  const [name, setName] = useState(driver?.name || '');
  const [city, setCity] = useState(driver?.address || '');
  const [alternatePhone, setAlternatePhone] = useState(driver?.alternatePhone || '');
  const [emergencyContact, setEmergencyContact] = useState(driver?.emergencyContact || '');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const handleSave = async () => {
    if (!token) return;
    if (!name.trim()) {
      setFeedback({ type: 'err', msg: 'Full name cannot be empty.' });
      return;
    }
    setIsSaving(true);
    setFeedback(null);
    try {
      await driverApi.saveProfile(token, {
        name: name.trim(),
        address: city.trim() || null,
        alternatePhone: alternatePhone.trim() || null,
        emergencyContact: emergencyContact.trim() || null,
      });
      await refreshProfile();
      setFeedback({ type: 'ok', msg: 'Profile details updated.' });
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Could not update profile.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
          <Text style={styles.backText}>Account</Text>
        </Pressable>
        <Text style={styles.topTitle}>Personal Details</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {feedback ? (
          <View
            style={[
              styles.banner,
              feedback.type === 'ok' ? styles.bannerOk : styles.bannerErr,
            ]}>
            <Text
              style={[
                styles.bannerText,
                feedback.type === 'ok' ? { color: colors.success } : { color: colors.error },
              ]}>
              {feedback.msg}
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Registered Phone (Verified)</Text>
          <View style={styles.readOnlyBox}>
            <Text style={styles.readOnlyText}>{user?.phoneE164 || '—'}</Text>
          </View>

          <Text style={styles.fieldLabel}>Full Name (as per Driving Licence)</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your full name"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.fieldLabel}>Operating City / Service Area</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="e.g. Siliguri"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.fieldLabel}>Alternate Contact Phone</Text>
          <TextInput
            style={styles.input}
            value={alternatePhone}
            onChangeText={setAlternatePhone}
            keyboardType="phone-pad"
            placeholder="+91..."
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.fieldLabel}>Emergency Contact (Name & Phone)</Text>
          <TextInput
            style={styles.input}
            value={emergencyContact}
            onChangeText={setEmergencyContact}
            placeholder="Family member name & phone"
            placeholderTextColor="#9CA3AF"
          />

          <Pressable
            style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator color={colors.deepBrown} />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: typography.sizes.sm, fontWeight: '700', color: colors.deepBrown },
  topTitle: { fontSize: typography.sizes.base, fontWeight: '800', color: colors.deepBrown },
  scrollContent: { padding: 20, gap: 16 },
  banner: { padding: 12, borderRadius: 12, borderWidth: 1 },
  bannerOk: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  bannerErr: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  bannerText: { fontSize: typography.sizes.xs, fontWeight: '700' },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  fieldLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.secondary,
    marginTop: 4,
  },
  readOnlyBox: {
    backgroundColor: colors.cream,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  readOnlyText: { fontSize: typography.sizes.sm, fontWeight: '700', color: colors.deepBrown },
  input: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.deepBrown,
  },
  saveBtn: {
    backgroundColor: colors.amber,
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  saveBtnText: { fontSize: typography.sizes.base, fontWeight: '800', color: colors.deepBrown },
});
