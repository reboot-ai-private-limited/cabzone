import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  OnboardingFormScroll,
  type OnboardingFormScrollHandle,
} from '@/components/kyc/onboarding-form-scroll';
import { useAuth } from '@/context/auth-context';
import { driverApi } from '@/services/api';
import { colors, typography } from '@/design-system';

type PersonalField = 'name' | 'city' | 'altPhone' | 'emergency' | null;

export default function PersonalDetailsScreen() {
  const router = useRouter();
  const { user, driver, token, refreshProfile } = useAuth();
  const formScrollRef = useRef<OnboardingFormScrollHandle>(null);

  const nameRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const cityRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const altPhoneRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const emergencyRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const nameBoxRef = useRef<React.ComponentRef<typeof View>>(null);
  const cityBoxRef = useRef<React.ComponentRef<typeof View>>(null);
  const altPhoneBoxRef = useRef<React.ComponentRef<typeof View>>(null);
  const emergencyBoxRef = useRef<React.ComponentRef<typeof View>>(null);

  const [focusedField, setFocusedField] = useState<PersonalField>(null);
  const [name, setName] = useState(driver?.name || '');
  const [city, setCity] = useState(driver?.address || '');
  const [alternatePhone, setAlternatePhone] = useState(driver?.alternatePhone || '');
  const [emergencyContact, setEmergencyContact] = useState(driver?.emergencyContact || '');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const handleSave = async () => {
    if (!token) return;
    Keyboard.dismiss();
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
        <Pressable
          style={styles.backBtn}
          onPress={() => {
            Keyboard.dismiss();
            router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel="Back to Account">
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
          <Text style={styles.backText}>Account</Text>
        </Pressable>
        <Text style={styles.topTitle}>Personal Details</Text>
        <View style={{ width: 60 }} />
      </View>

      <OnboardingFormScroll
        ref={formScrollRef}
        topPadding={20}
        baseBottomPadding={40}
        contentContainerStyle={styles.scrollContent}>
        {feedback ? (
          <View
            accessibilityRole="alert"
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
          <View ref={nameBoxRef} collapsable={false}>
            <TextInput
              ref={nameRef}
              style={[styles.input, focusedField === 'name' && styles.inputFocused]}
              value={name}
              onChangeText={setName}
              onFocus={() => {
                setFocusedField('name');
                formScrollRef.current?.focusTarget(nameBoxRef.current);
              }}
              onBlur={() => setFocusedField((prev) => (prev === 'name' ? null : prev))}
              autoCapitalize="words"
              blurOnSubmit={false}
              returnKeyType="next"
              onSubmitEditing={() => cityRef.current?.focus()}
              placeholder="Your full name"
              placeholderTextColor={colors.secondary}
              accessibilityLabel="Full Name"
            />
          </View>

          <Text style={styles.fieldLabel}>Operating City / Service Area</Text>
          <View ref={cityBoxRef} collapsable={false}>
            <TextInput
              ref={cityRef}
              style={[styles.input, focusedField === 'city' && styles.inputFocused]}
              value={city}
              onChangeText={setCity}
              onFocus={() => {
                setFocusedField('city');
                formScrollRef.current?.focusTarget(cityBoxRef.current);
              }}
              onBlur={() => setFocusedField((prev) => (prev === 'city' ? null : prev))}
              autoCapitalize="words"
              blurOnSubmit={false}
              returnKeyType="next"
              onSubmitEditing={() => altPhoneRef.current?.focus()}
              placeholder="e.g. Siliguri"
              placeholderTextColor={colors.secondary}
              accessibilityLabel="Operating City"
            />
          </View>

          <Text style={styles.fieldLabel}>Alternate Contact Phone</Text>
          <View ref={altPhoneBoxRef} collapsable={false}>
            <TextInput
              ref={altPhoneRef}
              style={[styles.input, focusedField === 'altPhone' && styles.inputFocused]}
              value={alternatePhone}
              onChangeText={setAlternatePhone}
              onFocus={() => {
                setFocusedField('altPhone');
                formScrollRef.current?.focusTarget(altPhoneBoxRef.current);
              }}
              onBlur={() => setFocusedField((prev) => (prev === 'altPhone' ? null : prev))}
              keyboardType="phone-pad"
              blurOnSubmit={false}
              returnKeyType="next"
              onSubmitEditing={() => emergencyRef.current?.focus()}
              placeholder="+91..."
              placeholderTextColor={colors.secondary}
              accessibilityLabel="Alternate Contact Phone"
            />
          </View>

          <Text style={styles.fieldLabel}>Emergency Contact (Name & Phone)</Text>
          <View ref={emergencyBoxRef} collapsable={false}>
            <TextInput
              ref={emergencyRef}
              style={[styles.input, focusedField === 'emergency' && styles.inputFocused]}
              value={emergencyContact}
              onChangeText={setEmergencyContact}
              onFocus={() => {
                setFocusedField('emergency');
                formScrollRef.current?.focusTarget(emergencyBoxRef.current);
              }}
              onBlur={() => setFocusedField((prev) => (prev === 'emergency' ? null : prev))}
              returnKeyType="done"
              onSubmitEditing={() => void handleSave()}
              placeholder="Family member name & phone"
              placeholderTextColor={colors.secondary}
              accessibilityLabel="Emergency Contact"
            />
          </View>

          <Pressable
            style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
            onPress={() => void handleSave()}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Save Changes">
            {isSaving ? (
              <ActivityIndicator color={colors.deepBrown} />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </Pressable>
        </View>
      </OnboardingFormScroll>
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
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: typography.sizes.sm, fontWeight: '700', color: colors.deepBrown },
  topTitle: { fontSize: typography.sizes.base, fontWeight: '800', color: colors.deepBrown },
  scrollContent: { gap: 16 },
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
    borderWidth: 1.5,
    borderColor: colors.border,
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.deepBrown,
  },
  inputFocused: {
    borderColor: colors.deepBrown,
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
