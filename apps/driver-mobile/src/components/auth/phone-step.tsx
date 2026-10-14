import { colors, typography } from '@/design-system';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Image,
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
import { API_BASE_URL } from '@/services/api';

const DEV_PRESETS = [
  { label: 'Dev Driver', phone: '9000000002' },
  { label: 'Subrata', phone: '9000000012' },
  { label: 'Rajesh', phone: '9000000013' },
];

interface PhoneStepProps {
  onBack?: () => void;
}

export function PhoneStep({ onBack }: PhoneStepProps = {}) {
  const { sendOtp, isLoading, error, clearError } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');

  const handlePhoneChange = (text: string) => {
    clearError();
    const digitsOnly = text.replace(/\D/g, '').slice(0, 10);
    setPhoneNumber(digitsOnly);
  };

  const handleQuickSelect = (presetPhone: string) => {
    clearError();
    setPhoneNumber(presetPhone);
  };

  const handleSubmit = async () => {
    if (phoneNumber.length !== 10) return;
    await sendOtp(phoneNumber);
  };

  const isValid = phoneNumber.length === 10;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <View style={styles.card}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
        ) : null}

        {/* Brand Header */}
        <View style={styles.brandContainer}>
          <Image source={require('@/assets/brand/cabzone-horizontal.png')} style={styles.brandLogo} resizeMode="contain" accessibilityLabel="Cabzone" />
          <View style={styles.driverTag}>
            <Text style={styles.driverTagText}>DRIVER PARTNER</Text>
          </View>
        </View>

        <Text style={styles.heading}>Enter your mobile number</Text>
        <Text style={styles.subheading}>
          We will send a 6-digit verification code to log in or register.
        </Text>

        {/* Input Box */}
        <View style={styles.inputWrapper}>
          <View style={styles.countryBadge}>
            <Text style={styles.flag}>🇮🇳</Text>
            <Text style={styles.countryCode}>+91</Text>
          </View>
          <TextInput
            style={styles.phoneInput}
            placeholder="98765 43210"
            placeholderTextColor="#94a3b8"
            keyboardType="number-pad"
            maxLength={10}
            value={phoneNumber}
            onChangeText={handlePhoneChange}
            autoFocus
          />
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        ) : null}

        {/* Dev Mode Preset Chips */}
        <View style={styles.devSection}>
          <Text style={styles.devLabel}>🧪 DEV MODE PRESETS (OTP: 000000):</Text>
          <View style={styles.presetRow}>
            {DEV_PRESETS.map((preset) => (
              <Pressable
                key={preset.phone}
                style={[
                  styles.presetChip,
                  phoneNumber === preset.phone && styles.presetChipActive,
                ]}
                onPress={() => handleQuickSelect(preset.phone)}>
                <Text
                  style={[
                    styles.presetChipText,
                    phoneNumber === preset.phone && styles.presetChipTextActive,
                  ]}>
                  {preset.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* CTA Button */}
        <CandyButton
          title={isLoading ? 'Sending code...' : 'Get Verification Code'}
          onPress={handleSubmit}
          disabled={!isValid || isLoading}
          loading={isLoading}
          variant={isValid ? 'primary' : 'muted'}
          icon={
            !isLoading && (
              <Ionicons
                name="arrow-forward"
                size={18}
                color={isValid ? colors.darkNavy : colors.secondary}
                style={{ marginLeft: 2 }}
              />
            )
          }
          style={{ width: '100%', marginTop: 8 }}
        />

        <Text style={styles.footerNote}>
          By continuing, you agree to Cabzone’s Driver Terms of Service and Privacy Policy.
        </Text>

        <View style={styles.serverPill}>
          <Text style={styles.serverPillText}>API: {API_BASE_URL}</Text>
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
  brandContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  brandLogo: {
    width: 190,
    height: 64,
  },
  driverTag: {
    marginTop: 4,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  driverTagText: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: '#1d4ed8',
    letterSpacing: 0.5,
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
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
  },
  countryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: '#f1f5f9',
    borderRightWidth: 1,
    borderRightColor: '#cbd5e1',
  },
  flag: {
    fontSize: typography.sizes.base,
  },
  countryCode: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: '#1e293b',
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 17,
    fontWeight: '600',
    color: '#0f172a',
    letterSpacing: 1,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  errorText: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: '#b91c1c',
  },
  devSection: {
    marginTop: 18,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
  },
  devLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.secondary,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  presetChipActive: {
    backgroundColor: colors.darkNavy,
    borderColor: colors.darkNavy,
  },
  presetChipText: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: '#334155',
  },
  presetChipTextActive: {
    color: '#ffffff',
  },
  button: {
    marginTop: 20,
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
  footerNote: {
    marginTop: 16,
    fontSize: typography.sizes.xs,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 15,
  },
  serverPill: {
    marginTop: 12,
    alignSelf: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  serverPillText: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: colors.secondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  backArrow: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
});
