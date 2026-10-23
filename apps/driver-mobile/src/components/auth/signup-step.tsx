import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/design-system';
import { useAuth } from '@/context/auth-context';

export interface SignupStepProps {
  onBack: () => void;
  onSuccess?: () => void;
}

export function SignupStep({ onBack, onSuccess }: SignupStepProps) {
  const { phone, sendOtp, verifyOtp, otpCooldown, error, clearError } = useAuth();
  const [phoneInput, setPhoneInput] = useState(() => phone.replace(/\D/g, '').slice(-10));
  const [otpInput, setOtpInput] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const sendInFlight = useRef(false);
  const verifyInFlight = useRef(false);
  const phoneValid = /^[6-9]\d{9}$/.test(phoneInput);
  const busy = sendingOtp || verifying;
  const visibleError = localError || error;

  const resetError = () => {
    clearError();
    setLocalError(null);
  };

  const handleSendOtp = async () => {
    if (sendInFlight.current || verifyInFlight.current || (isOtpSent && otpCooldown > 0)) return;
    if (!phoneValid) {
      setLocalError('Enter a valid 10-digit Indian mobile number starting with 6–9.');
      return;
    }
    sendInFlight.current = true;
    setSendingOtp(true);
    resetError();
    try {
      if (await sendOtp(phoneInput)) {
        setOtpInput('');
        setIsOtpSent(true);
      }
    } catch (err: unknown) {
      setLocalError(
        err instanceof Error ? err.message : 'Could not send the code. Please try again.',
      );
    } finally {
      sendInFlight.current = false;
      setSendingOtp(false);
    }
  };

  const handleVerify = async (code = otpInput) => {
    if (!/^\d{6}$/.test(code) || verifyInFlight.current || sendInFlight.current) return;
    verifyInFlight.current = true;
    setVerifying(true);
    resetError();
    try {
      if (await verifyOtp(code)) onSuccess?.();
    } catch (err: unknown) {
      setLocalError(
        err instanceof Error ? err.message : 'Could not verify the code. Please try again.',
      );
    } finally {
      verifyInFlight.current = false;
      setVerifying(false);
    }
  };

  const editPhone = () => {
    resetError();
    setIsOtpSent(false);
    setOtpInput('');
  };
  const submitDisabled = busy || (isOtpSent ? otpInput.length !== 6 : !phoneValid);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.inner}>
          <View style={styles.header}>
            <Pressable
              style={styles.back}
              onPress={isOtpSent ? editPhone : onBack}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={isOtpSent ? 'Change mobile number' : 'Back to welcome'}
              accessibilityState={{ disabled: busy }}
            >
              <Ionicons name="arrow-back" size={22} color={colors.deepBrown} />
            </Pressable>
            <Image
              source={require('@/assets/brand/cabzone-horizontal.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Cabzone Driver"
            />
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.form}
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title} accessibilityRole="header">
              {isOtpSent ? 'Verify your number' : 'Your mobile number'}
            </Text>
            <Text style={styles.subtitle}>
              {isOtpSent
                ? `Enter the 6-digit code sent to +91 ${phoneInput}.`
                : 'We’ll text you a 6-digit sign-in code.'}
            </Text>

            {!isOtpSent ? (
              <>
                <Text nativeID="driver-phone-label" style={styles.label}>
                  Mobile number
                </Text>
                <View style={styles.phoneRow}>
                  <View
                    style={styles.countryPrefix}
                    accessible
                    accessibilityLabel="India, country code plus 91"
                  >
                    <Text style={styles.countryText}>{'\u{1F1EE}\u{1F1F3} +91'}</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    accessibilityLabel="Mobile number, 10 digits"
                    accessibilityLabelledBy="driver-phone-label"
                    placeholder="98765 43210"
                    placeholderTextColor={colors.secondary}
                    keyboardType="phone-pad"
                    autoComplete="tel-national"
                    textContentType="telephoneNumber"
                    maxLength={10}
                    value={phoneInput}
                    editable={!busy}
                    onChangeText={(text) => {
                      resetError();
                      setPhoneInput(text.replace(/\D/g, '').slice(0, 10));
                    }}
                    onSubmitEditing={() => void handleSendOtp()}
                  />
                </View>
              </>
            ) : (
              <>
                <Text nativeID="driver-otp-label" style={styles.label}>
                  Verification code
                </Text>
                <TextInput
                  style={[styles.input, styles.otpInput]}
                  accessibilityLabel="Verification code, 6 digits"
                  accessibilityLabelledBy="driver-otp-label"
                  placeholder="000000"
                  placeholderTextColor={colors.secondary}
                  keyboardType="number-pad"
                  autoComplete="sms-otp"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  value={otpInput}
                  editable={!busy}
                  autoFocus
                  onChangeText={(text) => {
                    resetError();
                    const digits = text.replace(/\D/g, '').slice(0, 6);
                    setOtpInput(digits);
                    if (digits.length === 6) void handleVerify(digits);
                  }}
                  onSubmitEditing={() => void handleVerify()}
                />
                <View style={styles.codeActions}>
                  <Pressable
                    style={styles.textAction}
                    onPress={editPhone}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Change mobile number"
                  >
                    <Text style={styles.link}>Change number</Text>
                  </Pressable>
                  <Pressable
                    style={styles.textAction}
                    onPress={() => void handleSendOtp()}
                    disabled={busy || otpCooldown > 0}
                    accessibilityRole="button"
                    accessibilityLabel="Resend code"
                    accessibilityState={{ disabled: busy || otpCooldown > 0 }}
                  >
                    <Text style={[styles.link, (busy || otpCooldown > 0) && styles.muted]}>
                      {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend code'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {visibleError ? (
              <View
                style={styles.errorBox}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={styles.errorText}>{visibleError}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={({ pressed }) => [
                styles.submit,
                submitDisabled && styles.submitDisabled,
                pressed && !submitDisabled && styles.pressed,
              ]}
              onPress={() => void (isOtpSent ? handleVerify() : handleSendOtp())}
              disabled={submitDisabled}
              accessibilityRole="button"
              accessibilityLabel={
                sendingOtp
                  ? 'Sending code'
                  : verifying
                    ? 'Verifying code'
                    : isOtpSent
                      ? 'Verify and continue'
                      : 'Send code'
              }
              accessibilityState={{ disabled: submitDisabled, busy }}
            >
              {busy ? (
                <ActivityIndicator color={colors.deepBrown} />
              ) : (
                <>
                  <Text style={[styles.submitText, submitDisabled && styles.muted]}>
                    {isOtpSent ? 'Verify & continue' : 'Send code'}
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={22}
                    color={submitDisabled ? colors.secondary : colors.deepBrown}
                  />
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
  container: { flex: 1, backgroundColor: colors.white },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  logo: { width: 150, height: 52 },
  headerSpacer: { width: 48 },
  form: { flex: 1 },
  formContent: { paddingTop: 32, paddingBottom: 16 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.deepBrown },
  subtitle: { fontSize: 15, lineHeight: 21, color: colors.secondary, marginTop: 8 },
  label: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: colors.deepBrown,
    marginTop: 32,
    marginBottom: 8,
  },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countryPrefix: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 15,
  },
  countryText: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: colors.deepBrown },
  input: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 18,
    fontWeight: '700',
    color: colors.deepBrown,
    letterSpacing: 1,
  },
  otpInput: { flex: 0, fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  codeActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  textAction: { minHeight: 48, justifyContent: 'center' },
  link: { fontSize: 13, fontWeight: '700', lineHeight: 18, color: colors.deepBrown },
  muted: { color: colors.secondary },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 12,
    marginTop: 12,
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.error },
  footer: { flexShrink: 0, paddingTop: 12 },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: colors.amber,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  submitDisabled: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  submitText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.deepBrown,
    flexShrink: 1,
  },
  pressed: { opacity: 0.9 },
});

export default SignupStep;
