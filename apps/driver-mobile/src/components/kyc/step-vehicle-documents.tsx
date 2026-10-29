import { colors, typography } from '@/design-system';
import React, { useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
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
import {
  formatDateInput,
  getServerDocumentStatus,
  validateFutureExpiryDate,
} from '@/services/profile';
import {
  OnboardingFormScroll,
  type OnboardingFormScrollHandle,
} from './onboarding-form-scroll';
import type { OnboardingDraft } from './types';

type VehicleDocumentType = 'GOVERNMENT_ID' | 'REGISTRATION_CERTIFICATE' | 'INSURANCE' | 'PERMIT';
type UploadItemState = 'IDLE' | 'QUEUED' | 'UPLOADING' | 'SAVED' | 'FAILED';

interface DocConfig {
  type: VehicleDocumentType;
  title: string;
  subtitle: string;
  draftKey: 'govtIdUploaded' | 'rcUploaded' | 'insuranceUploaded' | 'permitUploaded';
  icon: keyof typeof Ionicons.glyphMap;
  requiresExpiry: boolean;
}

const DOCUMENTS: DocConfig[] = [
  {
    type: 'GOVERNMENT_ID',
    title: 'Government ID',
    subtitle: 'Aadhaar, voter ID, or passport',
    draftKey: 'govtIdUploaded',
    icon: 'id-card-outline',
    requiresExpiry: false,
  },
  {
    type: 'REGISTRATION_CERTIFICATE',
    title: 'Registration Certificate (RC)',
    subtitle: 'RC Smart Card or Paper Registration',
    draftKey: 'rcUploaded',
    icon: 'car-sport-outline',
    requiresExpiry: true,
  },
  {
    type: 'INSURANCE',
    title: 'Vehicle Insurance',
    subtitle: 'Comprehensive or Commercial Third-Party',
    draftKey: 'insuranceUploaded',
    icon: 'shield-checkmark-outline',
    requiresExpiry: true,
  },
  {
    type: 'PERMIT',
    title: 'Commercial Permit',
    subtitle: 'Route Permit or Tourist Vehicle Authorization',
    draftKey: 'permitUploaded',
    icon: 'ribbon-outline',
    requiresExpiry: true,
  },
];

interface StepVehicleDocumentsProps {
  draft: OnboardingDraft;
  onUpdate: (partial: Partial<OnboardingDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepVehicleDocuments({
  onUpdate,
  onNext,
  onBack,
}: StepVehicleDocumentsProps) {
  const insets = useSafeAreaInsets();
  const { token, documents, refreshProfile } = useAuth();
  const formScrollRef = useRef<OnboardingFormScrollHandle>(null);
  const expiryInputRefs = useRef<
    Partial<Record<VehicleDocumentType, React.ComponentRef<typeof TextInput> | null>>
  >({});
  const expiryBoxRefs = useRef<
    Partial<Record<VehicleDocumentType, React.ComponentRef<typeof View> | null>>
  >({});

  const [selected, setSelected] = useState<Partial<Record<VehicleDocumentType, SelectedDriverLicense>>>({});
  const [expiries, setExpiries] = useState<Partial<Record<VehicleDocumentType, string>>>({});
  const [focusedExpiryType, setFocusedExpiryType] = useState<VehicleDocumentType | null>(null);
  const [uploadedThisSession, setUploadedThisSession] = useState<VehicleDocumentType[]>([]);
  const [uploadStates, setUploadStates] = useState<Partial<Record<VehicleDocumentType, UploadItemState>>>({});
  const [uploadErrors, setUploadErrors] = useState<Partial<Record<VehicleDocumentType, string>>>({});
  const [isSaving, setIsSaving] = useState(false);

  const getDocServerStatus = (type: VehicleDocumentType) => {
    if (uploadedThisSession.includes(type)) {
      return { status: 'READY' as const, expiresAtDisplay: expiries[type] };
    }
    return getServerDocumentStatus(documents, type);
  };

  const hasCurrentDocument = (type: VehicleDocumentType) =>
    getDocServerStatus(type).status === 'READY';

  const handlePick = async (type: VehicleDocumentType, title: string, requiresExpiry: boolean) => {
    Keyboard.dismiss();
    try {
      const file = await pickDriverLicense(title);
      if (file) {
        setSelected((prev) => ({ ...prev, [type]: file }));
        setUploadStates((prev) => ({ ...prev, [type]: 'IDLE' }));
        setUploadErrors((prev) => ({ ...prev, [type]: undefined }));
        if (requiresExpiry && !validateFutureExpiryDate(expiries[type] ?? '').valid) {
          setTimeout(() => {
            expiryInputRefs.current[type]?.focus();
            formScrollRef.current?.focusTarget(expiryBoxRefs.current[type] ?? null);
          }, 180);
        }
      }
    } catch (error) {
      Alert.alert(
        'Document Selection',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  const handleRemoveSelected = (type: VehicleDocumentType) => {
    Keyboard.dismiss();
    setSelected((prev) => ({ ...prev, [type]: undefined }));
    setUploadStates((prev) => ({ ...prev, [type]: 'IDLE' }));
    setUploadErrors((prev) => ({ ...prev, [type]: undefined }));
  };

  const handleExpiryTextChange = (type: VehicleDocumentType, text: string) => {
    const formatted = formatDateInput(text);
    setExpiries((prev) => ({ ...prev, [type]: formatted }));
    setUploadErrors((prev) => ({ ...prev, [type]: undefined }));
  };

  // Pre-flight validation for each document before any upload is attempted
  const isDocumentReadyForContinue = (doc: DocConfig): boolean => {
    const file = selected[doc.type];
    if (file) {
      if (!doc.requiresExpiry) return true;
      return validateFutureExpiryDate(expiries[doc.type] ?? '').valid;
    }
    return hasCurrentDocument(doc.type);
  };

  const canContinue = DOCUMENTS.every(isDocumentReadyForContinue);

  const nextMissingPrompt = (() => {
    for (const doc of DOCUMENTS) {
      const file = selected[doc.type];
      if (file) {
        if (doc.requiresExpiry) {
          const check = validateFutureExpiryDate(expiries[doc.type] ?? '');
          if (!check.valid) {
            return `• Enter a valid future expiry date for ${doc.title} (DD/MM/YYYY)`;
          }
        }
        continue;
      }
      if (!hasCurrentDocument(doc.type)) {
        return `• Upload your ${doc.title} to continue`;
      }
    }
    return null;
  })();

  const handleContinue = async () => {
    if (!token || isSaving) return;
    Keyboard.dismiss();

    // 1. Validate ALL pending uploads up front before sending any network request (F04)
    const pendingItems: {
      doc: DocConfig;
      file: SelectedDriverLicense;
      isoTimestamp?: string;
    }[] = [];
    const nextErrors: Partial<Record<VehicleDocumentType, string>> = {};

    for (const doc of DOCUMENTS) {
      const file = selected[doc.type];
      if (!file) {
        if (!hasCurrentDocument(doc.type)) {
          nextErrors[doc.type] = `Please select your ${doc.title}.`;
        }
        continue;
      }

      if (doc.requiresExpiry) {
        const expiryCheck = validateFutureExpiryDate(expiries[doc.type] ?? '');
        if (!expiryCheck.valid || !expiryCheck.isoTimestamp) {
          nextErrors[doc.type] =
            expiryCheck.error || `Enter a valid future expiry date for ${doc.title}.`;
          continue;
        }
        pendingItems.push({ doc, file, isoTimestamp: expiryCheck.isoTimestamp });
      } else {
        pendingItems.push({ doc, file });
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setUploadErrors(nextErrors);
      const firstMessage = Object.values(nextErrors)[0];
      if (firstMessage) {
        Alert.alert('Check Document Details', firstMessage);
      }
      return;
    }

    // If all 4 documents are already saved on the server and no replacements are selected
    if (pendingItems.length === 0 && canContinue) {
      onNext();
      return;
    }

    setIsSaving(true);
    setUploadErrors({});
    setUploadStates((prev) => {
      const queued = { ...prev };
      for (const item of pendingItems) {
        queued[item.doc.type] = 'QUEUED';
      }
      return queued;
    });

    let activeType: VehicleDocumentType | null = null;
    try {
      await driverApi.createApplication(token);

      for (const { doc, file, isoTimestamp } of pendingItems) {
        activeType = doc.type;
        setUploadStates((prev) => ({ ...prev, [doc.type]: 'UPLOADING' }));

        if (doc.type === 'GOVERNMENT_ID') {
          await driverApi.uploadIdentityDocumentFile(token, file.dataUrl);
        } else {
          await driverApi.uploadVehicleDocumentFile(token, {
            type: doc.type,
            fileDataUrl: file.dataUrl,
            expiresAt: isoTimestamp!,
          });
        }

        setUploadedThisSession((prev) =>
          prev.includes(doc.type) ? prev : [...prev, doc.type],
        );
        setUploadStates((prev) => ({ ...prev, [doc.type]: 'SAVED' }));
        onUpdate({ [doc.draftKey]: true });
        setSelected((prev) => ({ ...prev, [doc.type]: undefined }));
      }

      await refreshProfile();
      onNext();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Upload failed. Please try again.';
      if (activeType) {
        const failedType = activeType;
        setUploadStates((prev) => ({ ...prev, [failedType]: 'FAILED' }));
        setUploadErrors((prev) => ({ ...prev, [failedType]: msg }));
      }
      await refreshProfile().catch(() => {});
      Alert.alert('Upload Incomplete', msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OnboardingFormScroll
      ref={formScrollRef}
      topPadding={Math.max(insets.top, 16)}
      baseBottomPadding={Math.max(insets.bottom, 24) + 24}>
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            onBack();
          }}
          style={({ pressed }) => [styles.backBtn, pressed && styles.btnPressed]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={20} color="#172B3A" />
        </Pressable>

        <View style={styles.stepBadge}>
          <View style={styles.stepDot} />
          <Text style={styles.stepBadgeText}>Step 5 of 6</Text>
        </View>
      </View>

      {/* 6-Step Segmented Progress Bar */}
      <View style={styles.progressContainer}>
        {[1, 2, 3, 4, 5, 6].map((s) => (
          <View
            key={s}
            style={[
              styles.progressSegment,
              s <= 5 ? styles.progressSegmentActive : styles.progressSegmentInactive,
            ]}
          />
        ))}
      </View>

      {/* Headline & Subtitle */}
      <View style={styles.titleSection}>
        <Text style={styles.heading}>Identity & vehicle documents</Text>
        <Text style={styles.subheading}>
          Upload your ID and vehicle documents for compliance review.
        </Text>
      </View>

      {/* Document Cards List */}
      <View style={styles.docList}>
        {DOCUMENTS.map(({ type, title, subtitle, icon, requiresExpiry }) => {
          const serverDoc = getDocServerStatus(type);
          const saved = serverDoc.status === 'READY';
          const expiredOnServer = serverDoc.status === 'EXPIRED';
          const file = selected[type];
          const uploadState = uploadStates[type] ?? 'IDLE';
          const expiryValue = expiries[type] ?? (file ? '' : getDocServerStatus(type).expiresAtDisplay ?? '');
          const expiryCheck = requiresExpiry ? validateFutureExpiryDate(expiryValue) : { valid: true };
          const showInlineExpiryError =
            requiresExpiry &&
            Boolean(file) &&
            expiryValue.trim().length === 10 &&
            !expiryCheck.valid;
          const itemError =
            uploadErrors[type] || (showInlineExpiryError ? expiryCheck.error : undefined);

          const isReadyCard = (saved && !file) || (Boolean(file) && expiryCheck.valid);

          return (
            <View
              key={type}
              style={[
                styles.docCardContainer,
                isReadyCard && styles.docCardContainerDone,
                Boolean(itemError) && styles.docCardContainerError,
              ]}>
              {/* Header Row: Icon, Title, Status & Upload Button */}
              <Pressable
                style={styles.docHeaderRow}
                onPress={() => void handlePick(type, title, requiresExpiry)}
                disabled={isSaving}
                accessibilityRole="button"
                accessibilityLabel={`${file ? 'Change' : saved ? 'Replace' : 'Upload'} ${title}`}>
                <View
                  style={[
                    styles.docIconBox,
                    saved && !file && styles.docIconBoxDone,
                    expiredOnServer && !file && styles.docIconBoxExpired,
                  ]}>
                  <Ionicons
                    name={
                      saved && !file
                        ? 'checkmark-circle'
                        : expiredOnServer && !file
                          ? 'warning-outline'
                          : icon
                    }
                    size={22}
                    color={
                      saved && !file
                        ? '#15803D'
                        : expiredOnServer && !file
                          ? '#DC2626'
                          : colors.darkNavy
                    }
                  />
                </View>

                <View style={styles.docInfo}>
                  <View style={styles.docTitleRow}>
                    <Text style={styles.docTitle}>{title}</Text>
                    <Text style={styles.requiredStar}>*</Text>
                  </View>
                  <Text style={styles.docSubtitle}>{subtitle}</Text>

                  {uploadState === 'UPLOADING' && (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>Uploading…</Text>
                    </View>
                  )}
                  {uploadState === 'QUEUED' && (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>Queued for upload</Text>
                    </View>
                  )}
                  {saved && !file && uploadState !== 'UPLOADING' && (
                    <View style={styles.savedBadge}>
                      <Ionicons
                        name="checkmark"
                        size={12}
                        color="#15803D"
                        style={{ marginRight: 3 }}
                      />
                      <Text style={styles.savedBadgeText}>
                        Saved for review
                        {requiresExpiry && serverDoc.expiresAtDisplay
                          ? ` · Expires ${serverDoc.expiresAtDisplay}`
                          : ''}
                      </Text>
                    </View>
                  )}
                  {expiredOnServer && !file && (
                    <View style={styles.expiredBadge}>
                      <Text style={styles.expiredBadgeText}>
                        Expired
                        {serverDoc.expiresAtDisplay ? ` (${serverDoc.expiresAtDisplay})` : ''} ·
                        Upload current document
                      </Text>
                    </View>
                  )}
                </View>

                <View style={[styles.actionPill, saved && !file && styles.actionPillDone]}>
                  <Text
                    style={[styles.actionPillText, saved && !file && styles.actionPillTextDone]}>
                    {file ? 'Change' : saved ? 'Replace' : 'Upload'}
                  </Text>
                  <Ionicons
                    name={file || saved ? 'refresh-outline' : 'cloud-upload-outline'}
                    size={14}
                    color={saved && !file ? '#15803D' : colors.darkNavy}
                    style={{ marginLeft: 4 }}
                  />
                </View>
              </Pressable>

              {/* Selected File Details Banner — shown for ALL document types including GOVERNMENT_ID (F12) */}
              {file && (
                <View style={styles.fileSelectedBanner}>
                  <Ionicons name="document-attach" size={16} color="#12304A" />
                  <Text style={styles.fileNameText} numberOfLines={1}>
                    {file.name}
                  </Text>
                  <Pressable
                    onPress={() => handleRemoveSelected(type)}
                    disabled={isSaving}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove selected ${title} file`}>
                    <Ionicons name="close-circle" size={18} color="#DC2626" />
                  </Pressable>
                </View>
              )}

              {/* Expiry Date Section — ONLY for documents that require expiry (NOT GOVERNMENT_ID) (F12) */}
              {file && requiresExpiry && (
                <View style={styles.expirySection}>
                  <Text style={styles.expiryLabel}>Document expiry date *</Text>
                  <View
                    ref={(node) => {
                      expiryBoxRefs.current[type] = node;
                    }}
                    collapsable={false}>
                    <Pressable
                      onPress={() => expiryInputRefs.current[type]?.focus()}
                      style={[
                        styles.expiryInputWrapper,
                        focusedExpiryType === type && styles.expiryInputWrapperFocused,
                        Boolean(itemError) && styles.expiryInputWrapperError,
                      ]}>
                      <Ionicons
                        name="calendar-outline"
                        size={18}
                        color="#8C5A20"
                        style={{ marginRight: 8 }}
                      />
                      <TextInput
                        ref={(node) => {
                          expiryInputRefs.current[type] = node;
                        }}
                        style={styles.expiryTextInput}
                        placeholder="DD/MM/YYYY"
                        placeholderTextColor="#53616C"
                        value={expiryValue}
                        onChangeText={(text) => handleExpiryTextChange(type, text)}
                        onFocus={() => {
                          setFocusedExpiryType(type);
                          formScrollRef.current?.focusTarget(expiryBoxRefs.current[type] ?? null);
                        }}
                        onBlur={() =>
                          setFocusedExpiryType((prev) => (prev === type ? null : prev))
                        }
                        keyboardType="number-pad"
                        returnKeyType="done"
                        onSubmitEditing={() => Keyboard.dismiss()}
                        maxLength={10}
                        editable={!isSaving}
                        accessibilityLabel={`${title} expiry date in DD/MM/YYYY format`}
                      />
                      {expiryValue.length > 0 && !isSaving ? (
                        <Pressable
                          onPress={() => handleExpiryTextChange(type, '')}
                          hitSlop={10}
                          accessibilityRole="button"
                          accessibilityLabel={`Clear ${title} expiry date`}>
                          <Ionicons name="close-circle" size={18} color="#C4B5A5" />
                        </Pressable>
                      ) : null}
                    </Pressable>
                  </View>
                </View>
              )}

              {itemError ? (
                <Text style={styles.itemErrorText} accessibilityRole="alert">
                  {itemError}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Guidelines Security Card */}
      <View style={styles.guidelinesCard}>
        <View style={styles.guidelinesHeader}>
          <Ionicons
            name="shield-checkmark"
            size={18}
            color="#D97706"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.guidelinesTitle}>Verification Guidelines</Text>
        </View>
        <View style={styles.guidelineRow}>
          <Ionicons
            name="checkmark-circle"
            size={14}
            color="#15803D"
            style={{ marginRight: 6, marginTop: 2 }}
          />
          <Text style={styles.guidelineText}>
            Upload clear PDF, JPG, or JPEG files (max 500 KB).
          </Text>
        </View>
        <View style={styles.guidelineRow}>
          <Ionicons
            name="checkmark-circle"
            size={14}
            color="#15803D"
            style={{ marginRight: 6, marginTop: 2 }}
          />
          <Text style={styles.guidelineText}>
            Ensure all four corners are visible, uncropped, and free of glare.
          </Text>
        </View>
        <View style={styles.guidelineRow}>
          <Ionicons
            name="checkmark-circle"
            size={14}
            color="#15803D"
            style={{ marginRight: 6, marginTop: 2 }}
          />
          <Text style={styles.guidelineText}>
            Ensure the registration number on your RC matches the number you entered in Step 3.
          </Text>
        </View>
      </View>

      {/* Bottom CTA Button */}
      <View style={styles.ctaSection}>
        <CandyButton
          title="Continue to Profile Photo"
          onPress={() => void handleContinue()}
          disabled={!canContinue || isSaving}
          loading={isSaving}
          variant={canContinue ? 'espresso' : 'muted'}
          icon={
            <Ionicons
              name="arrow-forward"
              size={18}
              color={canContinue ? '#FFFFFF' : colors.secondary}
            />
          }
          style={{ width: '100%' }}
        />

        {!canContinue && nextMissingPrompt ? (
          <Text style={styles.validationPrompt}>{nextMissingPrompt}</Text>
        ) : null}
      </View>
    </OnboardingFormScroll>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: colors.darkNavy,
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
    backgroundColor: colors.lightBlue,
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
    backgroundColor: colors.darkNavy,
    marginRight: 6,
  },
  stepBadgeText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.darkNavy,
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
    backgroundColor: colors.darkNavy,
  },
  progressSegmentInactive: {
    backgroundColor: colors.border,
  },
  titleSection: {
    marginBottom: 18,
  },
  heading: {
    fontSize: typography.sizes.xxl,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.6,
    lineHeight: 33,
    marginBottom: 6,
  },
  subheading: {
    fontSize: typography.sizes.label,
    lineHeight: 20,
    color: colors.secondary,
    fontWeight: '500',
  },
  docList: {
    gap: 12,
    marginBottom: 20,
  },
  docCardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  docCardContainerDone: {
    borderColor: colors.darkNavy,
    backgroundColor: colors.surface,
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  docCardContainerError: {
    borderColor: '#DC2626',
  },
  docHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  docIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  docIconBoxDone: {
    backgroundColor: '#DCFCE7',
  },
  docIconBoxExpired: {
    backgroundColor: '#FEE2E2',
  },
  docInfo: {
    flex: 1,
  },
  docTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  docTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.text,
  },
  requiredStar: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: '#DC2626',
    marginLeft: 3,
  },
  docSubtitle: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    fontWeight: '500',
    marginTop: 2,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  savedBadgeText: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: '#15803D',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  pendingBadgeText: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: '#92400E',
  },
  expiredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  expiredBadgeText: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: '#991B1B',
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    marginLeft: 8,
  },
  actionPillDone: {
    backgroundColor: '#DCFCE7',
  },
  actionPillText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.darkNavy,
  },
  actionPillTextDone: {
    color: '#15803D',
  },
  fileSelectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  fileNameText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.darkNavy,
    marginHorizontal: 8,
  },
  expirySection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3EDE4',
  },
  expiryLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.darkNavy,
    marginBottom: 6,
  },
  expiryInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 48,
    minHeight: 48,
  },
  expiryInputWrapperFocused: {
    borderColor: colors.darkNavy,
  },
  expiryInputWrapperError: {
    borderColor: '#DC2626',
  },
  expiryTextInput: {
    flex: 1,
    height: '100%',
    minHeight: 44,
    fontSize: typography.sizes.label,
    fontWeight: '600',
    color: colors.text,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  itemErrorText: {
    fontSize: typography.sizes.xs,
    color: '#DC2626',
    marginTop: 8,
    fontWeight: '600',
  },
  guidelinesCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.2,
    borderColor: '#FDE68A',
    marginBottom: 22,
  },
  guidelinesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  guidelinesTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.text,
  },
  guidelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  guidelineText: {
    flex: 1,
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    lineHeight: 17,
    fontWeight: '500',
  },
  ctaSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  validationPrompt: {
    fontSize: 12.5,
    color: colors.darkNavy,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },
});
