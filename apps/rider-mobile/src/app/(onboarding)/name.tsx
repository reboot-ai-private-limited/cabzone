import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth-context';
import { colors, radii, spacing, typography } from '@/design-system';

export default function NameOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, updateProfile } = useAuth();
  const [name, setName] = useState(profile?.name ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Animated keyboard bottom clearance
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setIsKeyboardVisible(true);
      const keyboardHeight = e.endCoordinates.height;
      const targetOffset = Math.max(
        0,
        keyboardHeight - (Platform.OS === 'ios' ? insets.bottom : 0) + spacing.md,
      );

      Animated.timing(keyboardOffset, {
        toValue: targetOffset,
        duration: Platform.OS === 'ios' ? e.duration || 250 : 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      setIsKeyboardVisible(false);
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? (e as { duration?: number })?.duration || 200 : 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom, keyboardOffset]);

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }

    Keyboard.dismiss();
    setIsSaving(true);
    setError(null);
    try {
      await updateProfile({ name: trimmed });
      router.replace('/(rider)/(tabs)/home');
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Unable to save your name. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleButtonPress = () => {
    void handleSaveName();
  };

  const isNameValid = name.trim().length >= 2;

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.inner, { paddingBottom: keyboardOffset }]}>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.topSection}>
            {/* Step indicator badge */}
            <View style={styles.badgeRow}>
              <View style={styles.iconCircle}>
                <Ionicons name="person" size={24} color={colors.deepBrown} />
              </View>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>QUICK SETUP</Text>
              </View>
            </View>

            <Text style={styles.title}>What should drivers call you?</Text>
            <Text style={styles.subtitle}>
              Your name helps your driver identify you at the pickup location. You can update this
              or add an emergency contact anytime in Profile.
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>FULL NAME</Text>
              <View
                style={[
                  styles.inputWrapper,
                  isFocused && styles.inputWrapperFocused,
                  error ? styles.inputWrapperError : null,
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={isFocused ? colors.brandBrown : colors.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Rohan Chatterjee"
                  placeholderTextColor={colors.muted}
                  value={name}
                  onChangeText={(txt) => {
                    setName(txt);
                    if (error) setError(null);
                  }}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (isNameValid) {
                      void handleSaveName();
                    } else {
                      Keyboard.dismiss();
                    }
                  }}
                  autoFocus
                />
                {name.length > 0 ? (
                  <Pressable
                    onPress={() => {
                      setName('');
                      if (error) setError(null);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.clearBtn}
                    accessibilityLabel="Clear name"
                  >
                    <Ionicons name="close-circle" size={18} color={colors.muted} />
                  </Pressable>
                ) : null}
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>

        {/* Floating Action Button that stays above keyboard */}
        <View style={styles.bottomBar}>
          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              (!isNameValid || isSaving) && styles.submitBtnDisabled,
              pressed && isNameValid && !isSaving && styles.submitBtnPressed,
            ]}
            onPress={handleButtonPress}
            disabled={!isNameValid || isSaving}
            accessibilityRole="button"
            accessibilityLabel="Start booking rides"
          >
            {isSaving ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.deepBrown} />
                <Text style={styles.submitBtnText}>Saving Profile...</Text>
              </View>
            ) : (
              <View style={styles.btnContent}>
                <Text style={styles.submitBtnText}>Start Booking Rides</Text>
                <Ionicons name="arrow-forward" size={20} color={colors.deepBrown} />
              </View>
            )}
          </Pressable>
        </View>
      </Animated.View>
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
  },
  tapToDismissBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 5,
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  topSection: {
    gap: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
  },
  stepBadge: {
    backgroundColor: colors.warmBeige,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.brandBrown,
  },
  title: {
    ...typography.h1,
    color: colors.deepBrown,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.secondary,
    lineHeight: 22,
    marginTop: 2,
  },
  inputContainer: {
    marginTop: spacing.md,
    gap: spacing.xs,
    zIndex: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: colors.brandBrown,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 54,
  },
  inputWrapperFocused: {
    borderColor: colors.deepBrown,
    backgroundColor: colors.white,
  },
  inputWrapperError: {
    borderColor: colors.error,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.deepBrown,
    paddingVertical: 14,
  },
  clearBtn: {
    padding: spacing.xs,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    marginTop: spacing.xs,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.error,
    fontWeight: '600',
  },
  bottomBar: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  submitBtn: {
    backgroundColor: colors.amber,
    borderRadius: radii.md,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
  },
  submitBtnPressed: {
    backgroundColor: colors.amberStrong,
    transform: [{ scale: 0.985 }],
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.deepBrown,
    letterSpacing: 0.2,
  },
});
