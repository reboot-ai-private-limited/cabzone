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

type VehicleDocumentType = 'GOVERNMENT_ID' | 'REGISTRATION_CERTIFICATE' | 'INSURANCE' | 'PERMIT';

interface DocConfig {
  type: VehicleDocumentType;
  title: string;
  subtitle: string;
  draftKey: 'govtIdUploaded' | 'rcUploaded' | 'insuranceUploaded' | 'permitUploaded';
  icon: keyof typeof Ionicons.glyphMap;
  required: boolean;
}

const DOCUMENTS: DocConfig[] = [
  {
    type: 'GOVERNMENT_ID',
    title: 'Government ID',
    subtitle: 'Aadhaar, voter ID, or passport',
    draftKey: 'govtIdUploaded',
    icon: 'id-card-outline',
    required: true,
  },
  {
    type: 'REGISTRATION_CERTIFICATE',
    title: 'Registration Certificate (RC)',
    subtitle: 'RC Smart Card or Paper Registration',
    draftKey: 'rcUploaded',
    icon: 'car-sport-outline',
    required: true,
  },
  {
    type: 'INSURANCE',
    title: 'Vehicle Insurance',
    subtitle: 'Comprehensive or Commercial Third-Party',
    draftKey: 'insuranceUploaded',
    icon: 'shield-checkmark-outline',
    required: true,
  },
  {
    type: 'PERMIT',
    title: 'Commercial Permit',
    subtitle: 'Route Permit or Tourist Vehicle Authorization',
    draftKey: 'permitUploaded',
    icon: 'ribbon-outline',
    required: true,
  },
];

interface StepVehicleDocumentsProps {
  draft: OnboardingDraft;
  onUpdate: (partial: Partial<OnboardingDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}

// Helper to format date DD/MM/YYYY into YYYY-MM-DD
function parseFormattedDate(dateStr: string): string | null {
  if (!dateStr || dateStr.length !== 10) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y || d.length !== 2 || m.length !== 2 || y.length !== 4) return null;
  return `${y}-${m}-${d}`;
}

export function StepVehicleDocuments({
  draft,
  onUpdate,
  onNext,
  onBack,
}: StepVehicleDocumentsProps) {
  const insets = useSafeAreaInsets();
  const { token, documents, refreshProfile } = useAuth();

  const [selected, setSelected] = useState<Partial<Record<VehicleDocumentType, SelectedDriverLicense>>>({});
  const [expiries, setExpiries] = useState<Partial<Record<VehicleDocumentType, string>>>({});
  const [uploadedThisSession, setUploadedThisSession] = useState<VehicleDocumentType[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Check if document already exists and is unexpired in profile
  const hasCurrentDocument = (type: VehicleDocumentType) =>
    uploadedThisSession.includes(type) ||
    documents.some(
      (document) =>
        document.type === type &&
        !document.storageKey.startsWith('mock/') &&
        (type === 'GOVERNMENT_ID' || (!!document.expiresAt && new Date(document.expiresAt) > new Date())),
    );

  // Pick document file
  const handlePick = async (type: VehicleDocumentType, title: string) => {
    try {
      const file = await pickDriverLicense(title);
      if (file) {
        setSelected((prev) => ({ ...prev, [type]: file }));
      }
    } catch (error) {
      Alert.alert('Document Selection', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  // Direct manual typing with auto slash formatting
  const handleExpiryTextChange = (type: VehicleDocumentType, text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 8);
    let formatted = cleaned;
    if (cleaned.length > 2 && cleaned.length <= 4) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    } else if (cleaned.length > 4) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4)}`;
    }
    setExpiries((prev) => ({ ...prev, [type]: formatted }));
  };

  // Validation
  const isRCReady = hasCurrentDocument('REGISTRATION_CERTIFICATE') || Boolean(selected['REGISTRATION_CERTIFICATE']);
  const isInsuranceReady = hasCurrentDocument('INSURANCE') || Boolean(selected['INSURANCE']);
  const isPermitReady = hasCurrentDocument('PERMIT') || Boolean(selected['PERMIT']);
  const isIdReady = hasCurrentDocument('GOVERNMENT_ID') || Boolean(selected['GOVERNMENT_ID']);
  const canContinue = isRCReady && isInsuranceReady && isPermitReady && isIdReady;

  const handleContinue = async () => {
    if (!token || isSaving) return;
    setIsSaving(true);

    try {
      for (const { type, title, draftKey, required } of DOCUMENTS) {
        const file = selected[type];
        if (!file) {
          if (required && !hasCurrentDocument(type)) {
            throw new Error(`Please upload your ${title}.`);
          }
          continue;
        }

        if (type === 'GOVERNMENT_ID') {
          await driverApi.uploadIdentityDocumentFile(token, file.dataUrl);
          setUploadedThisSession((prev) => [...prev, type]);
          onUpdate({ [draftKey]: true });
          setSelected((prev) => ({ ...prev, [type]: undefined }));
          continue;
        }

        const dateStr = expiries[type]?.trim() ?? '';
        const isoDate = parseFormattedDate(dateStr);
        if (!isoDate) {
          throw new Error(`Enter a valid future expiry date (DD/MM/YYYY) for ${title}.`);
        }

        const parsed = new Date(`${isoDate}T23:59:59.999Z`);
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== isoDate || parsed <= new Date()) {
          throw new Error(`Expiry date for ${title} must be in the future.`);
        }

        await driverApi.uploadVehicleDocumentFile(token, {
          type,
          fileDataUrl: file.dataUrl,
          expiresAt: parsed.toISOString(),
        });

        setUploadedThisSession((prev) => [...prev, type]);
        onUpdate({ [draftKey]: true });
        setSelected((prev) => ({ ...prev, [type]: undefined }));
      }

      await refreshProfile();
      onNext();
    } catch (error) {
      Alert.alert('Upload Error', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

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
            style={({ pressed }) => [styles.backBtn, pressed && styles.btnPressed]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={20} color="#2C1810" />
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
          {DOCUMENTS.map(({ type, title, subtitle, icon, required }) => {
            const saved = hasCurrentDocument(type);
            const file = selected[type];
            const isCompleted = saved || Boolean(file);
            const expiryValue = expiries[type] ?? '';

            return (
              <View key={type} style={[styles.docCardContainer, isCompleted && styles.docCardContainerDone]}>
                {/* Header Row: Icon, Title, Status & Upload Button */}
                <Pressable
                  style={styles.docHeaderRow}
                  onPress={() => void handlePick(type, title)}
                  disabled={isSaving}
                  accessibilityRole="button">
                  <View style={[styles.docIconBox, isCompleted && styles.docIconBoxDone]}>
                    <Ionicons
                      name={isCompleted ? 'checkmark-circle' : icon}
                      size={22}
                      color={isCompleted ? '#15803D' : '#8C4A1B'}
                    />
                  </View>

                  <View style={styles.docInfo}>
                    <View style={styles.docTitleRow}>
                      <Text style={styles.docTitle}>{title}</Text>
                      {required && <Text style={styles.requiredStar}>*</Text>}
                    </View>
                    <Text style={styles.docSubtitle}>{subtitle}</Text>
                    {saved && !file && (
                      <View style={styles.savedBadge}>
                        <Ionicons name="checkmark" size={12} color="#15803D" style={{ marginRight: 3 }} />
                        <Text style={styles.savedBadgeText}>Saved for review</Text>
                      </View>
                    )}
                  </View>

                  <View style={[styles.actionPill, isCompleted && styles.actionPillDone]}>
                    <Text style={[styles.actionPillText, isCompleted && styles.actionPillTextDone]}>
                      {file ? 'Change' : saved ? 'Replace' : 'Upload'}
                    </Text>
                    <Ionicons
                      name={isCompleted ? 'refresh-outline' : 'cloud-upload-outline'}
                      size={14}
                      color={isCompleted ? '#15803D' : '#8C4A1B'}
                      style={{ marginLeft: 4 }}
                    />
                  </View>
                </Pressable>

                {/* Selected File Details Banner */}
                {file && type !== 'GOVERNMENT_ID' && (
                  <View style={styles.fileSelectedBanner}>
                    <Ionicons name="document-attach" size={16} color="#8C4A1B" />
                    <Text style={styles.fileNameText} numberOfLines={1}>
                      {file.name}
                    </Text>
                    <Pressable
                      onPress={() => setSelected((prev) => ({ ...prev, [type]: undefined }))}
                      hitSlop={8}>
                      <Ionicons name="close-circle" size={16} color="#DC2626" />
                    </Pressable>
                  </View>
                )}

                {/* Expiry Date Section for Selected / Uploaded File */}
                {file && (
                  <View style={styles.expirySection}>
                    <Text style={styles.expiryLabel}>Document Expiry Date *</Text>
                    <View style={styles.expiryInputWrapper}>
                      <Ionicons name="calendar-outline" size={18} color="#8C5A20" style={{ marginRight: 8 }} />
                      <TextInput
                        style={styles.expiryTextInput}
                        placeholder="DD / MM / YYYY"
                        placeholderTextColor="#A89A88"
                        value={expiryValue}
                        onChangeText={(text) => handleExpiryTextChange(type, text)}
                        keyboardType="number-pad"
                        maxLength={10}
                      />
                    </View>

                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Guidelines Security Card */}
        <View style={styles.guidelinesCard}>
          <View style={styles.guidelinesHeader}>
            <Ionicons name="shield-checkmark" size={18} color="#D97706" style={{ marginRight: 6 }} />
            <Text style={styles.guidelinesTitle}>Verification Guidelines</Text>
          </View>
          <View style={styles.guidelineRow}>
            <Ionicons name="checkmark-circle" size={14} color="#15803D" style={{ marginRight: 6, marginTop: 2 }} />
            <Text style={styles.guidelineText}>Upload clear PDF, JPG, or JPEG files (max 500 KB).</Text>
          </View>
          <View style={styles.guidelineRow}>
            <Ionicons name="checkmark-circle" size={14} color="#15803D" style={{ marginRight: 6, marginTop: 2 }} />
            <Text style={styles.guidelineText}>Ensure all four corners are visible, uncropped, and free of glare.</Text>
          </View>
          <View style={styles.guidelineRow}>
            <Ionicons name="checkmark-circle" size={14} color="#15803D" style={{ marginRight: 6, marginTop: 2 }} />
            <Text style={styles.guidelineText}>Vehicle registration number and chassis number must match Step 3 details.</Text>
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
            icon={<Ionicons name="arrow-forward" size={18} color={canContinue ? '#FFFFFF' : '#B3A48C'} />}
            style={{ width: '100%' }}
          />

          {!canContinue && (
            <Text style={styles.validationPrompt}>
              • Upload Government ID, RC, insurance, and permit to proceed
            </Text>
          )}
        </View>
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
  backBtn: {
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
    marginBottom: 18,
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
  docList: {
    gap: 12,
    marginBottom: 20,
  },
  docCardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#ECE0CE',
    shadowColor: '#3D2314',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  docCardContainerDone: {
    borderColor: '#8C4A1B',
    backgroundColor: '#FFFDF9',
    shadowColor: '#8C4A1B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
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
  docInfo: {
    flex: 1,
  },
  docTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  docTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2C1810',
  },
  requiredStar: {
    fontSize: 15,
    fontWeight: '800',
    color: '#DC2626',
    marginLeft: 3,
  },
  docSubtitle: {
    fontSize: 12,
    color: '#705746',
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
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
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
    color: '#8C4A1B',
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
    color: '#8C4A1B',
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
    color: '#3D2314',
    marginBottom: 6,
  },
  expiryInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#ECE0CE',
    paddingHorizontal: 12,
    height: 46,
  },
  expiryTextInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#2C1810',
  },
  presetsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  presetsLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#8C7B68',
    marginRight: 2,
  },
  presetChip: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  presetChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#8C4A1B',
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
    color: '#2C1810',
  },
  guidelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  guidelineText: {
    flex: 1,
    fontSize: 12,
    color: '#705746',
    lineHeight: 17,
    fontWeight: '500',
  },
  ctaSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  validationPrompt: {
    fontSize: 12.5,
    color: '#8C4A1B',
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },
});
