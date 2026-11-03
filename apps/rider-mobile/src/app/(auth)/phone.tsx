import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Image,
  ScrollView,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { normalizeIndianPhoneE164 } from '@/services/rider-helpers';
import { colors, radii, spacing, typography, createStyles } from '@/design-system';

export default function PhoneEntryScreen() {
  const router = useRouter();
  const { requestOtp } = useAuth();
  const reducedMotion = useReducedMotion();
  const [phoneDigits, setPhoneDigits] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exitingRef = useRef(false);
  const [sections] = useState(() => [
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
  ]);

  const normalizedPhone = normalizeIndianPhoneE164(phoneDigits);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);


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

  const handleBack = () => {
    if (isKeyboardVisible) {
      Keyboard.dismiss();
      return;
    }
    if (isLoading) return;
    animateOut(() => router.back());
  };

  const handleSendOtp = async () => {
    Keyboard.dismiss();
    if (!normalizedPhone) {
      setError('Enter a valid 10-digit Indian mobile number starting with 6–9.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await requestOtp(normalizedPhone);
      setIsLoading(false);
      animateOut(() => router.push('/(auth)/otp'));
    } catch (err: unknown) {
      setIsLoading(false);
      setError(
        err instanceof Error ? err.message : 'Unable to send OTP right now. Please try again.',
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={styles.container}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.inner}>
          <Animated.View
            style={[
              styles.header,
              {
                opacity: sections[0],
                transform: [
                  {
                    translateY: sections[0].interpolate({
                      inputRange: [0, 1],
                      outputRange: [-12, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
              style={styles.backBtn}
              onPress={handleBack}
              disabled={isLoading}
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
          </Animated.View>

          <ScrollView
            style={styles.form}
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="never"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={{
                opacity: sections[1],
                transform: [
                  {
                    translateY: sections[1].interpolate({
                      inputRange: [0, 1],
                      outputRange: [12, 0],
                    }),
                  },
                ],
              }}
            >
              <Text accessibilityRole="header" style={styles.title}>
                Your mobile number
              </Text>
              <Text style={styles.subtitle}>We&apos;ll text you a 6-digit sign-in code.</Text>
            </Animated.View>

            <Animated.View
              style={{
                opacity: sections[2],
                transform: [
                  {
                    translateY: sections[2].interpolate({
                      inputRange: [0, 1],
                      outputRange: [16, 0],
                    }),
                  },
                ],
              }}
            >
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
                  onSubmitEditing={() => void handleSendOtp()}
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
            </Animated.View>
          </ScrollView>

          <Animated.View
            style={[
              styles.footer,
              {
                opacity: sections[3],
                transform: [
                  {
                    translateY: sections[3].interpolate({
                      inputRange: [0, 1],
                      outputRange: [18, 0],
                    }),
                  },
                  {
                    scale: sections[3].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                ],
              },
            ]}
          >
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
          </Animated.View>
        </View>
        </TouchableWithoutFeedback>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = createStyles(() => ({
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
}));
