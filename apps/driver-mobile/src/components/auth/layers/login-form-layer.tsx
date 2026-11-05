import { colors, typography, createStyles } from '@/design-system';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CandyButton } from '@/components/buttons/candy-button';

export interface LoginFormLayerProps {
  anim: Animated.Value;
  contentWidth: number;
  phoneInput: string;
  onPhoneChange: (val: string) => void;
  onSendOtp: () => void;
  sendingOtp: boolean;
  isOtpSent: boolean;
  onEditPhone: () => void;
  otpInput: string;
  onOtpChange: (val: string) => void;
  onVerify: () => void;
  verifying: boolean;
  error: string | null;
  onClearError: () => void;
  onBack: () => void;
  feedbackFade: Animated.Value;
}

/**
 * Independent Layer 5: Centered Login / OTP Form
 *
 * Screen-Centered Layout with Two Clear States:
 * 1. Initial State (!isOtpSent):
 *    - Mobile number input pill
 *    - Brown "Send OTP →" CandyButton
 *
 * 2. Sent State (isOtpSent):
 *    - Fixed mobile number card with "Edit" button
 *    - 6 OTP digit boxes (auto-focused)
 *    - 60s timer countdown ("Resend code in 58s" / "Resend OTP")
 *    - "Continue →" CandyButton (muted until 6 digits entered)
 *
 * Both states are screen-centered over the sunny halo.
 */
export function LoginFormLayer({
  anim,
  contentWidth,
  phoneInput,
  onPhoneChange,
  onSendOtp,
  sendingOtp,
  isOtpSent,
  onEditPhone,
  otpInput,
  onOtpChange,
  onVerify,
  verifying,
  error,
  onClearError,
  onBack,
  feedbackFade,
}: LoginFormLayerProps) {
  const [isPhoneFocused, setIsPhoneFocused] = useState(false);
  const [isOtpFocused, setIsOtpFocused] = useState(false);
  const [timer, setTimer] = useState(60);

  const phoneInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const otpInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const isPhoneValid = phoneInput.length === 10;
  const isOtpComplete = otpInput.length === 6;

  // 60-second countdown timer for resend
  useEffect(() => {
    if (!isOtpSent) return;
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOtpSent]);

  // Focus OTP box automatically upon entering sent state
  useEffect(() => {
    if (isOtpSent) {
      const focusTimer = setTimeout(() => {
        otpInputRef.current?.focus();
      }, 350);
      return () => clearTimeout(focusTimer);
    }
  }, [isOtpSent]);

  // Calculate box width evenly across 6 slots
  const otpBoxWidth = Math.floor((contentWidth - 5 * 8) / 6);

  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.93, 1],
  });

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  const handleSendPress = () => {
    setTimer(60);
    onSendOtp();
  };

  const formattedPhone =
    phoneInput.length === 10
      ? `${phoneInput.slice(0, 5)} ${phoneInput.slice(5)}`
      : phoneInput;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: contentWidth,
          opacity: anim,
          transform: [{ scale }, { translateY }],
        },
      ]}>
      {/* Top Nav: Back button */}
      <View style={styles.topSection}>
        <View style={styles.topNavRow}>
          <Pressable
            onPress={onBack}
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color="#4A2A18" />
          </Pressable>
        </View>


        {/* Floating Error Notification */}
        {error ? (
          <Pressable onPress={onClearError} style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color="#991B1B" />
            <Text style={styles.errorText} numberOfLines={2}>
              {error}
            </Text>
            <Ionicons name="close" size={16} color="#991B1B" />
          </Pressable>
        ) : null}

        {/* Floating OTP Sent Confirmation */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sentBanner,
            {
              opacity: feedbackFade,
              transform: [
                {
                  translateY: feedbackFade.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-6, 0],
                  }),
                },
              ],
            },
          ]}>
          <Ionicons name="checkmark-circle" size={17} color="#15803D" />
          <Text style={styles.sentText}>
            Verification code sent to +91 {formattedPhone}
          </Text>
        </Animated.View>
      </View>

      {/* 2. Screen-Centered Form Area */}
      <View style={styles.centeredCardArea}>
        {/* Welcome Text */}
        <View style={styles.welcomeTextContainer}>
          <Text style={styles.welcomeTitle}>{isOtpSent ? 'Verify Phone' : 'Welcome back'}</Text>
          <Text style={styles.welcomeSubtitle}>
            {isOtpSent ? 'Enter the code sent to your number.' : 'Log in to your Cabzon Driver account.'}
          </Text>
        </View>

        {!isOtpSent ? (
          /* State 1: Number input + Send OTP button */
          <View style={styles.stateContainer}>
            {/* Enter Mobile Number Input */}
            <Pressable
              onPress={() => phoneInputRef.current?.focus()}
              style={[styles.phoneInputCard, isPhoneFocused && styles.phoneInputCardFocused]}>
              <View style={styles.phoneIconBox}>
                <Ionicons name="call" size={17} color="#12304A" />
              </View>

              <View style={styles.verticalDivider} />

              <TextInput
                ref={phoneInputRef}
                style={styles.phoneTextInput}
                placeholder="Enter Mobile Number"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                maxLength={10}
                value={phoneInput}
                onChangeText={onPhoneChange}
                onFocus={() => setIsPhoneFocused(true)}
                onBlur={() => setIsPhoneFocused(false)}
                returnKeyType="done"
                onSubmitEditing={handleSendPress}
              />

              {phoneInput.length > 0 && (
                <Pressable
                  onPress={() => onPhoneChange('')}
                  hitSlop={8}
                  style={styles.clearBtn}
                  accessibilityLabel="Clear phone number">
                  <Ionicons name="close-circle" size={18} color="#B5A490" />
                </Pressable>
              )}
            </Pressable>

            {/* Primary CandyButton */}
            <CandyButton
              title={sendingOtp ? 'Sending...' : 'Send OTP'}
              onPress={handleSendPress}
              disabled={!isPhoneValid || sendingOtp}
              loading={sendingOtp}
              variant="primary"
              icon={
                !sendingOtp && (
                  <Ionicons name="arrow-forward" size={18} color="#12304A" style={{ marginLeft: 2 }} />
                )
              }
              style={styles.sendOtpBtn}
            />
          </View>
        ) : (
          /* State 2: Fixed number + OTP field + 60s timer resend + Continue button */
          <View style={styles.stateContainer}>
            {/* Fixed Mobile Number Card with Edit Option */}
            <View style={styles.fixedPhoneCard}>
              <View style={styles.phoneIconBox}>
                <Ionicons name="call" size={17} color="#12304A" />
              </View>

              <View style={styles.verticalDivider} />

              <Text style={styles.fixedPhoneText}>+91 {formattedPhone}</Text>

              <Pressable
                onPress={onEditPhone}
                hitSlop={10}
                style={({ pressed }) => [styles.editBtn, pressed && styles.editBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Edit mobile number">
                <Ionicons name="pencil" size={13} color="#12304A" />
                <Text style={styles.editText}>Edit</Text>
              </Pressable>
            </View>

            {/* Six OTP Digit Boxes */}
            <View style={styles.otpGridContainer}>
              {[0, 1, 2, 3, 4, 5].map((index) => {
                const digit = otpInput[index] || '';
                const isCurrent = otpInput.length === index && isOtpFocused;
                const isFilled = Boolean(digit);

                return (
                  <View
                    key={index}
                    style={[
                      styles.otpBox,
                      { width: otpBoxWidth, height: otpBoxWidth * 1.12 },
                      isCurrent && styles.otpBoxCurrent,
                      isFilled && styles.otpBoxFilled,
                    ]}>
                    <Text style={styles.otpDigitText}>{digit}</Text>
                  </View>
                );
              })}

              {/* Hidden Input to handle physical/soft keyboard input for the 6 boxes */}
              <TextInput
                ref={otpInputRef}
                style={[StyleSheet.absoluteFill, { opacity: 0.01, color: 'transparent', zIndex: 10 }]}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpInput}
                onChangeText={onOtpChange}
                onFocus={() => setIsOtpFocused(true)}
                onBlur={() => setIsOtpFocused(false)}
                returnKeyType="done"
                onSubmitEditing={() => onVerify()}
                cursorColor="transparent"
                caretHidden={true}
              />
            </View>

            {/* 60s Timer Resend Row */}
            <View style={styles.timerRow}>
              {timer > 0 ? (
                <Text style={styles.timerText}>
                  Resend code in <Text style={styles.timerCount}>{timer}s</Text>
                </Text>
              ) : (
                <Pressable
                  onPress={() => {
                    setTimer(60);
                    onSendOtp();
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Resend OTP">
                  <Text style={styles.resendLinkText}>Resend OTP</Text>
                </Pressable>
              )}
            </View>

            {/* Continue Button (Muted until 6 digits entered, then active primary CandyButton) */}
            <CandyButton
              title={verifying ? 'Verifying...' : 'Continue'}
              onPress={onVerify}
              disabled={!isOtpComplete || verifying}
              loading={verifying}
              variant={isOtpComplete ? 'primary' : 'muted'}
              icon={
                !verifying && (
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={isOtpComplete ? colors.darkNavy : colors.secondary}
                    style={{ marginLeft: 2 }}
                  />
                )
              }
              style={styles.continueBtn}
            />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = createStyles(() => ({
  container: {
    width: '100%',
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topSection: {
    width: '100%',
  },

  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    height: 38,
    marginBottom: 6,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    transform: [{ scale: 0.95 }],
  },
  welcomeTextContainer: {
    marginBottom: 40,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  welcomeTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: typography.sizes.base,
    color: colors.secondary,
    fontWeight: '500',
    lineHeight: 22,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 8,
  },
  errorText: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: '#991B1B',
    fontWeight: '500',
  },
  sentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 7,
    marginBottom: 6,
  },
  sentText: {
    fontSize: 12.5,
    color: '#15803D',
    fontWeight: '600',
  },
  centeredCardArea: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 80,
  },
  stateContainer: {
    width: '100%',
    alignItems: 'center',
  },
  phoneInputCard: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    shadowColor: '#8C5A20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 3,
    borderWidth: 1.5,
    borderColor: '#E8DBC9',
  },
  phoneInputCardFocused: {
    borderColor: '#B07548',
    shadowColor: '#B07548',
    shadowOpacity: 0.20,
    shadowRadius: 16,
  },
  fixedPhoneCard: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    shadowColor: '#8C5A20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 3,
    borderWidth: 1.5,
    borderColor: '#E8DBC9',
  },
  fixedPhoneText: {
    flex: 1,
    fontSize: 16.5,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.5,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: '#FAF1DF',
  },
  editBtnPressed: {
    backgroundColor: '#F3E5CB',
    transform: [{ scale: 0.95 }],
  },
  editText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.darkNavy,
  },
  phoneIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#FAF1DF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verticalDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#EAD7BD',
    marginHorizontal: 12,
  },
  phoneTextInput: {
    flex: 1,
    fontSize: typography.sizes.base,
    fontWeight: '600',
    color: colors.text,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 6,
  },
  sendOtpBtn: {
    width: '100%',
    marginTop: 14,
  },
  otpGridContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 16,
  },
  otpBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8C5A20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  otpBoxCurrent: {
    borderColor: colors.darkNavy,
    borderWidth: 1.6,
    backgroundColor: colors.surface,
  },
  otpBoxFilled: {
    borderColor: '#CCA67B',
    backgroundColor: '#FFFFFF',
  },
  otpDigitText: {
    fontSize: 21,
    fontWeight: '700',
    color: colors.text,
  },
  hiddenOtpInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  timerRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    marginBottom: 2,
  },
  timerText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: colors.secondary,
  },
  timerCount: {
    fontWeight: '700',
    color: colors.darkNavy,
  },
  resendLinkText: {
    fontSize: typography.sizes.label,
    fontWeight: '700',
    color: colors.darkNavy,
    textDecorationLine: 'underline',
  },
  continueBtn: {
    width: '100%',
    marginTop: 14,
  },
}));
