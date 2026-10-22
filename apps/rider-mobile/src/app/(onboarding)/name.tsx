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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth-context';
import { colors, radii, spacing, typography } from '@/design-system';

export default function NameOnboardingScreen() {
  const router = useRouter();
  const { profile, updateProfile } = useAuth();
  const [name, setName] = useState(profile?.name ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }

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

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topSection}>
          <View style={styles.iconCircle}>
            <Ionicons name="person-outline" size={28} color={colors.deepBrown} />
          </View>
          <Text style={styles.title}>What should drivers call you?</Text>
          <Text style={styles.subtitle}>
            Your name helps your driver confirm who they are picking up. You can add an email or emergency contact anytime in Profile.
          </Text>

          <Text style={styles.label}>FULL NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Rohan Chatterjee"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={(txt) => {
              setName(txt);
              if (error) setError(null);
            }}
            autoFocus
          />

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>

        <Pressable
          style={[
            styles.submitBtn,
            (name.trim().length < 2 || isSaving) && styles.submitBtnDisabled,
          ]}
          onPress={() => void handleSaveName()}
          disabled={name.trim().length < 2 || isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color={colors.deepBrown} />
          ) : (
            <Text style={styles.submitBtnText}>Start Booking Rides</Text>
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
    marginTop: spacing.lg,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.amber,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
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
  label: {
    ...typography.label,
    color: colors.brandBrown,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.cream,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
    fontSize: 17,
    fontWeight: '600',
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
