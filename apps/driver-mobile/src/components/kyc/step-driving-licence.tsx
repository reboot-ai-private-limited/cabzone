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

interface StepDrivingLicenceProps {
  draft: OnboardingDraft;
  onUpdate: (partial: Partial<OnboardingDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepDrivingLicence({
  draft,
  onUpdate,
  onNext,
  onBack,
}: StepDrivingLicenceProps) {
  const [dlNumber, setDlNumber] = useState(draft.dlNumber || '');
  const [isUploaded, setIsUploaded] = useState(draft.dlUploaded || false);

  const handleDlChange = (text: string) => {
    // Uppercase and strip invalid characters
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
    setDlNumber(cleaned);
  };

  const handleToggleUpload = () => {
    setIsUploaded(!isUploaded);
  };

  const handleContinue = () => {
    onUpdate({
      dlNumber: dlNumber || 'WB7420220012345',
      dlUploaded: true,
    });
    onNext();
  };

  const isValid = dlNumber.trim().length >= 8 || isUploaded;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top row */}
        <View style={styles.topRow}>
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <View style={styles.stepCounterBadge}>
            <Text style={styles.stepCounterText}>4 of 6</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: '66.6%' }]} />
        </View>

        <Text style={styles.heading}>Driving licence</Text>
        <Text style={styles.subheading}>
          Upload your valid commercial or transport category Indian driving licence.
        </Text>

        {/* Upload Box Card */}
        <Pressable
          style={[styles.uploadBox, isUploaded && styles.uploadBoxDone]}
          onPress={handleToggleUpload}>
          {isUploaded ? (
            <View style={styles.uploadedState}>
              <View style={styles.checkCircle}>
                <Text style={styles.checkIcon}>✓</Text>
              </View>
              <Text style={styles.uploadedTitle}>Licence photo uploaded</Text>
              <Text style={styles.uploadedSub}>Tap to replace or re-capture document</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.uploadPlusCircle}>
                <Text style={styles.plusIcon}>+</Text>
              </View>
              <Text style={styles.uploadTitle}>Upload licence photo</Text>
              <Text style={styles.uploadSub}>Take a clear picture of the front side</Text>
            </View>
          )}
        </Pressable>

        {/* Licence Number Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Licence number *</Text>
          <TextInput
            style={[styles.input, styles.dlInput]}
            placeholder="e.g. WB7420220012345"
            placeholderTextColor="#9CA3AF"
            value={dlNumber}
            onChangeText={handleDlChange}
            autoCapitalize="characters"
            maxLength={16}
          />
          <Text style={styles.helperText}>
            Enter without spaces or hyphens as printed on your Smart Card DL.
          </Text>
        </View>

        <View style={styles.tipsBox}>
          <Text style={styles.tipsTitle}>Document guidelines:</Text>
          <Text style={styles.tipItem}>• All 4 corners of the licence must be visible.</Text>
          <Text style={styles.tipItem}>• Avoid camera flash reflections or dark shadows.</Text>
          <Text style={styles.tipItem}>• Must be valid and not expired.</Text>
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
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  backArrow: {
    fontSize: 18,
    color: '#111827',
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
  uploadBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  uploadBoxDone: {
    borderColor: '#10B981',
    borderStyle: 'solid',
    backgroundColor: '#F0FDF4',
  },
  emptyState: {
    alignItems: 'center',
  },
  uploadPlusCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  plusIcon: {
    fontSize: 28,
    color: '#6B7280',
    fontWeight: '300',
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  uploadSub: {
    fontSize: 12,
    color: '#6B7280',
  },
  uploadedState: {
    alignItems: 'center',
  },
  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  checkIcon: {
    fontSize: 26,
    fontWeight: '900',
    color: '#16A34A',
  },
  uploadedTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#166534',
    marginBottom: 4,
  },
  uploadedSub: {
    fontSize: 12,
    color: '#15803D',
  },
  inputGroup: {
    marginBottom: 24,
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
  dlInput: {
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  helperText: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 6,
  },
  tipsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 24,
    gap: 4,
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  tipItem: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  nextBtn: {
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
