import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DOCUMENT_TYPES, type DocumentType } from '@cabzone/contracts';
import {
  OnboardingFormScroll,
  type OnboardingFormScrollHandle,
} from '@/components/kyc/onboarding-form-scroll';
import { useAuth } from '@/context/auth-context';
import { driverApi } from '@/services/api';
import { pickDriverLicense, type SelectedDriverLicense } from '@/services/driver-license';
import { formatDateInput, toDisplayDate, validateFutureExpiryDate } from '@/services/profile';
import { colors, typography, createStyles } from '@/design-system';

const DOC_LABELS: Record<DocumentType, string> = {
  GOVERNMENT_ID: 'Government Identity Proof (Aadhaar / PAN / Voter ID)',
  DRIVING_LICENSE: 'Commercial Driving Licence',
  REGISTRATION_CERTIFICATE: 'Vehicle Registration Certificate (RC)',
  INSURANCE: 'Vehicle Commercial Insurance',
  PERMIT: 'Commercial Route / Fitness Permit',
};

export default function DriverDocumentsScreen() {
  const router = useRouter();
  const { token, driver, application, documents, compliance, refreshProfile } = useAuth();
  const formScrollRef = useRef<OnboardingFormScrollHandle>(null);
  const dlInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const expiryInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const dlBoxRef = useRef<React.ComponentRef<typeof View>>(null);
  const expiryBoxRef = useRef<React.ComponentRef<typeof View>>(null);
  const editorBoxRef = useRef<React.ComponentRef<typeof View>>(null);

  const [editingType, setEditingType] = useState<DocumentType | null>(null);
  const [selectedFile, setSelectedFile] = useState<SelectedDriverLicense | null>(null);
  const [expiryInput, setExpiryInput] = useState('');
  const [dlNumberInput, setDlNumberInput] = useState('');
  const [focusedField, setFocusedField] = useState<'dl' | 'expiry' | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const isUnderReview = Boolean(
    application &&
      ['SUBMITTED', 'UNDER_REVIEW_AUTO', 'UNDER_REVIEW_ADMIN'].includes(application.status),
  );
  const isRenewalDraft = Boolean(
    application && ['DRAFT', 'REAPPLIED'].includes(application.status),
  );
  const hasStagedPendingDoc = Boolean(
    application &&
      isRenewalDraft &&
      documents.some(
        (d) => d.applicationId === application.id && d.verificationStatus === 'PENDING',
      ),
  );
  const canEditDocuments =
    !isUnderReview &&
    driver?.status !== 'SUSPENDED' &&
    driver?.status !== 'REJECTED' &&
    application?.rejectionType !== 'HARD_FRAUD';

  const openEditor = (type: DocumentType) => {
    Keyboard.dismiss();
    setEditingType(type);
    setSelectedFile(null);
    setExpiryInput('');
    setDlNumberInput(driver?.dlNumber?.trim().toUpperCase() ?? '');
    setActionError(null);
    setActionSuccess(null);
    setTimeout(() => {
      formScrollRef.current?.focusTarget(editorBoxRef.current);
    }, 80);
  };

  const handlePickFile = async (type: DocumentType) => {
    Keyboard.dismiss();
    setActionError(null);
    try {
      const picked = await pickDriverLicense(DOC_LABELS[type]);
      if (picked) {
        setSelectedFile(picked);
        setTimeout(() => {
          if (type === 'DRIVING_LICENSE' && dlNumberInput.trim().length < 8) {
            dlInputRef.current?.focus();
          } else if (type !== 'GOVERNMENT_ID' && !validateFutureExpiryDate(expiryInput).valid) {
            expiryInputRef.current?.focus();
          }
        }, 180);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not select document file.');
    }
  };

  const handleUploadReplacement = async (type: DocumentType) => {
    if (!token) return;
    Keyboard.dismiss();
    if (!selectedFile) {
      setActionError('Select a PDF, JPG, or PNG file (max 500 KB) first.');
      return;
    }

    let isoTimestamp: string | undefined;
    if (type !== 'GOVERNMENT_ID') {
      const check = validateFutureExpiryDate(expiryInput);
      if (!check.valid || !check.isoTimestamp) {
        setActionError(check.error || 'Enter a valid future expiry date (DD/MM/YYYY).');
        return;
      }
      isoTimestamp = check.isoTimestamp;
    }

    const cleanedDl = dlNumberInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (type === 'DRIVING_LICENSE' && !/^[A-Z0-9]{8,16}$/.test(cleanedDl)) {
      setActionError('Enter a valid 8-16 character driving licence number.');
      return;
    }

    setIsUploading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      if (!isRenewalDraft) {
        await driverApi.renewApplication(token);
      }

      if (type === 'DRIVING_LICENSE') {
        await driverApi.uploadLicenseFile(token, {
          fileDataUrl: selectedFile.dataUrl,
          dlNumber: cleanedDl,
          expiresAt: isoTimestamp!,
        });
      } else if (type === 'GOVERNMENT_ID') {
        await driverApi.uploadIdentityDocumentFile(token, selectedFile.dataUrl);
      } else {
        await driverApi.uploadVehicleDocumentFile(token, {
          type,
          fileDataUrl: selectedFile.dataUrl,
          expiresAt: isoTimestamp!,
        });
      }

      await refreshProfile();
      setEditingType(null);
      setSelectedFile(null);
      setExpiryInput('');
      setActionSuccess(
        `${DOC_LABELS[type]} uploaded to your renewal draft. Submit below when ready for admin verification.`,
      );
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to upload document.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmitRenewal = async () => {
    if (!token) return;
    Keyboard.dismiss();
    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await driverApi.submitApplication(token);
      await refreshProfile();
      setActionSuccess(
        'Renewal submitted for admin review. Still-valid verified documents keep you eligible to drive while your update is reviewed.',
      );
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not submit renewal application.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const overallStatus = compliance?.overallStatus ?? (driver?.kycStatus === 'EXPIRED' ? 'EXPIRED' : 'COMPLIANT');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.backBtn}
          onPress={() => {
            Keyboard.dismiss();
            router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel="Back to Account">
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
          <Text style={styles.backText}>Account</Text>
        </Pressable>
        <Text style={styles.topTitle}>Compliance Documents</Text>
        <View style={{ width: 60 }} />
      </View>

      <OnboardingFormScroll
        ref={formScrollRef}
        topPadding={20}
        baseBottomPadding={48}
        contentContainerStyle={styles.scrollContent}>
        <View
          style={[
            styles.summaryCard,
            overallStatus === 'EXPIRED'
              ? styles.summaryDanger
              : overallStatus === 'EXPIRING_SOON'
                ? styles.summaryWarning
                : null,
          ]}>
          <Text style={styles.summaryLabel}>COMPLIANCE & KYC STATUS</Text>
          <Text style={styles.summaryValue}>
            {overallStatus === 'EXPIRING_SOON'
              ? 'EXPIRING SOON'
              : overallStatus === 'EXPIRED'
                ? 'EXPIRED'
                : driver?.kycStatus || 'VERIFIED'}
          </Text>
          {driver?.dlNumber ? (
            <Text style={styles.summarySub}>Driving Licence: {driver.dlNumber}</Text>
          ) : null}
          <Text style={styles.summaryHint}>
            {overallStatus === 'EXPIRED'
              ? 'Upload renewals for expired documents below and submit for review to go back online.'
              : overallStatus === 'EXPIRING_SOON'
                ? 'Renew expiring documents up to 30 days early without interrupting active duty.'
                : 'Valid verified documents are automatically carried forward when you renew.'}
          </Text>
        </View>

        {isUnderReview ? (
          <View style={styles.infoBanner}>
            <Ionicons name="time-outline" size={20} color={colors.deepBrown} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoBannerTitle}>Renewal Under Admin Review</Text>
              <Text style={styles.infoBannerSub}>
                Your updated compliance package has been submitted. You will be notified as soon as verification completes.
              </Text>
            </View>
          </View>
        ) : null}

        {application?.status === 'REJECTED' && application.rejectionReason ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorBannerTitle}>Review Feedback</Text>
              <Text style={styles.errorBannerSub}>{application.rejectionReason}</Text>
            </View>
          </View>
        ) : null}

        {actionError ? (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Ionicons name="warning-outline" size={20} color={colors.error} />
            <Text style={[styles.errorBannerSub, { flex: 1 }]}>{actionError}</Text>
          </View>
        ) : null}

        {actionSuccess ? (
          <View style={styles.successBanner} accessibilityRole="alert">
            <Ionicons name="checkmark-circle-outline" size={20} color="#15803D" />
            <Text style={styles.successBannerText}>{actionSuccess}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mandatory Compliance Documents</Text>
          {DOCUMENT_TYPES.map((type, idx) => {
            const compItem = compliance?.items.find((i) => i.type === type);
            const matchingDocs = documents
              .filter((d) => d.type === type)
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            const latestDoc = matchingDocs[0];
            const stagedDraftDoc =
              isRenewalDraft && application
                ? matchingDocs.find(
                    (d) =>
                      d.applicationId === application.id && d.verificationStatus === 'PENDING',
                  )
                : undefined;

            const isExpired =
              compItem?.status === 'EXPIRED' ||
              (!compItem &&
                latestDoc &&
                (latestDoc.verificationStatus === 'EXPIRED' ||
                  Boolean(latestDoc.expiresAt && new Date(latestDoc.expiresAt) <= new Date())));
            const isExpiringSoon = compItem?.status === 'EXPIRING_SOON';
            const daysRemaining = compItem?.daysRemaining ?? null;
            const effectiveExpiry =
              stagedDraftDoc?.expiresAt ?? compItem?.expiresAt ?? latestDoc?.expiresAt ?? null;

            let badgeLabel: string = latestDoc?.verificationStatus ?? 'MISSING';
            let badgeStyle: { backgroundColor: string; borderColor: string } = styles.badgeAmber;
            let badgeTextColor: string = colors.brandBrown;

            if (stagedDraftDoc) {
              badgeLabel = 'RENEWAL READY';
              badgeStyle = styles.badgeAmber;
              badgeTextColor = colors.deepBrown;
            } else if (compItem?.hasPendingRenewal && isUnderReview) {
              badgeLabel = 'UNDER REVIEW';
              badgeStyle = styles.badgeAmber;
              badgeTextColor = colors.deepBrown;
            } else if (isExpired) {
              badgeLabel = 'EXPIRED';
              badgeStyle = styles.badgeRed;
              badgeTextColor = colors.error;
            } else if (isExpiringSoon && daysRemaining !== null) {
              badgeLabel = daysRemaining <= 1 ? '1d LEFT' : `${daysRemaining}d LEFT`;
              badgeStyle = compItem?.urgent ? styles.badgeRed : styles.badgeAmber;
              badgeTextColor = compItem?.urgent ? colors.error : colors.brandBrown;
            } else if (compItem?.status === 'VALID' || latestDoc?.verificationStatus === 'VERIFIED') {
              badgeLabel = 'VERIFIED';
              badgeStyle = styles.badgeGreen;
              badgeTextColor = '#15803D';
            }

            const isEditing = editingType === type;

            return (
              <View key={type} style={[styles.docBlock, idx > 0 && styles.docBlockBorder]}>
                <View style={styles.docRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docName}>{DOC_LABELS[type]}</Text>
                    {latestDoc?.documentNumberMasked ? (
                      <Text style={styles.docMeta}>Ref: {latestDoc.documentNumberMasked}</Text>
                    ) : null}
                    <Text style={styles.docMeta}>
                      {effectiveExpiry
                        ? `${stagedDraftDoc ? 'New expiry' : 'Expires'}: ${toDisplayDate(effectiveExpiry)}`
                        : type === 'GOVERNMENT_ID'
                          ? 'No expiry required'
                          : 'Expiry required'}
                    </Text>
                  </View>

                  <View style={styles.docRight}>
                    <View style={[styles.badge, badgeStyle]}>
                      <Text style={[styles.badgeText, { color: badgeTextColor }]}>
                        {badgeLabel}
                      </Text>
                    </View>
                    {canEditDocuments ? (
                      <Pressable
                        style={styles.replaceTrigger}
                        hitSlop={6}
                        onPress={() => {
                          if (isEditing) {
                            Keyboard.dismiss();
                            setEditingType(null);
                          } else {
                            openEditor(type);
                          }
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${isEditing ? 'Cancel' : 'Renew or replace'} ${DOC_LABELS[type]}`}>
                        <Text style={styles.replaceTriggerText}>
                          {isEditing
                            ? 'Cancel'
                            : isExpired || isExpiringSoon || !latestDoc
                              ? 'Renew'
                              : 'Replace'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {isEditing ? (
                  <View ref={editorBoxRef} collapsable={false} style={styles.editorBox}>
                    <Pressable
                      style={styles.filePickerBtn}
                      onPress={() => void handlePickFile(type)}
                      disabled={isUploading}
                      accessibilityRole="button"
                      accessibilityLabel="Choose replacement document file">
                      <Ionicons name="cloud-upload-outline" size={18} color={colors.deepBrown} />
                      <Text style={styles.filePickerText} numberOfLines={1}>
                        {selectedFile
                          ? `Selected: ${selectedFile.name}`
                          : 'Choose PDF, JPG, or PNG (max 500 KB)'}
                      </Text>
                    </Pressable>

                    {type === 'DRIVING_LICENSE' ? (
                      <View ref={dlBoxRef} collapsable={false} style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Driving Licence Number</Text>
                        <TextInput
                          ref={dlInputRef}
                          style={[styles.input, focusedField === 'dl' && styles.inputFocused]}
                          value={dlNumberInput}
                          onChangeText={(val) =>
                            setDlNumberInput(val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16))
                          }
                          onFocus={() => {
                            setFocusedField('dl');
                            formScrollRef.current?.focusTarget(dlBoxRef.current);
                          }}
                          onBlur={() => setFocusedField((prev) => (prev === 'dl' ? null : prev))}
                          placeholder="e.g. WB7420220012345"
                          placeholderTextColor={colors.secondary}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          blurOnSubmit={false}
                          returnKeyType="next"
                          onSubmitEditing={() => expiryInputRef.current?.focus()}
                          maxLength={16}
                          accessibilityLabel="Driving Licence Number"
                        />
                      </View>
                    ) : null}

                    {type !== 'GOVERNMENT_ID' ? (
                      <View ref={expiryBoxRef} collapsable={false} style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>New Expiry Date (DD/MM/YYYY)</Text>
                        <TextInput
                          ref={expiryInputRef}
                          style={[styles.input, focusedField === 'expiry' && styles.inputFocused]}
                          value={expiryInput}
                          onChangeText={(val) => setExpiryInput(formatDateInput(val))}
                          onFocus={() => {
                            setFocusedField('expiry');
                            formScrollRef.current?.focusTarget(expiryBoxRef.current);
                          }}
                          onBlur={() => setFocusedField((prev) => (prev === 'expiry' ? null : prev))}
                          placeholder="DD/MM/YYYY"
                          placeholderTextColor={colors.secondary}
                          keyboardType="number-pad"
                          returnKeyType="done"
                          onSubmitEditing={() => Keyboard.dismiss()}
                          maxLength={10}
                          accessibilityLabel="New Expiry Date"
                        />
                      </View>
                    ) : null}

                    <Pressable
                      style={[styles.uploadConfirmBtn, isUploading && styles.btnDisabled]}
                      disabled={isUploading}
                      onPress={() => void handleUploadReplacement(type)}
                      accessibilityRole="button"
                      accessibilityLabel="Save Document to Renewal">
                      {isUploading ? (
                        <ActivityIndicator size="small" color={colors.deepBrown} />
                      ) : (
                        <Text style={styles.uploadConfirmText}>Save Document to Renewal</Text>
                      )}
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {hasStagedPendingDoc && canEditDocuments ? (
          <View style={styles.submitCard}>
            <Text style={styles.submitTitle}>Ready to Submit Renewal?</Text>
            <Text style={styles.submitSub}>
              All other valid verified documents are carried forward automatically. Submit now so an administrator can verify your updated document(s).
            </Text>
            <Pressable
              style={[styles.submitBtn, isSubmitting && styles.btnDisabled]}
              disabled={isSubmitting}
              onPress={() => void handleSubmitRenewal()}
              accessibilityRole="button"
              accessibilityLabel="Submit Renewal for Verification">
              {isSubmitting ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.submitBtnText}>Submit Renewal for Verification →</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </OnboardingFormScroll>
    </SafeAreaView>
  );
}

const styles = createStyles(() => ({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: typography.sizes.sm, fontWeight: '700', color: colors.deepBrown },
  topTitle: { fontSize: typography.sizes.base, fontWeight: '800', color: colors.deepBrown },
  scrollContent: { gap: 16 },
  summaryCard: {
    backgroundColor: colors.cream,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  summaryDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  summaryWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: colors.amber,
  },
  summaryLabel: { fontSize: 10, fontWeight: '800', color: colors.brandBrown, letterSpacing: 0.6 },
  summaryValue: { fontSize: 22, fontWeight: '800', color: colors.deepBrown, marginVertical: 4 },
  summarySub: { fontSize: typography.sizes.xs, color: colors.deepBrown, fontWeight: '700' },
  summaryHint: {
    fontSize: 11,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoBannerTitle: { fontSize: typography.sizes.xs, fontWeight: '800', color: colors.deepBrown },
  infoBannerSub: { fontSize: 11, color: colors.secondary, marginTop: 2, lineHeight: 15 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorBannerTitle: { fontSize: typography.sizes.xs, fontWeight: '800', color: colors.error },
  errorBannerSub: { fontSize: 11, color: '#991B1B', marginTop: 1, lineHeight: 15 },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  successBannerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
    lineHeight: 15,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  cardTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
    marginBottom: 4,
  },
  docBlock: {
    paddingVertical: 10,
  },
  docBlockBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  docRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  docName: { fontSize: typography.sizes.xs, fontWeight: '800', color: colors.deepBrown },
  docMeta: { fontSize: 11, color: colors.secondary, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  badgeGreen: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  badgeAmber: { backgroundColor: colors.lightCream, borderColor: colors.border },
  badgeRed: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  badgeText: { fontSize: 10, fontWeight: '800' },
  replaceTrigger: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  replaceTriggerText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  editorBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.lightCream,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  filePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 46,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filePickerText: {
    flex: 1,
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondary,
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  inputFocused: {
    borderColor: colors.deepBrown,
  },
  uploadConfirmBtn: {
    backgroundColor: colors.amber,
    borderRadius: 10,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadConfirmText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  submitCard: {
    backgroundColor: colors.cream,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.amber,
    gap: 10,
  },
  submitTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  submitSub: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    lineHeight: 17,
  },
  submitBtn: {
    backgroundColor: colors.deepBrown,
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.white,
  },
  btnDisabled: {
    opacity: 0.6,
  },
}));
