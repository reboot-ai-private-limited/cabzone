import { colors, typography } from '@/design-system';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CabzonButton } from '@/components/buttons/cabzon-button';
import { useAuth } from '@/context/auth-context';
import { evaluateKycReviewState, mapSubmissionError } from '@/services/profile';
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
  const insets = useSafeAreaInsets();
  const { driver, vehicle, documents, application, refreshProfile } = useAuth();
  const [isReconciling, setIsReconciling] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<{
    message: string;
    targetStep?: number;
    targetStepLabel?: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    refreshProfile()
      .catch(() => {})
      .finally(() => {
        if (mounted) setIsReconciling(false);
      });
    return () => {
      mounted = false;
    };
  }, [refreshProfile]);

  const reviewState = evaluateKycReviewState({
    driver,
    vehicle,
    documents,
    draft,
  });

  const handleSubmit = async () => {
    if (isSubmitting || !reviewState.canSubmit) return;
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      await onSubmit();
    } catch (err: unknown) {
      setSubmissionError(mapSubmissionError(err));
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 24) + 20,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* Top row */}
        <View style={styles.topRow}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.backBtn, pressed && styles.btnPressed]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={20} color="#172B3A" />
          </Pressable>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Final Review</Text>
          </View>
        </View>

        <Text style={styles.heading}>Review your information</Text>
        <Text style={styles.subheading}>
          Verify your personal, operating city, vehicle, and document statuses before submitting.
        </Text>

        {isReconciling ? (
          <View style={styles.reconcileBanner}>
            <ActivityIndicator size="small" color="#12304A" />
            <Text style={styles.reconcileText}>Verifying saved documents with server…</Text>
          </View>
        ) : null}

        {application?.status === 'REJECTED' ? (
          <View style={styles.rejectedBanner} accessibilityRole="alert">
            <Text style={styles.rejectedTitle}>Application requires changes</Text>
            <Text style={styles.rejectedReason}>
              {application.rejectionReason ||
                'Please update any rejected or expired documents below and resubmit your application.'}
            </Text>
          </View>
        ) : null}

        {submissionError ? (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Text style={styles.errorText}>⚠️ {submissionError.message}</Text>
            {submissionError.targetStep ? (
              <Pressable
                style={styles.errorActionBtn}
                onPress={() => onEditStep(submissionError.targetStep!)}
                accessibilityRole="button"
                accessibilityLabel={submissionError.targetStepLabel || 'Go to step to fix issue'}>
                <Text style={styles.errorActionText}>
                  {submissionError.targetStepLabel || `Fix in Step ${submissionError.targetStep}`} →
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Section 1: Personal Info */}
        <View style={styles.reviewCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Personal Information</Text>
            <Pressable
              onPress={() => onEditStep(1)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Edit personal information in Step 1">
              <Text style={styles.editLink}>Edit Step 1 ›</Text>
            </Pressable>
          </View>
          <Text style={[styles.infoPrimary, !reviewState.fullName && styles.missingValue]}>
            {reviewState.fullName || 'Name missing — edit Step 1'}
          </Text>
          <Text style={[styles.infoSecondary, !reviewState.dobDisplay && styles.missingValue]}>
            DOB: {reviewState.dobDisplay || 'Missing or invalid — edit Step 1'}
          </Text>
          <Text style={[styles.infoSecondary, !reviewState.genderDisplay && styles.missingValue]}>
            Gender: {reviewState.genderDisplay || 'Missing — edit Step 1'}
          </Text>
        </View>

        {/* Section 2: Operating City */}
        <View style={styles.reviewCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Operating City</Text>
            <Pressable
              onPress={() => onEditStep(2)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Edit operating city in Step 2">
              <Text style={styles.editLink}>Edit Step 2 ›</Text>
            </Pressable>
          </View>
          <Text style={[styles.infoPrimary, !reviewState.cityDisplay && styles.missingValue]}>
            {reviewState.cityDisplay || 'Operating city missing — edit Step 2'}
          </Text>
          {draft.isCustomCity && reviewState.cityDisplay ? (
            <Text style={styles.infoSecondary}>Requested area (subject to regional launch)</Text>
          ) : null}
        </View>

        {/* Section 3: Vehicle */}
        <View style={styles.reviewCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Vehicle</Text>
            <Pressable
              onPress={() => onEditStep(3)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Edit vehicle details in Step 3">
              <Text style={styles.editLink}>Edit Step 3 ›</Text>
            </Pressable>
          </View>
          <Text style={styles.infoPrimary}>🚕 {reviewState.vehicleTypeDisplay}</Text>
          <Text style={[styles.infoReg, !reviewState.registrationNumber && styles.missingValue]}>
            {reviewState.registrationNumber || 'Registration number missing — edit Step 3'}
          </Text>
          <Text
            style={[
              styles.infoSecondary,
              (!reviewState.make || !reviewState.model || !reviewState.color) && styles.missingValue,
            ]}>
            {reviewState.make && reviewState.model && reviewState.color
              ? `${reviewState.make} · ${reviewState.model} · ${reviewState.color}${
                  reviewState.manufactureYear ? ` (${reviewState.manufactureYear})` : ''
                }`
              : 'Make, model, or colour missing — edit Step 3'}
          </Text>
        </View>

        {/* Section 4: Authoritative Documents & Photo Checklist */}
        <View style={styles.reviewCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Verification Checklist</Text>
          </View>

          {reviewState.documentItems.map((item) => {
            const isReady = item.status === 'READY';
            const isExpired = item.status === 'EXPIRED';

            return (
              <View key={item.type} style={styles.docRow}>
                <View
                  style={[
                    styles.docStatusDot,
                    isReady
                      ? styles.docStatusReady
                      : isExpired
                        ? styles.docStatusExpired
                        : styles.docStatusMissing,
                  ]}>
                  <Text
                    style={[
                      styles.docStatusSymbol,
                      isReady
                        ? styles.docStatusSymbolReady
                        : isExpired
                          ? styles.docStatusSymbolExpired
                          : styles.docStatusSymbolMissing,
                    ]}>
                    {isReady ? '✓' : '!'}
                  </Text>
                </View>

                <View style={styles.docTextCol}>
                  <Text style={styles.docName}>{item.label}</Text>
                  <Text
                    style={[
                      styles.docDetail,
                      !isReady && (isExpired ? styles.expiredValue : styles.missingValue),
                    ]}>
                    {item.detail}
                  </Text>
                </View>

                <Pressable
                  onPress={() => onEditStep(item.stepNumber)}
                  hitSlop={8}
                  style={styles.docEditPill}
                  accessibilityRole="button"
                  accessibilityLabel={`${isReady ? 'Edit' : 'Fix'} ${item.label} in Step ${item.stepNumber}`}>
                  <Text style={[styles.docEditPillText, !isReady && styles.docEditPillTextUrgent]}>
                    {isReady ? `Step ${item.stepNumber}` : `Fix Step ${item.stepNumber} ›`}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        {!reviewState.canSubmit ? (
          <View style={styles.blockingCard} accessibilityRole="alert">
            <Text style={styles.blockingTitle}>Complete before submitting:</Text>
            {reviewState.blockingReasons.map((reason) => (
              <Text key={reason} style={styles.blockingItem}>
                • {reason}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Declaration */}
        <View style={styles.declarationBox}>
          <Text style={styles.declarationText}>
            By submitting, I confirm that all uploaded documents and information are accurate and
            belong to me.
          </Text>
        </View>

        {/* Submit Button */}
        <CabzonButton
          title="Submit application"
          onPress={() => void handleSubmit()}
          disabled={!reviewState.canSubmit || isReconciling}
          loading={isSubmitting}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ECE0CE',
  },
  badge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgeText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#065F46',
  },
  heading: {
    fontSize: typography.sizes.xxl,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
    letterSpacing: -0.6,
    lineHeight: 33,
  },
  subheading: {
    fontSize: typography.sizes.label,
    color: colors.secondary,
    lineHeight: 20,
    marginBottom: 20,
    fontWeight: '500',
  },
  reconcileBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 16,
  },
  reconcileText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#92400E',
  },
  rejectedBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.2,
    borderColor: '#FECACA',
    marginBottom: 16,
  },
  rejectedTitle: {
    fontSize: typography.sizes.label,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 4,
  },
  rejectedReason: {
    fontSize: typography.sizes.sm,
    color: '#B91C1C',
    lineHeight: 18,
    fontWeight: '500',
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    padding: 14,
    borderRadius: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    gap: 10,
  },
  errorText: {
    color: '#991B1B',
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    lineHeight: 18,
  },
  errorActionBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#991B1B',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  errorActionText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#ECE0CE',
    marginBottom: 14,
    shadowColor: '#3D2314',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
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
    borderBottomColor: '#F3EDE4',
  },
  cardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editLink: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.darkNavy,
  },
  infoPrimary: {
    fontSize: 16.5,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  infoReg: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.darkNavy,
    letterSpacing: 1,
    marginBottom: 4,
  },
  infoSecondary: {
    fontSize: 13.5,
    color: colors.secondary,
    lineHeight: 19,
    fontWeight: '500',
  },
  missingValue: {
    color: '#DC2626',
    fontWeight: '700',
  },
  expiredValue: {
    color: '#B45309',
    fontWeight: '700',
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F3EC',
    gap: 10,
  },
  docStatusDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docStatusReady: {
    backgroundColor: '#DCFCE7',
  },
  docStatusExpired: {
    backgroundColor: '#FEF3C7',
  },
  docStatusMissing: {
    backgroundColor: '#FEE2E2',
  },
  docStatusSymbol: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
  },
  docStatusSymbolReady: {
    color: '#15803D',
  },
  docStatusSymbolExpired: {
    color: '#B45309',
  },
  docStatusSymbolMissing: {
    color: '#DC2626',
  },
  docTextCol: {
    flex: 1,
  },
  docName: {
    fontSize: typography.sizes.label,
    color: colors.text,
    fontWeight: '700',
  },
  docDetail: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    marginTop: 2,
    fontWeight: '500',
  },
  docEditPill: {
    backgroundColor: colors.lightBlue,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  docEditPillText: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.secondary,
  },
  docEditPillTextUrgent: {
    color: '#991B1B',
    fontWeight: '800',
  },
  blockingCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 16,
    gap: 4,
  },
  blockingTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 2,
  },
  blockingItem: {
    fontSize: 12.5,
    color: '#B91C1C',
    fontWeight: '600',
    lineHeight: 18,
  },
  declarationBox: {
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  declarationText: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    lineHeight: 17,
    textAlign: 'center',
  },
  btnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
});
