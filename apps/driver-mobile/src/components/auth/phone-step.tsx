import React, { useState } from 'react';
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
import { useAuth } from '@/context/auth-context';

const DEV_PRESETS = [
  { label: 'Dev Driver', phone: '9000000002' },
  { label: 'Subrata', phone: '9000000012' },
  { label: 'Rajesh', phone: '9000000013' },
];

export function PhoneStep() {
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
        {/* Brand Header */}
        <View style={styles.brandContainer}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoIcon}>🚕</Text>
          </View>
          <Text style={styles.brandTitle}>Cabzone</Text>
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
        <Pressable
          style={[styles.button, (!isValid || isLoading) && styles.buttonDisabled]}
          disabled={!isValid || isLoading}
          onPress={handleSubmit}>
          {isLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Get Verification Code →</Text>
          )}
        </Pressable>

        <Text style={styles.footerNote}>
          By continuing, you agree to Cabzone’s Driver Terms of Service and Privacy Policy.
        </Text>
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
    shadowColor: '#002451',
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
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#002451',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  logoIcon: {
    fontSize: 28,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#002451',
    letterSpacing: 0.5,
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
    fontSize: 10,
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
    fontSize: 13,
    color: '#64748b',
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
    fontSize: 16,
  },
  countryCode: {
    fontSize: 15,
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
    fontSize: 12,
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
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
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
    backgroundColor: '#002451',
    borderColor: '#002451',
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  presetChipTextActive: {
    color: '#ffffff',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#002451',
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
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  footerNote: {
    marginTop: 16,
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 15,
  },
});
