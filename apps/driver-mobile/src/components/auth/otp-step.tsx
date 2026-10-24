import { colors, typography } from '@/design-system';
import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CandyButton } from '@/components/buttons/candy-button';
import { useAuth } from '@/context/auth-context';

export function OtpStep() {
  const { phone, verifyOtp, sendOtp, setStep, otpCooldown, isLoading, error, clearError } = useAuth();
  const [otp, setOtp] = useState('');
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const handleOtpChange = (text: string) => {
    clearError();
    const digits = text.replace(/\D/g, '').slice(0, 6);
    setOtp(digits);
    if (digits.length === 6) {
      verifyOtp(digits);
    }
  };

  const handleFillDevOtp = () => {
    clearError();
    setOtp('000000');
    verifyOtp('000000');
  };

  const handleResend = async () => {
    if (otpCooldown > 0 || isLoading) return;
    await sendOtp(phone);
  };

  const handleSubmit = async () => {
    if (otp.length !== 6) return;
    await verifyOtp(otp);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <View style={styles.card}>
        {/* Back Link */}
        <Pressable
          style={styles.backButton}
          onPress={() => {
            clearError();
            setStep('phone');
          }}>
          <Text style={styles.backButtonText}>← Change Number</Text>
        </Pressable>

        <View style={styles.header}>
          <View style={styles.shieldIcon}>
            <Text style={{ fontSize: 24 }}>🔐</Text>
          </View>
          <Text style={styles.heading}>Verify your number</Text>
          <Text style={styles.subheading}>
            Enter the 6-digit code sent to{' '}
            <Text style={styles.phoneHighlight}>{phone}</Text>
          </Text>
        </View>

        {/* 6 Digit Cells Display */}
        <Pressable style={styles.otpGrid} onPress={() => inputRef.current?.focus()}>
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const digit = otp[index] || '';
            const isFocused = otp.length === index;
            return (
              <View
                key={index}
                style={[
                  styles.otpCell,
                  isFocused && styles.otpCellFocused,
                  digit ? styles.otpCellFilled : null,
                ]}>
                <Text style={styles.otpCellText}>{digit}</Text>
              </View>
            );
          })}
        </Pressable>

        {/* Hidden underlying TextInput */}
        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          keyboardType="number-pad"
          maxLength={6}
          value={otp}
          onChangeText={handleOtpChange}
          autoFocus
        />

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        ) : null}

        {/* Dev Mode Quick-Action */}
        <View style={styles.devBox}>
          <View style={styles.devRow}>
            <Text style={styles.devText}>Dev Mode Fixed OTP:</Text>
            <Pressable style={styles.devOtpBtn} onPress={handleFillDevOtp}>
              <Text style={styles.devOtpBtnText}>⚡ Auto-fill 000000</Text>
            </Pressable>
          </View>
        </View>

        {/* Verify CTA */}
        <CandyButton
          title={isLoading ? 'Verifying...' : 'Verify & Login'}
          onPress={handleSubmit}
          disabled={otp.length !== 6 || isLoading}
          loading={isLoading}
          variant={otp.length === 6 ? 'primary' : 'muted'}
          icon={
            !isLoading && (
              <Ionicons
                name="arrow-forward"
                size={18}
                color={otp.length === 6 ? colors.darkNavy : colors.secondary}
                style={{ marginLeft: 2 }}
              />
            )
          }
          style={{ width: '100%', marginTop: 8 }}
        />

        {/* Resend Timer */}
        <View style={styles.resendContainer}>
          {otpCooldown > 0 ? (
            <Text style={styles.resendTimer}>
              Resend code in <Text style={styles.timerBold}>{otpCooldown}s</Text>
            </Text>
          ) : (
            <Pressable onPress={handleResend} disabled={isLoading}>
              <Text style={styles.resendLink}>Didn’t receive code? Resend OTP</Text>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    paddingVertical: 4,
  },
  backButtonText: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.darkNavy,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  shieldIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 6,
  },
  subheading: {
    fontSize: typography.sizes.sm,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  phoneHighlight: {
    fontWeight: '700',
    color: colors.darkNavy,
  },
  otpGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginVertical: 16,
  },
  otpCell: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpCellFocused: {
    borderColor: colors.darkNavy,
    backgroundColor: '#ffffff',
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  otpCellFilled: {
    borderColor: colors.darkNavy,
    backgroundColor: '#ffffff',
  },
  otpCellText: {
    fontSize: typography.sizes.xl,
    fontWeight: '800',
    color: colors.darkNavy,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: '#b91c1c',
    textAlign: 'center',
  },
  devBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  devText: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: '#166534',
  },
  devOtpBtn: {
    backgroundColor: '#15803d',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  devOtpBtnText: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: '#ffffff',
  },
  button: {
    backgroundColor: colors.darkNavy,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#94a3b8',
    opacity: 0.7,
  },
  buttonText: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: '#ffffff',
  },
  resendContainer: {
    marginTop: 18,
    alignItems: 'center',
  },
  resendTimer: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
  },
  timerBold: {
    fontWeight: '700',
    color: colors.darkNavy,
  },
  resendLink: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.darkNavy,
  },
});
