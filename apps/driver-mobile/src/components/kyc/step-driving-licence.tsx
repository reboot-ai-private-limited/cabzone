import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CandyButton } from '@/components/buttons/candy-button';
import { useAuth } from '@/context/auth-context';
import { driverApi } from '@/services/api';
import { pickDriverLicense, type SelectedDriverLicense } from '@/services/driver-license';
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
  const insets = useSafeAreaInsets();
  const { token, documents, refreshProfile } = useAuth();
  const [dlNumber, setDlNumber] = useState(draft.dlNumber || (__DEV__ ? 'WB7420220012345' : ''));
  const [expiryDate, setExpiryDate] = useState(draft.dlExpiry);
  const [isUploaded, setIsUploaded] = useState(draft.dlUploaded);
  const [selectedFile, setSelectedFile] = useState<SelectedDriverLicense | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleDlChange = (text: string) => {
    // Uppercase and strip invalid characters
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
    setDlNumber(cleaned);
  };

  const handlePickFile = async () => {
    try {
      const file = await pickDriverLicense();
      if (file) setSelectedFile(file);
    } catch (err) {
      Alert.alert('Licence file unavailable', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const handleContinue = async () => {
    if (!token || isSaving || !isValid) return;
    setIsSaving(true);
    try {
      const expiry = new Date(`${expiryDate}T23:59:59.999Z`);
      await driverApi.saveProfile(token, { dlNumber: dlNumber.trim(), dlExpiry: expiryDate });
      await driverApi.createApplication(token);
      if (selectedFile || !savedLicence?.expiresAt || savedLicence.expiresAt.slice(0, 10) !== expiryDate) {
        await driverApi.uploadLicenseFile(token, {
          ...(selectedFile ? { fileDataUrl: selectedFile.dataUrl } : {}),
          dlNumber: dlNumber.trim(),
          expiresAt: expiry.toISOString(),
        });
      }
      setIsUploaded(true);
      setSelectedFile(null);
      onUpdate({ dlNumber: dlNumber.trim(), dlExpiry: expiryDate, dlUploaded: true });
      await refreshProfile();
      onNext();
    } catch (err) {
      Alert.alert('Could not save licence', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const savedNumberMatches = isUploaded && draft.dlNumber.trim() === dlNumber.trim();
  const savedLicence = documents.find((document) => document.type === 'DRIVING_LICENSE');
  const expiry = /^\d{4}-\d{2}-\d{2}$/.test(expiryDate) ? new Date(`${expiryDate}T23:59:59.999Z`) : new Date(NaN);
  const expiryValid = !Number.isNaN(expiry.getTime()) && expiry.toISOString().slice(0, 10) === expiryDate && expiry > new Date();
  const isValid = dlNumber.trim().length >= 8 && expiryValid && (selectedFile !== null || (savedNumberMatches && !!savedLicence));

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 24) + 20,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        
        {/* Top Header Bar */}
        <View style={styles.topBar}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={20} color="#2C1810" />
          </Pressable>

          <View style={styles.stepBadge}>
            <View style={styles.stepDot} />
            <Text style={styles.stepBadgeText}>Step 4 of 6</Text>
          </View>
        </View>

        {/* 6-Step Segmented Progress Bar */}
        <View style={styles.progressContainer}>
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <View
              key={s}
              style={[
                styles.progressSegment,
                s <= 4 ? styles.progressSegmentActive : styles.progressSegmentInactive,
              ]}
            />
          ))}
        </View>

        {/* Headline & Subhead */}
        <View style={styles.titleSection}>
          <Text style={styles.heading}>Driving licence</Text>
          <Text style={styles.subheading}>
            Upload your valid commercial or transport category Indian driving licence.
          </Text>
        </View>

        {/* Upload Box Card */}
        <Pressable
          style={({ pressed }) => [
            styles.uploadBox,
            (selectedFile || isUploaded) && styles.uploadBoxDone,
            pressed && styles.btnPressed,
          ]}
          onPress={() => void handlePickFile()}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel="Select driving licence PDF or JPEG">
          {selectedFile || isUploaded ? (
            <View style={styles.uploadedState}>
              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={26} color="#166534" />
              </View>
              <Text style={styles.uploadedTitle}>{selectedFile?.name || 'Licence saved'}</Text>
              <Text style={styles.uploadedSub}>
                {selectedFile ? 'Selected. Continue to upload securely.' :
                  savedNumberMatches ? 'Tap to replace document' : 'Select a file for this licence number'}
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.uploadPlusCircle}>
                <Ionicons name="add" size={28} color="#705746" />
              </View>
              <Text style={styles.uploadTitle}>Select driving licence</Text>
              <Text style={styles.uploadSub}>PDF, JPG or JPEG · up to 500 KB</Text>
            </View>
          )}
        </Pressable>

        {/* Licence Number Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Licence number *</Text>
          <View style={[styles.inputWrapper, isFocused && styles.inputWrapperFocused]}>
            <Ionicons name="card-outline" size={20} color="#8C7B68" style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, styles.dlInput]}
              placeholder="e.g. WB7420220012345"
              placeholderTextColor="#B3A48C"
              value={dlNumber}
              onChangeText={handleDlChange}
              autoCapitalize="characters"
              maxLength={16}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
          </View>
          <Text style={styles.helperText}>
            Enter without spaces or hyphens as printed on your Smart Card DL.
          </Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Licence expiry date *</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="calendar-outline" size={20} color="#8C7B68" style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#B3A48C"
              value={expiryDate}
              onChangeText={setExpiryDate}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              accessibilityLabel="Driving licence expiry date"
            />
          </View>
          <Text style={styles.helperText}>Enter the expiry date printed on your licence.</Text>
        </View>

        <View style={styles.tipsBox}>
          <View style={styles.tipsHeaderRow}>
            <Ionicons name="information-circle" size={18} color="#8C5A20" />
            <Text style={styles.tipsTitle}>Document guidelines:</Text>
          </View>
          <Text style={styles.tipItem}>PDF, JPG or JPEG only; maximum 500 KB.</Text>
          <Text style={styles.tipItem}>• All 4 corners of the licence must be visible.</Text>
          <Text style={styles.tipItem}>• Avoid camera flash reflections or dark shadows.</Text>
          <Text style={styles.tipItem}>• Must be valid and not expired.</Text>
        </View>

        <CandyButton
          title="Continue"
          onPress={handleContinue}
          disabled={!isValid}
          loading={isSaving}
          variant={isValid ? 'primary' : 'muted'}
          icon={
            <Ionicons
              name="arrow-forward"
              size={18}
              color={isValid ? '#5A3416' : '#B3A48C'}
              style={{ marginLeft: 2 }}
            />
          }
          style={styles.actionBtn}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFDF7',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ECE0CE',
    shadowColor: '#3D2314',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  stepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D97706',
    marginRight: 6,
  },
  stepBadgeText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#92400E',
  },
  progressContainer: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 22,
  },
  progressSegment: {
    flex: 1,
    height: 5,
    borderRadius: 3,
  },
  progressSegmentActive: {
    backgroundColor: '#3D2314',
  },
  progressSegmentInactive: {
    backgroundColor: '#EADBCA',
  },
  titleSection: {
    marginBottom: 20,
  },
  heading: {
    fontSize: 27,
    fontWeight: '900',
    color: '#2C1810',
    letterSpacing: -0.6,
    lineHeight: 33,
    marginBottom: 6,
  },
  subheading: {
    fontSize: 14,
    lineHeight: 20,
    color: '#705746',
    fontWeight: '500',
  },
  uploadBox: {
    backgroundColor: '#FFFDF9',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#D4C5B0',
    borderStyle: 'dashed',
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  uploadBoxDone: {
    borderColor: '#16A34A',
    borderStyle: 'solid',
    backgroundColor: '#F0FDF4',
  },
  emptyState: {
    alignItems: 'center',
  },
  uploadPlusCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F5EFE6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2C1810',
    marginBottom: 6,
  },
  uploadSub: {
    fontSize: 13,
    color: '#8C7B68',
    fontWeight: '500',
  },
  uploadedState: {
    alignItems: 'center',
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  uploadedTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#14532D',
    marginBottom: 6,
  },
  uploadedSub: {
    fontSize: 13,
    color: '#15803D',
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#3D2314',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDF9',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#ECE0CE',
    paddingHorizontal: 14,
    height: 52,
  },
  inputWrapperFocused: {
    borderColor: '#8C4A1B',
    backgroundColor: '#FFFFFF',
    shadowColor: '#8C4A1B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#2C1810',
    paddingVertical: 0,
  },
  dlInput: {
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  helperText: {
    fontSize: 11.5,
    color: '#8C7B68',
    marginTop: 8,
    fontWeight: '500',
  },
  tipsBox: {
    backgroundColor: '#FFFDF4',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    marginBottom: 24,
    gap: 6,
  },
  tipsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  tipsTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#8C5A20',
    marginLeft: 6,
  },
  tipItem: {
    fontSize: 12.5,
    color: '#92400E',
    lineHeight: 18,
    fontWeight: '500',
  },
  actionBtn: {
    marginTop: 8,
  },
});
