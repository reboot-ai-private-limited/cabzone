import React, { useEffect, useState } from 'react';
import { colors } from '@/design-system';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/auth-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import {
  BlobHaloLayer,
  CitySkylineLayer,
  TotoVehicleLayer,
  CabVehicleLayer,
  LoginFormLayer,
} from './layers';

export interface SignupStepProps {
  onBack: () => void;
  onSuccess?: () => void;
}

/**
 * Mobile Login Screen — Single-Page Orchestrated Entrance Animation
 *
 * Sequence:
 * 1. Initial State: Warm cream/light-yellow background + subtle static/breathing sun halo blob.
 * 2. City Skyline: Fades in first with 8-12px upward slide (T = 80ms..600ms).
 * 3. Vehicles Enter:
 *    - Brown/yellow toto/auto enters from left (T = 420ms..1100ms, ease-out)
 *    - White cab/car enters from right (T = 450ms..1170ms, ease-out)
 *    - Both settle naturally into final bottom positions without bouncing.
 * 4. Login Form: Pops into view as vehicles approach positions (T = 940ms..1440ms, scale .93 -> 1, opacity 0 -> 1).
 *
 * Total duration: ~1.8–2.0 seconds. After entrance, all elements remain stable.
 */
export function SignupStep({ onBack }: SignupStepProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const {
    phone: contextPhone,
    sendOtp,
    verifyOtp,
    error,
    clearError,
  } = useAuth();

  // Inputs & Auth state
  const [phoneInput, setPhoneInput] = useState(() =>
    contextPhone ? contextPhone.replace(/\D/g, '').slice(-10) : '',
  );
  const [otpInput, setOtpInput] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Subtle floating toast animation
  const [feedbackFade] = useState(() => new Animated.Value(0));

  // Independent animation layer drivers
  const [cityAnim] = useState(() => new Animated.Value(reducedMotion ? 1 : 0));
  const [totoAnim] = useState(() => new Animated.Value(reducedMotion ? 1 : 0));
  const [cabAnim] = useState(() => new Animated.Value(reducedMotion ? 1 : 0));
  const [formAnim] = useState(() => new Animated.Value(reducedMotion ? 1 : 0));

  useEffect(() => {
    if (reducedMotion) {
      cityAnim.setValue(1);
      totoAnim.setValue(1);
      cabAnim.setValue(1);
      formAnim.setValue(1);
      return;
    }

    // Master Orchestrated Sequence: Total time ~1.8s
    Animated.parallel([
      // Step 2: City skyline fades in first with slight upward movement
      Animated.timing(cityAnim, {
        toValue: 1,
        duration: 520,
        delay: 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),

      // Step 3: Vehicles enter after city is settling
      // Toto enters from left
      Animated.timing(totoAnim, {
        toValue: 1,
        duration: 680,
        delay: 420,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),

      // Cab enters from right
      Animated.timing(cabAnim, {
        toValue: 1,
        duration: 720,
        delay: 450,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),

      // Step 4: Login form appears as vehicles reach final positions
      Animated.timing(formAnim, {
        toValue: 1,
        duration: 500,
        delay: 940,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [cabAnim, cityAnim, formAnim, reducedMotion, totoAnim]);

  const handlePhoneChange = (val: string) => {
    clearError();
    const digitsOnly = val.replace(/\D/g, '').slice(0, 10);
    setPhoneInput(digitsOnly);
    if (isOtpSent && digitsOnly.length < 10) {
      setIsOtpSent(false);
      setOtpInput('');
    }
  };

  const handleSendOtp = async () => {
    if (phoneInput.length !== 10 || sendingOtp) return;
    Keyboard.dismiss();
    setSendingOtp(true);
    clearError();

    const ok = await sendOtp(phoneInput);
    setSendingOtp(false);

    if (ok) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setIsOtpSent(true);
      // Feedback fade
      Animated.sequence([
        Animated.timing(feedbackFade, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(2600),
        Animated.timing(feedbackFade, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
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

  const handleEditPhone = () => {
    clearError();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsOtpSent(false);
    setOtpInput('');
  };

  // Proportions & Responsive layout values
  const contentWidth = Math.min(screenWidth - 48, 360);
  const illustrationHeight = Math.min(screenHeight * 0.36, 290);
  
  // Make vehicles bigger, and make cab larger than toto
  const cabWidth = Math.min(screenWidth * 0.58, 240);
  const totoWidth = Math.min(screenWidth * 0.48, 200);

  return (
    <View style={styles.container}>
      {/* Layer 0: Background Warm Sunny Gradient */}
      <LinearGradient
        colors={['#FFFDF4', '#FEF7DF', '#FDF0CA', '#FCE9AC']}
        locations={[0, 0.28, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Layer 1: Background Blob / Halo (present immediately, subtle breathing) */}
      <BlobHaloLayer
        screenWidth={screenWidth}
        screenHeight={screenHeight}
        topInset={insets.top}
      />

      {/* Layer 2: City Skyline (fades in first with 8-12px upward rise) */}
      <CitySkylineLayer anim={cityAnim} />

      {/* Layer 3: Toto / Auto (enters from left into bottom-left) */}
      <TotoVehicleLayer
        anim={totoAnim}
        screenWidth={screenWidth}
        vehicleWidth={totoWidth}
      />

      {/* Layer 4: Cab / Car (enters from right into bottom-right) */}
      <CabVehicleLayer
        anim={cabAnim}
        screenWidth={screenWidth}
        vehicleWidth={cabWidth}
      />

      {/* Layer 5: Login / OTP Form (final focal element, screen-centered) */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + (screenHeight > 750 ? 12 : 6),
              minHeight: screenHeight,
              paddingBottom: Math.max(insets.bottom, 20) + illustrationHeight * 0.35,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <LoginFormLayer
            anim={formAnim}
            contentWidth={contentWidth}
            phoneInput={phoneInput}
            onPhoneChange={handlePhoneChange}
            onSendOtp={handleSendOtp}
            sendingOtp={sendingOtp}
            isOtpSent={isOtpSent}
            onEditPhone={handleEditPhone}
            otpInput={otpInput}
            onOtpChange={handleOtpChange}
            onVerify={handleVerify}
            verifying={verifying}
            error={error}
            onClearError={clearError}
            onBack={onBack}
            feedbackFade={feedbackFade}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    position: 'relative',
    overflow: 'hidden',
  },
  keyboardAvoid: {
    flex: 1,
    zIndex: 10,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

export default SignupStep;
