import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { OnboardingDraft } from './types';

interface StepReviewProps {
  draft: OnboardingDraft;
  onEditStep: (stepNumber: number) => void;
  onSubmit: () => Promise<void>;
  onBack: () => void;
}

export function StepReview({
  draft,
  onEditStep,
  onSubmit,
  onBack,
}: StepReviewProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSubmit();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit application';
      setErrorMsg(msg);
      setIsSubmitting(false);
    }
  };

  const fullName = `${draft.firstName} ${draft.lastName}`.trim() || 'Driver Partner';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top row */}
        <View style={styles.topRow}>
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Final Step</Text>
          </View>
        </View>

        <Text style={styles.heading}>Review your information</Text>
        <Text style={styles.subheading}>
          Verify your personal and vehicle details before final submission.
        </Text>

        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
          </View>
        ) : null}

        {/* Section 1: Personal Info */}
        <View style={styles.reviewCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Personal Information</Text>
            <Pressable onPress={() => onEditStep(1)} hitSlop={8}>
              <Text style={styles.editLink}>Edit ›</Text>
            </Pressable>
          </View>
          <Text style={styles.infoPrimary}>{fullName}</Text>
          <Text style={styles.infoSecondary}>DOB: {draft.dateOfBirth || '15/05/1995'}</Text>
          <Text style={styles.infoSecondary}>
            Gender: {draft.gender === 'MALE' ? 'Male' : draft.gender === 'FEMALE' ? 'Female' : 'Other'}
          </Text>
          <Text style={styles.infoSecondary}>City: {draft.city}</Text>
        </View>

        {/* Section 2: Vehicle */}
        <View style={styles.reviewCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Vehicle</Text>
            <Pressable onPress={() => onEditStep(3)} hitSlop={8}>
              <Text style={styles.editLink}>Edit ›</Text>
            </Pressable>
          </View>
          <Text style={styles.infoPrimary}>
            {draft.vehicleType === 'CAB' ? '🚕 Cab / Car' : '🛺 E-Rickshaw'}
          </Text>
          <Text style={styles.infoReg}>{draft.registrationNumber || 'WB74AB1234'}</Text>
          <Text style={styles.infoSecondary}>
            Model: {draft.model} · {draft.color}
          </Text>
        </View>

        {/* Section 3: Documents Checklist */}
        <View style={styles.reviewCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Documents</Text>
            <Pressable onPress={() => onEditStep(4)} hitSlop={8}>
              <Text style={styles.editLink}>Edit ›</Text>
            </Pressable>
          </View>

          <View style={styles.docItem}>
            <Text style={styles.checkIcon}>{draft.dlUploaded && draft.dlExpiry ? '✓' : '!'}</Text>
            <Text style={styles.docName}>Driving licence ({draft.dlNumber}){draft.dlExpiry ? ` · expires ${draft.dlExpiry}` : ' — expiry missing'}</Text>
          </View>
          <View style={styles.docItem}>
            <Text style={styles.checkIcon}>{draft.govtIdUploaded ? '✓' : '!'}</Text>
            <Text style={styles.docName}>Government ID{draft.govtIdUploaded ? '' : ' — missing'}</Text>
          </View>
          <View style={styles.docItem}>
            <Text style={styles.checkIcon}>{draft.rcUploaded ? '✓' : '!'}</Text>
            <Text style={styles.docName}>Registration Certificate (RC){draft.rcUploaded ? '' : ' — missing'}</Text>
          </View>
          <View style={styles.docItem}>
            <Text style={styles.checkIcon}>{draft.insuranceUploaded ? '✓' : '!'}</Text>
            <Text style={styles.docName}>Vehicle insurance policy{draft.insuranceUploaded ? '' : ' — missing'}</Text>
          </View>
          <View style={styles.docItem}>
            <Text style={styles.checkIcon}>{draft.permitUploaded ? '✓' : '!'}</Text>
            <Text style={styles.docName}>Commercial permit{draft.permitUploaded ? '' : ' — missing'}</Text>
          </View>
          <View style={styles.docItem}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.docName}>Driver profile selfie</Text>
          </View>
        </View>

        {/* Declaration */}
        <View style={styles.declarationBox}>
          <Text style={styles.declarationText}>
            By submitting, I confirm that all uploaded documents and information are accurate and belong to me.
          </Text>
        </View>

        {/* Submit Button */}
        <Pressable
          style={({ pressed }) => [
            styles.submitBtn,
            isSubmitting && styles.btnDisabled,
            pressed && styles.btnPressed,
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}>
          {isSubmitting ? (
            <ActivityIndicator color="#C8FF00" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>Submit Application</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
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
  badge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
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
  errorBanner: {
    backgroundColor: '#FEE2E2',
    padding: 14,
    borderRadius: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
  },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#002451',
  },
  infoPrimary: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  infoReg: {
    fontSize: 16,
    fontWeight: '800',
    color: '#002451',
    letterSpacing: 1,
    marginBottom: 4,
  },
  infoSecondary: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  checkIcon: {
    fontSize: 14,
    fontWeight: '900',
    color: '#16A34A',
  },
  docName: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  declarationBox: {
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  declarationText: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 17,
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: '#002451',
    borderRadius: 18,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#002451',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 3,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  btnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  submitBtnText: {
    color: '#C8FF00',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
