import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { colors, radii, spacing, typography } from '@/design-system';

export default function OtpVerificationScreen() {
  const router = useRouter();
  const { pendingPhoneE164, verifyOtp, requestOtp } = useAuth();
  const reducedMotion = useReducedMotion();
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const exitingRef = useRef(false);
  const [sections] = useState(() => [
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
  ]);

  useFocusEffect(
    useCallback(() => {
      exitingRef.current = false;
      if (reducedMotion) {
        sections.forEach((v) => v.setValue(1));
        return;
      }
      sections.forEach((v) => v.setValue(0));
      const enter = Animated.stagger(
        75,
        sections.map((v) =>
          Animated.timing(v, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ),
      );
      enter.start();
      return () => enter.stop();
    }, [reducedMotion, sections]),
  );

  const animateOut = (onDone: () => void) => {
    if (reducedMotion) {
      onDone();
      return;
    }
    if (exitingRef.current) return;
    exitingRef.current = true;
    Animated.stagger(
      40,
      sections.map((v) =>
        Animated.timing(v, {
          toValue: 0,
          duration: 210,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    ).start(({ finished }) => {
      exitingRef.current = false;
      if (finished) {
        onDone();
      } else {
        sections.forEach((v) => v.setValue(1));
      }
    });
  };

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

  const handleBack = () => {
    if (isVerifying) return;
    animateOut(() => router.back());
  };

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
      const nextRoute =
        !profile || !profile.name || !profile.name.trim()
          ? '/(onboarding)/name'
          : '/(rider)/(tabs)/home';
      setIsVerifying(false);
      animateOut(() => router.replace(nextRoute));
    } catch (err: unknown) {
      setIsVerifying(false);
      setError(
        err instanceof Error ? err.message : 'Invalid or expired OTP. Please try again.',
      );
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
          <Animated.View
            style={{
              opacity: sections[0],
              transform: [
                {
                  translateY: sections[0].interpolate({
                    inputRange: [0, 1],
                    outputRange: [-12, 0],
                  }),
                },
              ],
              gap: spacing.md,
            }}
          >
            <Pressable style={styles.backBtn} onPress={handleBack} disabled={isVerifying}>
              <Ionicons name="arrow-back" size={22} color={colors.deepBrown} />
            </Pressable>

            <Text style={styles.title}>Verify 6-Digit OTP</Text>
            <Text style={styles.subtitle}>
              Enter the code sent to{' '}
              <Text style={{ fontWeight: '700', color: colors.deepBrown }}>
                {pendingPhoneE164}
              </Text>
            </Text>
          </Animated.View>

          <Animated.View
            style={{
              opacity: sections[1],
              transform: [
                {
                  translateY: sections[1].interpolate({
                    inputRange: [0, 1],
                    outputRange: [16, 0],
                  }),
                },
              ],
              gap: spacing.md,
            }}
          >
            <TextInput
              style={styles.otpInput}
              placeholder="• • • • • •"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              editable={!isVerifying}
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

            {__DEV__ ? (
              <View style={styles.devHelperRow}>
                <Text style={styles.devHelperLabel}>Dev Quick-Fill:</Text>
                <Pressable
                  style={styles.devChip}
                  disabled={isVerifying}
                  onPress={() => {
                    setOtp('000000');
                    void handleVerify('000000');
                  }}
                >
                  <Text style={styles.devChipText}>Use 000000</Text>
                </Pressable>
              </View>
            ) : null}

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
          </Animated.View>
        </View>

        <Animated.View
          style={{
            opacity: sections[2],
            transform: [
              {
                translateY: sections[2].interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, 0],
                }),
              },
              {
                scale: sections[2].interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.96, 1],
                }),
              },
            ],
          }}
        >
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
        </Animated.View>
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
