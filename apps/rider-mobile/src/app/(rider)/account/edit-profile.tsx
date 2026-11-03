import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth-context';
import { geoAndPricingApi } from '@/services/api';
import { colors, radii, spacing, typography, createStyles } from '@/design-system';

const DEFAULT_CITIES = ['Siliguri', 'Darjeeling', 'Kurseong', 'Kalimpong', 'Gangtok', 'Kolkata'];

export default function EditProfileScreen() {
  const router = useRouter();
  const { token, profile, updateProfile, preferences, updatePreferences } = useAuth();

  const [name, setName] = useState(profile?.name ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [selectedCity, setSelectedCity] = useState(preferences.operationalCity);
  const [availableCities, setAvailableCities] = useState<string[]>(DEFAULT_CITIES);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    void geoAndPricingApi
      .listActiveCities(token)
      .then((zones) => {
        const names = zones.map((z) => z.name).filter(Boolean);
        if (names.length > 0) {
          setAvailableCities([...new Set([...names, ...DEFAULT_CITIES])]);
        }
      })
      .catch(() => {
        // fallback to default cities
      });
  }, [token]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }
    const trimmedEmail = email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address or leave it blank.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSavedNotice(false);
    try {
      await Promise.all([
        updateProfile({
          name: trimmedName,
          email: trimmedEmail || null,
          preferredLanguage: preferences.language,
        }),
        updatePreferences({ operationalCity: selectedCity }),
      ]);
      setSavedNotice(true);
      setTimeout(() => router.back(), 600);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
        </Pressable>
        <Text style={styles.topBarTitle}>Personal Profile & City</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>FULL NAME</Text>
        <TextInput
          style={styles.input}
          placeholder="Your full name"
          placeholderTextColor={colors.muted}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>EMAIL ADDRESS (OPTIONAL)</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={colors.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>OPERATIONAL HOME CITY</Text>
        <View style={styles.citiesGrid}>
          {availableCities.map((city) => (
            <Pressable
              key={city}
              style={[
                styles.cityChip,
                selectedCity === city && styles.cityChipActive,
              ]}
              onPress={() => setSelectedCity(city)}
            >
              <Ionicons
                name="location-outline"
                size={15}
                color={selectedCity === city ? colors.amber : colors.deepBrown}
              />
              <Text
                style={[
                  styles.cityChipText,
                  selectedCity === city && styles.cityChipTextActive,
                ]}
              >
                {city}
              </Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {savedNotice ? (
          <Text style={styles.successText}>✓ Profile updated successfully</Text>
        ) : null}

        <Pressable
          style={styles.saveBtn}
          onPress={() => void handleSave()}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color={colors.deepBrown} />
          ) : (
            <Text style={styles.saveBtnText}>Save Changes</Text>
          )}
        </Pressable>
      </ScrollView>
        </View>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = createStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  label: {
    ...typography.label,
    color: colors.brandBrown,
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.cream,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.deepBrown,
  },
  citiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radii.pill,
  },
  cityChipActive: {
    backgroundColor: colors.deepBrown,
    borderColor: colors.deepBrown,
  },
  cityChipText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  cityChipTextActive: {
    color: colors.amber,
  },
  errorText: {
    fontSize: 13,
    color: colors.error,
    fontWeight: '600',
  },
  successText: {
    fontSize: 13,
    color: colors.success,
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: colors.amber,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveBtnText: {
    ...typography.h2,
    color: colors.deepBrown,
  },
}));
