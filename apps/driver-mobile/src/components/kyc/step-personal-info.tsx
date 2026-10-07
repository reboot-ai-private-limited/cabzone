import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { OnboardingDraft } from './types';

interface StepPersonalInfoProps {
  draft: OnboardingDraft;
  onUpdate: (partial: Partial<OnboardingDraft>) => void;
  onNext: () => void;
  onClose: () => void;
}

export function StepPersonalInfo({ draft, onUpdate, onNext, onClose }: StepPersonalInfoProps) {
  const [firstName, setFirstName] = useState(draft.firstName);
  const [lastName, setLastName] = useState(draft.lastName);
  const [dob, setDob] = useState(draft.dateOfBirth);
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>(draft.gender);
  const [hasPhoto, setHasPhoto] = useState(draft.selfieTaken);

  const handleDobChange = (text: string) => {
    // Format DD/MM/YYYY automatically
    const cleaned = text.replace(/\D/g, '').slice(0, 8);
    let formatted = cleaned;
    if (cleaned.length > 2 && cleaned.length <= 4) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    } else if (cleaned.length > 4) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4)}`;
    }
    setDob(formatted);
  };

  const handleContinue = () => {
    onUpdate({
      firstName: firstName.trim() || 'Driver',
      lastName: lastName.trim(),
      dateOfBirth: dob.trim() || '15/05/1995',
      gender,
      selfieTaken: hasPhoto || true,
    });
    onNext();
  };

  const isValid = firstName.trim().length > 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header row with progress counter */}
        <View style={styles.topRow}>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          <View style={styles.stepCounterBadge}>
            <Text style={styles.stepCounterText}>1 of 6</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: '16.6%' }]} />
        </View>

        <Text style={styles.heading}>Personal information</Text>
        <Text style={styles.subheading}>Tell us about yourself to setup your profile</Text>

        {/* Profile Photo Placeholder */}
        <View style={styles.avatarSection}>
          <Pressable
            style={styles.avatarCircle}
            onPress={() => setHasPhoto(!hasPhoto)}>
            {hasPhoto ? (
              <Text style={styles.avatarIcon}>👤</Text>
            ) : (
              <Text style={styles.avatarPlus}>+</Text>
            )}
          </Pressable>
          <Text style={styles.avatarLabel}>
            {hasPhoto ? '✓ Profile photo added' : 'Add profile photo'}
          </Text>
        </View>

        {/* Inputs */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>First name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter first name"
            placeholderTextColor="#9CA3AF"
            value={firstName}
            onChangeText={setFirstName}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Last name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter last name"
            placeholderTextColor="#9CA3AF"
            value={lastName}
            onChangeText={setLastName}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Date of birth (DD / MM / YYYY)</Text>
          <TextInput
            style={styles.input}
            placeholder="DD / MM / YYYY"
            placeholderTextColor="#9CA3AF"
            value={dob}
            onChangeText={handleDobChange}
            keyboardType="number-pad"
            maxLength={10}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Gender</Text>
          <View style={styles.genderRow}>
            {(['MALE', 'FEMALE', 'OTHER'] as const).map((g) => (
              <Pressable
                key={g}
                style={[styles.genderChip, gender === g && styles.genderChipActive]}
                onPress={() => setGender(g)}>
                <Text
                  style={[
                    styles.genderChipText,
                    gender === g && styles.genderChipTextActive,
                  ]}>
                  {g === 'MALE' ? 'Male' : g === 'FEMALE' ? 'Female' : 'Other'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Next Button */}
        <Pressable
          style={({ pressed }) => [
            styles.nextBtn,
            !isValid && styles.btnDisabled,
            pressed && styles.btnPressed,
          ]}
          onPress={handleContinue}
          disabled={!isValid}>
          <Text style={styles.nextBtnText}>Next →</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  closeText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '700',
  },
  stepCounterBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  stepCounterText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4B5563',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    marginBottom: 28,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#002451',
    borderRadius: 3,
  },
  heading: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  subheading: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 24,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarPlus: {
    fontSize: 32,
    color: '#9CA3AF',
    fontWeight: '300',
  },
  avatarIcon: {
    fontSize: 36,
  },
  avatarLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111827',
  },
  genderRow: {
    flexDirection: 'row',
    gap: 10,
  },
  genderChip: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  genderChipActive: {
    backgroundColor: '#002451',
    borderColor: '#002451',
  },
  genderChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  genderChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  nextBtn: {
    marginTop: 20,
    backgroundColor: '#002451',
    borderRadius: 18,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#002451',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  btnDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  btnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  nextBtnText: {
    color: '#C8FF00',
    fontSize: 16,
    fontWeight: '800',
  },
});
