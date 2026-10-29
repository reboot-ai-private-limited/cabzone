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
  toDisplayDate,
  validateFutureExpiryDate,
} from '@/services/profile';
import {
  OnboardingFormScroll,
  type OnboardingFormScrollHandle,
} from './onboarding-form-scroll';
import { getDrivingLicencePrompt } from './onboarding-ux-helpers';
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
  const { token, driver, documents, refreshProfile } = useAuth();
  const formScrollRef = useRef<OnboardingFormScrollHandle>(null);
  const dlInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const expiryInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const dlBoxRef = useRef<React.ComponentRef<typeof View>>(null);
  const expiryBoxRef = useRef<React.ComponentRef<typeof View>>(null);

  const [dlNumber, setDlNumber] = useState(draft.dlNumber || driver?.dlNumber || '');
  const [expiryDate, setExpiryDate] = useState(() =>
    toDisplayDate(draft.dlExpiry || driver?.dlExpiry || ''),
  );
  const [selectedFile, setSelectedFile] = useState<SelectedDriverLicense | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isExpiryFocused, setIsExpiryFocused] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const serverLicenceStatus = getServerDocumentStatus(documents, 'DRIVING_LICENSE');
  const savedLicence = documents.find(
    (document) => document.type === 'DRIVING_LICENSE' && !document.storageKey.startsWith('mock/'),
  );
  const savedDlNumber = (driver?.dlNumber || draft.dlNumber || '').trim();
  const savedNumberMatches =
    serverLicenceStatus.status === 'READY' &&
    savedDlNumber.length >= 8 &&
    savedDlNumber === dlNumber.trim();

  const expiryCheck = validateFutureExpiryDate(expiryDate);
  const hasCompleteExpiry = expiryDate.trim().length === 10;
  const expiryError = hasCompleteExpiry && !expiryCheck.valid ? expiryCheck.error : undefined;

  const isSelectedPendingUpload = selectedFile !== null;
  const isSavedOnServer = !isSelectedPendingUpload && savedNumberMatches;
  const isExpiredOnServer =
    !isSelectedPendingUpload && serverLicenceStatus.status === 'EXPIRED';

  const hasFileOrSaved = isSelectedPendingUpload || isSavedOnServer;
  const isValid =
    dlNumber.trim().length >= 8 &&
    expiryCheck.valid &&
    hasFileOrSaved;

  const validationPrompt = getDrivingLicencePrompt({
    hasFileOrSaved,
    dlNumber,
    expiryValid: expiryCheck.valid,
    expiryError,
  });

  const handleDlChange = (text: string) => {
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
    setDlNumber(cleaned);
    setSubmitError(null);
    onUpdate({ dlNumber: cleaned });
  };

  const handleExpiryChange = (text: string) => {
    const formatted = formatDateInput(text);
    setExpiryDate(formatted);
    setSubmitError(null);
    onUpdate({ dlExpiry: formatted });
  };

  const handlePickFile = async () => {
    Keyboard.dismiss();
    try {
      setSubmitError(null);
      const file = await pickDriverLicense('Driving licence');
      if (file) {
        setSelectedFile(file);
        setTimeout(() => {
          if (dlNumber.trim().length < 8) {
            dlInputRef.current?.focus();
          } else if (!validateFutureExpiryDate(expiryDate).valid) {
            expiryInputRef.current?.focus();
          }
        }, 180);
      }
    } catch (err) {
      Alert.alert(
        'Licence file unavailable',
        err instanceof Error ? err.message : 'Please try again.',
      );
    }
  };

  const handleContinue = async () => {
    if (!token || isSaving || !isValid || !expiryCheck.isoDate || !expiryCheck.isoTimestamp) return;
    Keyboard.dismiss();
    setIsSaving(true);
    setSubmitError(null);
    try {
      const normalizedDl = dlNumber.trim();
      await driverApi.saveProfile(token, {
        dlNumber: normalizedDl,
        dlExpiry: expiryCheck.isoDate,
      });
      await driverApi.createApplication(token);

      const savedIsoDate = savedLicence?.expiresAt?.slice(0, 10);
      if (
        selectedFile ||
        !savedIsoDate ||
        savedIsoDate !== expiryCheck.isoDate ||
        !savedNumberMatches
      ) {
        await driverApi.uploadLicenseFile(token, {
          ...(selectedFile ? { fileDataUrl: selectedFile.dataUrl } : {}),
          dlNumber: normalizedDl,
          expiresAt: expiryCheck.isoTimestamp,
        });
      }

      setSelectedFile(null);
      onUpdate({
        dlNumber: normalizedDl,
        dlExpiry: expiryDate,
        dlUploaded: true,
      });
      await refreshProfile();
      onNext();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Please try again.';
      setSubmitError(msg);
      Alert.alert('Could not save licence', msg);
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
          style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={20} color="#172B3A" />
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

      {submitError ? (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={18} color="#991B1B" />
          <Text style={styles.errorBannerText}>{submitError}</Text>
        </View>
      ) : null}

      {/* Upload Box Card */}
      <Pressable
        style={({ pressed }) => [
          styles.uploadBox,
          isSelectedPendingUpload && styles.uploadBoxPending,
          isSavedOnServer && styles.uploadBoxDone,
          isExpiredOnServer && styles.uploadBoxExpired,
          pressed && styles.btnPressed,
        ]}
        onPress={() => void handlePickFile()}
        disabled={isSaving}
        accessibilityRole="button"
        accessibilityLabel={
          isSelectedPendingUpload
            ? `Selected driving licence ${selectedFile.name}, ready to upload`
            : isSavedOnServer
              ? 'Driving licence saved for review. Tap to replace document'
              : 'Select driving licence PDF or JPEG'
        }>
        {isSelectedPendingUpload ? (
          <View style={styles.uploadedState}>
            <View style={styles.pendingCircle}>
              <Ionicons name="document-attach" size={26} color="#92400E" />
            </View>
            <Text style={styles.pendingTitle} numberOfLines={1}>
              {selectedFile.name}
            </Text>
            <Text style={styles.pendingSub}>
              Ready to upload · Tap Continue to save for review
            </Text>
          </View>
        ) : isSavedOnServer ? (
          <View style={styles.uploadedState}>
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={26} color="#166534" />
            </View>
            <Text style={styles.uploadedTitle}>Saved for review</Text>
            <Text style={styles.uploadedSub}>
              {serverLicenceStatus.expiresAtDisplay
                ? `Expires ${serverLicenceStatus.expiresAtDisplay} · Tap to replace`
                : 'Tap to replace document'}
            </Text>
          </View>
        ) : isExpiredOnServer ? (
          <View style={styles.uploadedState}>
            <View style={styles.expiredCircle}>
              <Ionicons name="warning-outline" size={26} color="#991B1B" />
            </View>
            <Text style={styles.expiredTitle}>Licence expired</Text>
            <Text style={styles.expiredSub}>
              Upload a current driving licence and enter its new expiry date
            </Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.uploadPlusCircle}>
              <Ionicons name="add" size={28} color="#53616C" />
            </View>
            <Text style={styles.uploadTitle}>Select driving licence</Text>
            <Text style={styles.uploadSub}>PDF, JPG or JPEG · up to 500 KB</Text>
          </View>
        )}
      </Pressable>

      {/* Licence Number Input */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Licence number *</Text>
        <View ref={dlBoxRef} collapsable={false}>
          <Pressable
            onPress={() => dlInputRef.current?.focus()}
            style={[styles.inputWrapper, isFocused && styles.inputWrapperFocused]}>
            <Ionicons name="card-outline" size={20} color="#53616C" style={styles.inputIcon} />
            <TextInput
              ref={dlInputRef}
              style={[styles.textInput, styles.dlInput]}
              placeholder="e.g. WB7420220012345"
              placeholderTextColor="#53616C"
              value={dlNumber}
              onChangeText={handleDlChange}
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
              maxLength={16}
              blurOnSubmit={false}
              returnKeyType="next"
              onSubmitEditing={() => expiryInputRef.current?.focus()}
              editable={!isSaving}
              onFocus={() => {
                setIsFocused(true);
                formScrollRef.current?.focusTarget(dlBoxRef.current);
              }}
              onBlur={() => setIsFocused(false)}
              accessibilityLabel="Driving licence number"
            />
            {dlNumber.length > 0 && !isSaving ? (
              <Pressable
                onPress={() => handleDlChange('')}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Clear driving licence number">
                <Ionicons name="close-circle" size={18} color="#C4B5A5" />
              </Pressable>
            ) : null}
          </Pressable>
        </View>
        <Text style={styles.helperText}>
          Enter without spaces or hyphens as printed on your Smart Card DL.
        </Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Licence expiry date *</Text>
        <View ref={expiryBoxRef} collapsable={false}>
          <Pressable
            onPress={() => expiryInputRef.current?.focus()}
            style={[
              styles.inputWrapper,
              isExpiryFocused && styles.inputWrapperFocused,
              Boolean(expiryError) && styles.inputWrapperError,
            ]}>
            <Ionicons name="calendar-outline" size={20} color="#53616C" style={styles.inputIcon} />
            <TextInput
              ref={expiryInputRef}
              style={styles.textInput}
              placeholder="DD/MM/YYYY"
              placeholderTextColor="#53616C"
              value={expiryDate}
              onChangeText={handleExpiryChange}
              keyboardType="number-pad"
              maxLength={10}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              editable={!isSaving}
              onFocus={() => {
                setIsExpiryFocused(true);
                formScrollRef.current?.focusTarget(expiryBoxRef.current);
              }}
              onBlur={() => setIsExpiryFocused(false)}
              accessibilityLabel="Driving licence expiry date in DD/MM/YYYY format"
            />
            {expiryDate.length > 0 && !isSaving ? (
              <Pressable
                onPress={() => handleExpiryChange('')}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Clear licence expiry date">
                <Ionicons name="close-circle" size={18} color="#C4B5A5" />
              </Pressable>
            ) : null}
          </Pressable>
        </View>
        {expiryError ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            {expiryError}
          </Text>
        ) : (
          <Text style={styles.helperText}>
            Enter the future expiry date printed on your licence (DD/MM/YYYY).
          </Text>
        )}
      </View>

      <View style={styles.tipsBox}>
        <View style={styles.tipsHeaderRow}>
          <Ionicons name="information-circle" size={18} color="#8C5A20" />
          <Text style={styles.tipsTitle}>Document guidelines:</Text>
        </View>
        <Text style={styles.tipItem}>• PDF, JPG or JPEG only; maximum 500 KB.</Text>
        <Text style={styles.tipItem}>• All 4 corners of the licence must be visible.</Text>
        <Text style={styles.tipItem}>• Avoid camera flash reflections or dark shadows.</Text>
        <Text style={styles.tipItem}>• Must be valid and not expired.</Text>
      </View>

      <CandyButton
        title="Continue"
        onPress={handleContinue}
        disabled={!isValid || isSaving}
        loading={isSaving}
        variant={isValid ? 'primary' : 'muted'}
        icon={
          <Ionicons
            name="arrow-forward"
            size={18}
            color={isValid ? colors.darkNavy : colors.secondary}
            style={{ marginLeft: 2 }}
          />
        }
        style={styles.actionBtn}
      />

      {validationPrompt ? (
        <Text style={styles.validationPrompt}>{validationPrompt}</Text>
      ) : null}
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
  closeBtn: {
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
    marginBottom: 20,
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 16,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#991B1B',
  },
  uploadBox: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  uploadBoxPending: {
    borderColor: '#D97706',
    borderStyle: 'solid',
    backgroundColor: '#FFFBEB',
  },
  uploadBoxDone: {
    borderColor: '#16A34A',
    borderStyle: 'solid',
    backgroundColor: '#F0FDF4',
  },
  uploadBoxExpired: {
    borderColor: '#DC2626',
    borderStyle: 'solid',
    backgroundColor: '#FEF2F2',
  },
  emptyState: {
    alignItems: 'center',
  },
  uploadPlusCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.lightBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  uploadTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
  },
  uploadSub: {
    fontSize: typography.sizes.sm,
    color: colors.secondary,
    fontWeight: '500',
  },
  uploadedState: {
    alignItems: 'center',
  },
  pendingCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pendingTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 6,
  },
  pendingSub: {
    fontSize: typography.sizes.sm,
    color: '#B45309',
    fontWeight: '600',
    textAlign: 'center',
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
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: '#14532D',
    marginBottom: 6,
  },
  uploadedSub: {
    fontSize: typography.sizes.sm,
    color: '#15803D',
    fontWeight: '500',
    textAlign: 'center',
  },
  expiredCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  expiredTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 6,
  },
  expiredSub: {
    fontSize: typography.sizes.sm,
    color: '#B91C1C',
    fontWeight: '500',
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.darkNavy,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    height: 52,
    minHeight: 52,
  },
  inputWrapperFocused: {
    borderColor: colors.darkNavy,
    backgroundColor: '#FFFFFF',
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  inputWrapperError: {
    borderColor: '#DC2626',
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    height: '100%',
    minHeight: 48,
    fontSize: typography.sizes.base,
    fontWeight: '600',
    color: colors.text,
    paddingVertical: Platform.OS === 'ios' ? 12 : 6,
  },
  dlInput: {
    fontWeight: '800',
  },
  helperText: {
    fontSize: 11.5,
    color: colors.secondary,
    marginTop: 8,
    fontWeight: '500',
  },
  errorText: {
    fontSize: typography.sizes.xs,
    color: '#DC2626',
    marginTop: 6,
    fontWeight: '600',
  },
  tipsBox: {
    backgroundColor: colors.surface,
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
  validationPrompt: {
    fontSize: 12.5,
    color: colors.darkNavy,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },
});
