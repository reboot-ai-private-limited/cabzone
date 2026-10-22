import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { colors, radii, spacing, typography } from '@/design-system';

export default function OtpVerificationScreen() {
  const router = useRouter();
  const { pendingPhoneE164, verifyOtp, requestOtp } = useAuth();
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(30);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingPhoneE164) {
      router.replace('/(auth)/phone');
    }
  }, [pendingPhoneE164, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleVerify = async (codeToVerify?: string) => {
    const cleanOtp = (codeToVerify ?? otp).replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setIsVerifying(true);
    setError(null);
    try {
      const profile = await verifyOtp(pendingPhoneE164, cleanOtp);
      if (!profile || !profile.name || !profile.name.trim()) {
        router.replace('/(onboarding)/name');
      } else {
        router.replace('/(rider)/(tabs)/home');
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Invalid or expired OTP. Please try again.',
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || !pendingPhoneE164) return;
    setError(null);
    try {
      await requestOtp(pendingPhoneE164);
      setCooldown(30);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topSection}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.deepBrown} />
          </Pressable>

          <Text style={styles.title}>Verify 6-Digit OTP</Text>
          <Text style={styles.subtitle}>
            Enter the code sent to{' '}
            <Text style={{ fontWeight: '700', color: colors.deepBrown }}>
              {pendingPhoneE164}
            </Text>
          </Text>

          <TextInput
            style={styles.otpInput}
            placeholder="• • • • • •"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            maxLength={6}
            value={otp}
            onChangeText={(txt) => {
              const digits = txt.replace(/\D/g, '').slice(0, 6);
              setOtp(digits);
              if (error) setError(null);
              if (digits.length === 6) {
                void handleVerify(digits);
              }
            }}
            autoFocus
          />

          <View style={styles.devHelperRow}>
            <Text style={styles.devHelperLabel}>Dev Quick-Fill:</Text>
            <Pressable
              style={styles.devChip}
              onPress={() => {
                setOtp('123456');
                void handleVerify('123456');
              }}
            >
              <Text style={styles.devChipText}>Use 123456</Text>
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => void handleResend()}
            disabled={cooldown > 0}
            style={{ marginTop: spacing.xs }}
          >
            <Text style={styles.resendText}>
              {cooldown > 0
                ? `Resend code in ${cooldown}s`
                : 'Didn’t receive it? Tap to Resend OTP'}
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={[
            styles.submitBtn,
            (otp.length !== 6 || isVerifying) && styles.submitBtnDisabled,
          ]}
          onPress={() => void handleVerify()}
          disabled={otp.length !== 6 || isVerifying}
        >
          {isVerifying ? (
            <ActivityIndicator color={colors.deepBrown} />
          ) : (
            <Text style={styles.submitBtnText}>Verify & Continue</Text>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.xl,
  },
  topSection: {
    gap: spacing.md,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h1,
    color: colors.deepBrown,
  },
  subtitle: {
    ...typography.body,
    color: colors.secondary,
  },
  otpInput: {
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.deepBrown,
    borderRadius: radii.lg,
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    fontSize: 28,
    fontWeight: '800',
    color: colors.deepBrown,
    letterSpacing: 10,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  devHelperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  devHelperLabel: {
    ...typography.caption,
    color: colors.secondary,
  },
  devChip: {
    backgroundColor: colors.warmBeige,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  devChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    padding: spacing.sm,
    borderRadius: radii.md,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.error,
    fontWeight: '600',
  },
  resendText: {
    ...typography.bodyBold,
    color: colors.brandBrown,
  },
  submitBtn: {
    backgroundColor: colors.amber,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnText: {
    ...typography.h2,
    color: colors.deepBrown,
  },
});
