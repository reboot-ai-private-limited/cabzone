import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Image,
  ScrollView,
  Platform,
  Pressable,
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

export default function PhoneEntryScreen() {
  const router = useRouter();
  const { requestOtp } = useAuth();
  const [phoneDigits, setPhoneDigits] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedPhone = normalizeIndianPhoneE164(phoneDigits);

  const handleSendOtp = async () => {
    if (!normalizedPhone) {
      setError('Enter a valid 10-digit Indian mobile number starting with 6–9.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await requestOtp(normalizedPhone);
      router.push('/(auth)/otp');
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Unable to send OTP right now. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.inner}>
          <View style={styles.header}>
            <Pressable
              style={styles.backBtn}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back to welcome"
            >
              <Ionicons name="arrow-back" size={22} color={colors.deepBrown} />
            </Pressable>
            <Image
              source={require('@/assets/brand/cabzone-horizontal.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Cabzone"
            />
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.form}
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text accessibilityRole="header" style={styles.title}>
              Your mobile number
            </Text>
            <Text style={styles.subtitle}>We&apos;ll text you a 6-digit sign-in code.</Text>

            <Text nativeID="phone-label" style={styles.label}>
              Mobile number
            </Text>
            <View style={styles.phoneInputRow}>
              <View
                style={styles.countryPrefix}
                accessible
                accessibilityLabel="India, country code plus 91"
              >
                <Text style={styles.countryPrefixText}>{'\u{1F1EE}\u{1F1F3} +91'}</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                accessibilityLabel="Mobile number, 10 digits"
                accessibilityLabelledBy="phone-label"
                placeholder="98765 43210"
                placeholderTextColor={colors.secondary}
                keyboardType="phone-pad"
                autoComplete="tel-national"
                textContentType="telephoneNumber"
                maxLength={10}
                value={phoneDigits}
                editable={!isLoading}
                onChangeText={(txt) => {
                  setPhoneDigits(txt.replace(/\D/g, ''));
                  if (error) setError(null);
                }}
              />
            </View>
            {error ? (
              <View
                style={styles.errorBox}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                (!normalizedPhone || isLoading) && styles.submitBtnDisabled,
                pressed && styles.submitBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={isLoading ? 'Sending code' : 'Send code'}
              accessibilityState={{ disabled: !normalizedPhone || isLoading, busy: isLoading }}
              onPress={() => void handleSendOtp()}
              disabled={!normalizedPhone || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.deepBrown} />
              ) : (
                <>
                  <Text style={styles.submitBtnText}>Send code</Text>
                  <Ionicons name="arrow-forward" size={22} color={colors.deepBrown} />
                </>
              )}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { width: 48 },
  logo: { width: 150, height: 52 },
  form: { flex: 1 },
  formContent: { paddingTop: spacing.xxxl, paddingBottom: spacing.lg },
  title: { ...typography.hero, color: colors.deepBrown },
  subtitle: { ...typography.body, color: colors.secondary, marginTop: spacing.sm },
  label: {
    ...typography.bodyBold,
    color: colors.deepBrown,
    marginTop: spacing.xxxl,
    marginBottom: spacing.sm,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countryPrefix: {
    backgroundColor: colors.cream,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 15,
  },
  countryPrefixText: { ...typography.bodyBold, color: colors.deepBrown },
  phoneInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
    fontSize: 18,
    fontWeight: '700',
    color: colors.deepBrown,
    letterSpacing: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.md,
  },
  errorText: { ...typography.caption, flex: 1, color: colors.error },
  footer: { flexShrink: 0, paddingTop: spacing.md },
  submitBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.amber,
    minHeight: 56,
    borderRadius: radii.md,
    paddingVertical: spacing.lg,
  },
  submitBtnDisabled: { backgroundColor: colors.lightCream },
  submitBtnPressed: { backgroundColor: colors.amberStrong },
  submitBtnText: { ...typography.bodyBold, fontSize: 17, color: colors.deepBrown },
});
