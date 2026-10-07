import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { CandyButton } from '@/components/buttons/candy-button';
import { useAuth } from '@/context/auth-context';

interface SignupStepProps {
  onBack: () => void;
  onSuccess?: () => void;
}

export function SignupStep({ onBack }: SignupStepProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const {
    phone: contextPhone,
    sendOtp,
    verifyOtp,
    error,
    clearError,
    otpCooldown,
  } = useAuth();

  const [phoneInput, setPhoneInput] = useState(() =>
    contextPhone ? contextPhone.replace(/\D/g, '').slice(-10) : '',
  );
  const [otpInput, setOtpInput] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isPhoneFocused, setIsPhoneFocused] = useState(false);
  const [isOtpFocused, setIsOtpFocused] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  const otpInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const [feedbackFade] = useState(() => new Animated.Value(0));

  const handlePhoneChange = (val: string) => {
    clearError();
    const digitsOnly = val.replace(/\D/g, '').slice(0, 10);
    setPhoneInput(digitsOnly);
  };

  const handleSendOtp = async () => {
    if (phoneInput.length !== 10 || sendingOtp) return;
    Keyboard.dismiss();
    setSendingOtp(true);
    clearError();

    const ok = await sendOtp(phoneInput);
    setSendingOtp(false);

    if (ok) {
      setIsOtpSent(true);
      // Trigger subtle notification fade
      Animated.sequence([
        Animated.timing(feedbackFade, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(2600),
        Animated.timing(feedbackFade, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();

      // Automatically focus first OTP box
      setTimeout(() => {
        otpInputRef.current?.focus();
      }, 300);
    }
  };

  const handleOtpChange = (val: string) => {
    clearError();
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setOtpInput(digits);

    if (digits.length === 6) {
      handleVerify(digits);
    }
  };

  const handleVerify = async (codeToVerify?: string) => {
    const code = codeToVerify || otpInput;
    if (code.length !== 6 || verifying) return;
    Keyboard.dismiss();
    setVerifying(true);
    clearError();

    await verifyOtp(code);
    setVerifying(false);
  };

  // Dev preset helper
  const handleDevQuickFill = async () => {
    clearError();
    setPhoneInput('9000000002');
    setSendingOtp(true);
    const ok = await sendOtp('9000000002');
    setSendingOtp(false);
    if (ok) {
      setIsOtpSent(true);
      setOtpInput('000000');
      handleVerify('000000');
    }
  };

  const isPhoneValid = phoneInput.length === 10;
  const isOtpComplete = otpInput.length === 6;

  // Responsive sizing calculations
  const contentWidth = Math.min(screenWidth - 48, 360);
  const illustrationHeight = Math.min(screenHeight * 0.36, 290);
  const otpBoxWidth = Math.floor((contentWidth - 5 * 8) / 6);

  return (
    <View style={styles.container}>
      {/* Background warm sunny gradient */}
      <LinearGradient
        colors={['#FFFDF4', '#FEF7DF', '#FDF0CA', '#FCE9AC']}
        locations={[0, 0.28, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Central glowing sun & dashed orbit rings */}
      <View
        pointerEvents="none"
        style={[
          styles.haloContainer,
          {
            top: insets.top + (screenHeight > 750 ? 90 : 60),
            left: (screenWidth - 380) / 2,
          },
        ]}>
        <Svg width={380} height={380} viewBox="0 0 380 380">
          <Defs>
            <RadialGradient id="sunGlow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
              <Stop offset="45%" stopColor="#FEF7DE" stopOpacity="0.75" />
              <Stop offset="75%" stopColor="#FDEAB4" stopOpacity="0.32" />
              <Stop offset="100%" stopColor="#FCE4A0" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* Warm center halo glow */}
          <Circle cx="190" cy="190" r="162" fill="url(#sunGlow)" />

          {/* Inner orbit ring */}
          <Circle
            cx="190"
            cy="190"
            r="145"
            fill="none"
            stroke="#ECC662"
            strokeWidth="1.5"
            strokeDasharray="6, 8"
            opacity="0.65"
          />

          {/* Outer orbit ring */}
          <Circle
            cx="190"
            cy="190"
            r="178"
            fill="none"
            stroke="#E2B74B"
            strokeWidth="1.2"
            strokeDasharray="6, 10"
            opacity="0.4"
          />

          {/* Swooping dashed trail curving toward road */}
          <Path
            d="M 190 335 C 190 355, 170 375, 140 380"
            fill="none"
            stroke="#ECC662"
            strokeWidth="1.3"
            strokeDasharray="5, 7"
            opacity="0.5"
          />
        </Svg>
      </View>

      {/* Bottom cityscape & auto-rickshaw/sedan illustration */}
      <View pointerEvents="none" style={[styles.bottomIllustrationContainer, { height: illustrationHeight }]}>
        <Image
          source={require('@/../assets/images/signup-bottom-illustration.png')}
          style={[styles.bottomIllustration, { height: illustrationHeight }]}
          resizeMode="cover"
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + 8,
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Top 3-segment progress indicator */}
          <View style={[styles.progressBarContainer, { width: contentWidth }]}>
            <View style={[styles.progressSegment, styles.progressSegmentActive]} />
            <View style={[styles.progressSegment, styles.progressSegmentInactive]} />
            <View style={[styles.progressSegment, styles.progressSegmentInactive]} />
          </View>

          {/* Header navigation bar with subtle back button */}
          <View style={[styles.topNavRow, { width: contentWidth }]}>
            <Pressable
              onPress={onBack}
              hitSlop={12}
              style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}>
              <Ionicons name="chevron-back" size={24} color="#4A2A18" />
            </Pressable>
          </View>

          {/* Floating error notification */}
          {error ? (
            <Pressable onPress={clearError} style={[styles.errorBanner, { width: contentWidth }]}>
              <Ionicons name="alert-circle" size={18} color="#991B1B" />
              <Text style={styles.errorText} numberOfLines={2}>
                {error}
              </Text>
              <Ionicons name="close" size={16} color="#991B1B" />
            </Pressable>
          ) : null}

          {/* Floating OTP sent confirmation */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.sentBanner,
              {
                width: contentWidth,
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
              Verification code sent to +91 {phoneInput.slice(0, 5)} {phoneInput.slice(5)}
            </Text>
          </Animated.View>

          {/* Center Form Section */}
          <View style={[styles.formContainer, { width: contentWidth }]}>
            {/* Phone Number Input Pill */}
            <Pressable
              onPress={() => phoneInputRef.current?.focus()}
              style={[
                styles.phoneInputCard,
                isPhoneFocused && styles.phoneInputCardFocused,
              ]}>
              {/* Telephone Icon Box */}
              <View style={styles.phoneIconBox}>
                <Ionicons name="call" size={17} color="#8C4A1B" />
              </View>

              {/* Subtle vertical separator line */}
              <View style={styles.verticalDivider} />

              {/* Text Input */}
              <TextInput
                ref={phoneInputRef}
                style={styles.phoneTextInput}
                placeholder="Enter Mobile Number"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                maxLength={10}
                value={phoneInput}
                onChangeText={handlePhoneChange}
                onFocus={() => setIsPhoneFocused(true)}
                onBlur={() => setIsPhoneFocused(false)}
                returnKeyType="done"
                onSubmitEditing={handleSendOtp}
              />

              {phoneInput.length > 0 && (
                <Pressable
                  onPress={() => setPhoneInput('')}
                  hitSlop={8}
                  style={styles.clearBtn}>
                  <Ionicons name="close-circle" size={18} color="#B5A490" />
                </Pressable>
              )}
            </Pressable>

            {/* Send OTP Button (Espresso Candy Variant) */}
            <CandyButton
              title={sendingOtp ? 'Sending...' : otpCooldown > 0 ? `Resend OTP (${otpCooldown}s)` : 'Send OTP'}
              onPress={handleSendOtp}
              disabled={!isPhoneValid || sendingOtp || (isOtpSent && otpCooldown > 0)}
              loading={sendingOtp}
              variant="espresso"
              icon={
                !sendingOtp && (
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 2 }} />
                )
              }
              style={styles.actionBtn}
            />

            {/* 6 OTP Digit Boxes Row */}
            <Pressable
              onPress={() => otpInputRef.current?.focus()}
              style={styles.otpGridContainer}>
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
            </Pressable>

            {/* Hidden Input to handle physical/soft keyboard input for the 6 boxes */}
            <TextInput
              ref={otpInputRef}
              style={styles.hiddenOtpInput}
              keyboardType="number-pad"
              maxLength={6}
              value={otpInput}
              onChangeText={handleOtpChange}
              onFocus={() => setIsOtpFocused(true)}
              onBlur={() => setIsOtpFocused(false)}
              returnKeyType="done"
              onSubmitEditing={() => handleVerify()}
            />

            {/* Continue Button (Muted until 6 digits entered, then active espresso CandyButton) */}
            <CandyButton
              title={verifying ? 'Verifying...' : 'Continue'}
              onPress={() => handleVerify()}
              disabled={!isOtpComplete || verifying}
              loading={verifying}
              variant={isOtpComplete ? 'espresso' : 'muted'}
              icon={
                !verifying && (
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={isOtpComplete ? '#FFFFFF' : '#A5957F'}
                    style={{ marginLeft: 2 }}
                  />
                )
              }
              style={styles.actionBtn}
            />

            {/* Quick Dev Preset Pill (visible for fast development testing) */}
            {__DEV__ && (
              <Pressable onPress={handleDevQuickFill} style={styles.devChip}>
                <Text style={styles.devChipText}>⚡ Fast Dev Login (9000000002 / 000000)</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFDF4',
    position: 'relative',
    overflow: 'hidden',
  },
  haloContainer: {
    position: 'absolute',
    width: 380,
    height: 380,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  bottomIllustrationContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bottomIllustration: {
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
  },
  keyboardAvoid: {
    flex: 1,
    zIndex: 10,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  progressSegment: {
    flex: 1,
    height: 3.5,
    borderRadius: 2,
  },
  progressSegmentActive: {
    backgroundColor: '#1E140C',
  },
  progressSegmentInactive: {
    backgroundColor: '#E4DAC6',
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    height: 40,
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
  formContainer: {
    alignItems: 'center',
    marginTop: 18,
  },
  phoneInputCard: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    shadowColor: '#8C5A20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(238, 222, 196, 0.7)',
  },
  phoneInputCardFocused: {
    borderColor: '#B07548',
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  phoneIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
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
    fontSize: 16,
    fontWeight: '600',
    color: '#2C1810',
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 6,
  },
  actionBtn: {
    width: '100%',
    marginTop: 14,
  },
  otpGridContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 18,
  },
  otpBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: '#ECE0CE',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8C5A20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  otpBoxCurrent: {
    borderColor: '#8C4A1B',
    borderWidth: 1.6,
    backgroundColor: '#FFFDF9',
  },
  otpBoxFilled: {
    borderColor: '#CCA67B',
    backgroundColor: '#FFFFFF',
  },
  otpDigitText: {
    fontSize: 21,
    fontWeight: '700',
    color: '#2C1810',
  },
  hiddenOtpInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
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
    fontSize: 13,
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
  devChip: {
    marginTop: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: 1,
    borderColor: '#ECC86C',
  },
  devChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#7A4A2B',
  },
});
