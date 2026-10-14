import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { pickProfilePhoto } from '@/services/profile-photo';
import { CandyButton } from '@/components/buttons/candy-button';
import type { OnboardingDraft } from './types';
import { toBackendDate } from '@/services/profile';

interface StepPersonalInfoProps {
  draft: OnboardingDraft;
  onUpdate: (partial: Partial<OnboardingDraft>) => void;
  onNext: (values: OnboardingDraft) => Promise<void>;
  onClose: () => void;
}

const MONTHS = [
  { label: 'Jan', full: 'January', val: 1 },
  { label: 'Feb', full: 'February', val: 2 },
  { label: 'Mar', full: 'March', val: 3 },
  { label: 'Apr', full: 'April', val: 4 },
  { label: 'May', full: 'May', val: 5 },
  { label: 'Jun', full: 'June', val: 6 },
  { label: 'Jul', full: 'July', val: 7 },
  { label: 'Aug', full: 'August', val: 8 },
  { label: 'Sep', full: 'September', val: 9 },
  { label: 'Oct', full: 'October', val: 10 },
  { label: 'Nov', full: 'November', val: 11 },
  { label: 'Dec', full: 'December', val: 12 },
];

// Helper to calculate age from DD/MM/YYYY
function calculateAge(dobString: string): number | null {
  if (!dobString || dobString.length !== 10) return null;
  const parts = dobString.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

  const birthDate = new Date(year, month, day);
  try {
    toBackendDate(dobString);
  } catch {
    return null;
  }
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 && age <= 120 ? age : null;
}

// Generate years from 2008 down to 1950 (must be 18+ to drive)
const CURRENT_YEAR = new Date().getFullYear();
const MAX_ELIGIBLE_YEAR = CURRENT_YEAR - 18;
const YEARS = Array.from({ length: MAX_ELIGIBLE_YEAR - 1950 + 1 }, (_, i) => MAX_ELIGIBLE_YEAR - i);

export function StepPersonalInfo({ draft, onUpdate, onNext, onClose }: StepPersonalInfoProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  // Form states
  const [firstName, setFirstName] = useState(draft.firstName || '');
  const [lastName, setLastName] = useState(draft.lastName || '');
  const [dob, setDob] = useState(draft.dateOfBirth || '');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>(draft.gender || 'MALE');
  const [photoUri, setPhotoUri] = useState<string | undefined>(draft.profilePhotoUri);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null | undefined>(
    draft.profilePhotoDataUrl,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Input refs for responsive focus
  const firstNameRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);

  // Focus tracking for warm borders
  const [focusedField, setFocusedField] = useState<'firstName' | 'lastName' | 'dob' | null>(null);

  // Modals
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Date picker scratch state
  const parsedDate = useMemo(() => {
    if (dob && dob.length === 10) {
      const [d, m, y] = dob.split('/').map((n) => parseInt(n, 10));
      return {
        day: d || 15,
        month: m || 6,
        year: y || 1995,
      };
    }
    return { day: 15, month: 6, year: 1995 };
  }, [dob]);

  const [pickerDay, setPickerDay] = useState(parsedDate.day);
  const [pickerMonth, setPickerMonth] = useState(parsedDate.month);
  const [pickerYear, setPickerYear] = useState(parsedDate.year);

  // Days in selected month & year
  const daysInMonth = useMemo(() => {
    return new Date(pickerYear, pickerMonth, 0).getDate();
  }, [pickerYear, pickerMonth]);

  const age = useMemo(() => calculateAge(dob), [dob]);
  const isAgeValid = age !== null && age >= 18;
  const isFirstNameValid = firstName.trim().length >= 2;
  const isValid = isFirstNameValid && isAgeValid;

  // Handle Photo Picker
  const handlePickImage = async (useCamera: boolean) => {
    setShowPhotoModal(false);
    try {
      const photo = await pickProfilePhoto(useCamera);
      if (photo) {
        setPhotoUri(photo.uri);
        setPhotoDataUrl(photo.dataUrl);
        onUpdate({
          selfieTaken: true,
          profilePhotoUri: photo.uri,
          profilePhotoDataUrl: photo.dataUrl,
        });
      }
    } catch (err) {
      console.warn('Image picker error:', err);
      Alert.alert(
        'Photo unavailable',
        err instanceof Error ? err.message : 'Could not open camera or gallery.',
      );
    }
  };

  const handleRemovePhoto = () => {
    setShowPhotoModal(false);
    setPhotoUri(undefined);
    setPhotoDataUrl(null);
    onUpdate({ selfieTaken: false, profilePhotoUri: undefined, profilePhotoDataUrl: null });
  };

  // Handle manual typing of DOB with auto-formatting
  const handleDobTextChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 8);
    let formatted = cleaned;
    if (cleaned.length > 2 && cleaned.length <= 4) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    } else if (cleaned.length > 4) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4)}`;
    }
    setDob(formatted);
  };

  // Open Date Picker Modal synced with current DOB
  const handleOpenDatePicker = () => {
    setPickerDay(parsedDate.day);
    setPickerMonth(parsedDate.month);
    setPickerYear(parsedDate.year);
    setShowDatePicker(true);
  };

  // Confirm Date from Modal
  const handleConfirmDate = () => {
    const safeDay = Math.min(pickerDay, daysInMonth);
    const dd = String(safeDay).padStart(2, '0');
    const mm = String(pickerMonth).padStart(2, '0');
    const yyyy = String(pickerYear);
    const formatted = `${dd}/${mm}/${yyyy}`;
    setDob(formatted);
    setShowDatePicker(false);
  };

  // Handle Continue
  const handleContinue = async () => {
    if (!isValid || isSaving) return;
    const values = {
      ...draft,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth: dob.trim(),
      gender,
      selfieTaken: Boolean(photoUri),
      profilePhotoUri: photoUri,
      profilePhotoDataUrl: photoDataUrl,
    };
    setIsSaving(true);
    setSaveError(null);
    try {
      await onNext(values);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Could not save your profile. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const isSmallScreen = screenWidth < 360;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 24) + 20,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Bar */}
        <View style={styles.topBar}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close onboarding"
          >
            <Ionicons name="close" size={20} color="#2C1810" />
          </Pressable>

          <View style={styles.stepBadge}>
            <View style={styles.stepDot} />
            <Text style={styles.stepBadgeText}>Step 1 of 6</Text>
          </View>
        </View>

        {/* 6-Step Segmented Progress Bar */}
        <View style={styles.progressContainer}>
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <View
              key={s}
              style={[
                styles.progressSegment,
                s === 1 ? styles.progressSegmentActive : styles.progressSegmentInactive,
              ]}
            />
          ))}
        </View>

        {/* Headline & Subhead */}
        <View style={styles.titleSection}>
          <Text style={styles.heading}>Personal information</Text>
          <Text style={styles.subheading}>
            Enter your official details as shown on your government ID to set up your profile.
          </Text>
        </View>

        {/* Profile Photo Upload Section */}
        <View style={styles.avatarSection}>
          <Pressable
            onPress={() => setShowPhotoModal(true)}
            style={({ pressed }) => [styles.avatarTouchable, pressed && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Upload driver profile photo"
          >
            <View style={styles.avatarHaloRing}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.avatarImage} resizeMode="cover" />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={42} color="#D97706" />
                </View>
              )}

              {/* Floating Camera Action Badge */}
              <View style={styles.cameraBadge}>
                <Ionicons name={photoUri ? 'pencil' : 'camera'} size={15} color="#FFFFFF" />
              </View>
            </View>
          </Pressable>

          <Text style={styles.avatarLabel}>
            {photoUri ? '✓ Profile photo added' : 'Add driver photo'}
          </Text>
          <Text style={styles.avatarHint}>Clear front-facing photo helps riders recognize you</Text>
        </View>

        {/* Form Card Container */}
        <View style={styles.formCard}>
          {/* First Name Input */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>First name *</Text>
              {firstName.trim().length > 0 && firstName.trim().length < 2 && (
                <Text style={styles.fieldError}>Min 2 chars</Text>
              )}
            </View>
            <Pressable
              onPress={() => firstNameRef.current?.focus()}
              style={[
                styles.inputWrapper,
                focusedField === 'firstName' && styles.inputWrapperFocused,
              ]}
            >
              <Ionicons name="person-outline" size={19} color="#8C5A20" style={styles.inputIcon} />
              <TextInput
                ref={firstNameRef}
                style={styles.textInput}
                placeholder="e.g. Rahul"
                placeholderTextColor="#A89A88"
                value={firstName}
                onChangeText={setFirstName}
                onFocus={() => setFocusedField('firstName')}
                onBlur={() => setFocusedField(null)}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => lastNameRef.current?.focus()}
                editable={true}
              />
              {firstName.length > 0 && (
                <Pressable onPress={() => setFirstName('')} hitSlop={12}>
                  <Ionicons name="close-circle" size={18} color="#C4B5A5" />
                </Pressable>
              )}
            </Pressable>
          </View>

          {/* Last Name Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Last name</Text>
            <Pressable
              onPress={() => lastNameRef.current?.focus()}
              style={[
                styles.inputWrapper,
                focusedField === 'lastName' && styles.inputWrapperFocused,
              ]}
            >
              <Ionicons name="person-outline" size={19} color="#8C5A20" style={styles.inputIcon} />
              <TextInput
                ref={lastNameRef}
                style={styles.textInput}
                placeholder="e.g. Sharma"
                placeholderTextColor="#A89A88"
                value={lastName}
                onChangeText={setLastName}
                onFocus={() => setFocusedField('lastName')}
                onBlur={() => setFocusedField(null)}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                editable={true}
              />
              {lastName.length > 0 && (
                <Pressable onPress={() => setLastName('')} hitSlop={12}>
                  <Ionicons name="close-circle" size={18} color="#C4B5A5" />
                </Pressable>
              )}
            </Pressable>
          </View>

          {/* Date of Birth Input with Proper Date Selector Modal */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Date of birth *</Text>
              {age !== null && (
                <View
                  style={[styles.ageTag, isAgeValid ? styles.ageTagValid : styles.ageTagInvalid]}
                >
                  <Ionicons
                    name={isAgeValid ? 'checkmark-circle' : 'alert-circle'}
                    size={12}
                    color={isAgeValid ? '#065F46' : '#991B1B'}
                    style={{ marginRight: 3 }}
                  />
                  <Text
                    style={[
                      styles.ageTagText,
                      isAgeValid ? styles.ageTagTextValid : styles.ageTagTextInvalid,
                    ]}
                  >
                    {age} yrs {isAgeValid ? '(18+ eligible)' : '(Under 18)'}
                  </Text>
                </View>
              )}
            </View>

            <Pressable
              onPress={handleOpenDatePicker}
              style={[styles.inputWrapper, focusedField === 'dob' && styles.inputWrapperFocused]}
            >
              <Ionicons
                name="calendar-outline"
                size={19}
                color="#8C5A20"
                style={styles.inputIcon}
              />
              <TextInput
                style={[styles.textInput, { flex: 1 }]}
                placeholder="DD / MM / YYYY"
                placeholderTextColor="#A89A88"
                value={dob}
                onChangeText={handleDobTextChange}
                keyboardType="number-pad"
                maxLength={10}
                onFocus={() => setFocusedField('dob')}
                onBlur={() => setFocusedField(null)}
              />
              <Pressable
                onPress={handleOpenDatePicker}
                style={styles.datePickerTriggerBtn}
                hitSlop={8}
              >
                <Ionicons name="options-outline" size={18} color="#8C4A1B" />
                <Text style={styles.datePickerTriggerText}>Select</Text>
              </Pressable>
            </Pressable>

            {dob.length === 10 && !isAgeValid && (
              <Text style={styles.errorHelperText}>
                Driver must be at least 18 years old to drive with Cabzon.
              </Text>
            )}
          </View>

          {/* Gender Selector Chips */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Gender *</Text>
            <View style={styles.genderRow}>
              {(
                [
                  { key: 'MALE', label: 'Male', icon: 'male-outline' },
                  { key: 'FEMALE', label: 'Female', icon: 'female-outline' },
                  { key: 'OTHER', label: 'Other', icon: 'person-outline' },
                ] as const
              ).map((item) => {
                const isSelected = gender === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setGender(item.key)}
                    style={({ pressed }) => [
                      styles.genderChip,
                      isSelected && styles.genderChipActive,
                      pressed && styles.btnPressed,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Ionicons
                      name={item.icon}
                      size={17}
                      color={isSelected ? '#FFFFFF' : '#8C4A1B'}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[styles.genderChipText, isSelected && styles.genderChipTextActive]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Bottom CTA Button */}
        <View style={styles.ctaSection}>
          <CandyButton
            title="Continue to City Selection"
            onPress={handleContinue}
            disabled={!isValid || isSaving}
            loading={isSaving}
            variant={isValid ? 'espresso' : 'muted'}
            icon={
              <Ionicons name="arrow-forward" size={18} color={isValid ? '#FFFFFF' : '#B3A48C'} />
            }
            style={{ width: '100%' }}
          />

          {saveError && (
            <Text accessibilityRole="alert" style={styles.validationPrompt}>
              {saveError}
            </Text>
          )}

          {!isValid && (
            <Text style={styles.validationPrompt}>
              {!isFirstNameValid
                ? '• Enter your first name to continue'
                : !dob
                  ? '• Enter your date of birth'
                  : !isAgeValid
                    ? '• Must be at least 18 years old'
                    : '• Fill required fields'}
            </Text>
          )}
        </View>
      </ScrollView>

      {/* ============================================================== */}
      {/* Photo Picker Action Sheet Modal                                */}
      {/* ============================================================== */}
      {showPhotoModal && (
        <Modal
          visible={showPhotoModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPhotoModal(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowPhotoModal(false)}>
            <View style={styles.modalCard}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Upload Profile Photo</Text>
              <Text style={styles.modalSubtitle}>
                Take a clear selfie or select an existing photo from your library.
              </Text>

              <Pressable
                style={({ pressed }) => [styles.modalActionItem, pressed && styles.btnPressed]}
                onPress={() => handlePickImage(true)}
              >
                <View style={styles.actionIconBox}>
                  <Ionicons name="camera" size={20} color="#8C4A1B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionItemTitle}>Take a Selfie (Camera)</Text>
                  <Text style={styles.actionItemSub}>Use your front camera right now</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#C4B5A5" />
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.modalActionItem, pressed && styles.btnPressed]}
                onPress={() => handlePickImage(false)}
              >
                <View style={styles.actionIconBox}>
                  <Ionicons name="images" size={20} color="#8C4A1B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionItemTitle}>Choose from Gallery</Text>
                  <Text style={styles.actionItemSub}>Select an existing image from phone</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#C4B5A5" />
              </Pressable>

              {photoUri && (
                <Pressable
                  style={({ pressed }) => [
                    styles.modalActionItem,
                    { borderBottomWidth: 0 },
                    pressed && styles.btnPressed,
                  ]}
                  onPress={handleRemovePhoto}
                >
                  <View style={[styles.actionIconBox, { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name="trash-outline" size={20} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionItemTitle, { color: '#DC2626' }]}>Remove Photo</Text>
                    <Text style={styles.actionItemSub}>Reset to default avatar</Text>
                  </View>
                </Pressable>
              )}

              <Pressable onPress={() => setShowPhotoModal(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* ============================================================== */}
      {/* Proper Date of Birth Wheel / Grid Selector Modal               */}
      {/* ============================================================== */}
      {showDatePicker && (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[styles.dateModalCard, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}
            >
              <View style={styles.modalHandle} />

              <View style={styles.dateModalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Select Date of Birth</Text>
                  <Text style={styles.modalSubtitle}>
                    Must be 18+ to be an eligible driver partner
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowDatePicker(false)}
                  hitSlop={10}
                  style={styles.modalCloseIconBtn}
                >
                  <Ionicons name="close" size={20} color="#705746" />
                </Pressable>
              </View>

              {/* Live Date Preview Pill */}
              <View style={styles.datePreviewBox}>
                <Ionicons name="calendar" size={18} color="#8C4A1B" />
                <Text style={styles.datePreviewText}>
                  {String(Math.min(pickerDay, daysInMonth)).padStart(2, '0')}{' '}
                  {MONTHS.find((m) => m.val === pickerMonth)?.full} {pickerYear}
                </Text>
                <View style={styles.datePreviewAgeTag}>
                  <Text style={styles.datePreviewAgeText}>Age: {CURRENT_YEAR - pickerYear}</Text>
                </View>
              </View>

              {/* Three Side-by-Side Columns: Day | Month | Year */}
              <View style={styles.pickerColumnsRow}>
                {/* Column 1: Day */}
                <View style={styles.pickerColumn}>
                  <Text style={styles.columnHeader}>DAY</Text>
                  <ScrollView style={styles.columnScroll} showsVerticalScrollIndicator={false}>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                      const isSelected = pickerDay === d;
                      return (
                        <Pressable
                          key={d}
                          onPress={() => setPickerDay(d)}
                          style={[styles.pickerItem, isSelected && styles.pickerItemSelected]}
                        >
                          <Text
                            style={[
                              styles.pickerItemText,
                              isSelected && styles.pickerItemTextSelected,
                            ]}
                          >
                            {String(d).padStart(2, '0')}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Column 2: Month */}
                <View style={styles.pickerColumn}>
                  <Text style={styles.columnHeader}>MONTH</Text>
                  <ScrollView style={styles.columnScroll} showsVerticalScrollIndicator={false}>
                    {MONTHS.map((m) => {
                      const isSelected = pickerMonth === m.val;
                      return (
                        <Pressable
                          key={m.val}
                          onPress={() => setPickerMonth(m.val)}
                          style={[styles.pickerItem, isSelected && styles.pickerItemSelected]}
                        >
                          <Text
                            style={[
                              styles.pickerItemText,
                              isSelected && styles.pickerItemTextSelected,
                            ]}
                          >
                            {m.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Column 3: Year */}
                <View style={styles.pickerColumn}>
                  <Text style={styles.columnHeader}>YEAR</Text>
                  <ScrollView style={styles.columnScroll} showsVerticalScrollIndicator={false}>
                    {YEARS.map((y) => {
                      const isSelected = pickerYear === y;
                      return (
                        <Pressable
                          key={y}
                          onPress={() => setPickerYear(y)}
                          style={[styles.pickerItem, isSelected && styles.pickerItemSelected]}
                        >
                          <Text
                            style={[
                              styles.pickerItemText,
                              isSelected && styles.pickerItemTextSelected,
                            ]}
                          >
                            {y}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>

              {/* Confirm Button */}
              <Pressable
                onPress={handleConfirmDate}
                style={({ pressed }) => [styles.confirmDateBtn, pressed && styles.btnPressed]}
              >
                <Text style={styles.confirmDateBtnText}>Apply Date of Birth</Text>
                <Ionicons name="checkmark" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
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
  avatarSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarTouchable: {
    marginBottom: 8,
  },
  avatarHaloRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#FFFDF4',
    borderWidth: 3.5,
    borderColor: '#FBBF24',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
    position: 'relative',
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3D2314',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
  avatarLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2C1810',
    marginBottom: 2,
  },
  avatarHint: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8C7B68',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1.2,
    borderColor: '#ECE0CE',
    shadowColor: '#3D2314',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 7,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#3D2314',
  },
  fieldError: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#DC2626',
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
    minHeight: 52,
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
    height: '100%',
    minHeight: 48,
    fontSize: 15,
    fontWeight: '600',
    color: '#2C1810',
    paddingVertical: Platform.OS === 'ios' ? 12 : 6,
  },
  datePickerTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  datePickerTriggerText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8C4A1B',
    marginLeft: 4,
  },
  ageTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  ageTagValid: {
    backgroundColor: '#D1FAE5',
  },
  ageTagInvalid: {
    backgroundColor: '#FEE2E2',
  },
  ageTagText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  ageTagTextValid: {
    color: '#065F46',
  },
  ageTagTextInvalid: {
    color: '#991B1B',
  },
  errorHelperText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
    marginTop: 5,
    marginLeft: 4,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  genderChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    backgroundColor: '#FFFDF9',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ECE0CE',
  },
  genderChipActive: {
    backgroundColor: '#3D2314',
    borderColor: '#3D2314',
    shadowColor: '#3D2314',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 2,
  },
  genderChipText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#705746',
  },
  genderChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
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

  // Modal Overlay Shared Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28, 16, 10, 0.55)',
    justifyContent: 'flex-end',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1C4B5',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 36,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#2C1810',
    letterSpacing: -0.4,
  },
  modalSubtitle: {
    fontSize: 13.5,
    color: '#705746',
    fontWeight: '500',
    marginTop: 4,
    marginBottom: 18,
  },
  modalActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3EDE4',
  },
  actionIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionItemTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2C1810',
  },
  actionItemSub: {
    fontSize: 12.5,
    color: '#8C7B68',
    marginTop: 2,
  },
  modalCancelBtn: {
    marginTop: 16,
    backgroundColor: '#F5EFE6',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#705746',
  },

  // Date Modal Styles
  dateModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 14,
    maxHeight: '80%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  dateModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modalCloseIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5EFE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePreviewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDF4',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  datePreviewText: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#2C1810',
    marginLeft: 8,
    flex: 1,
  },
  datePreviewAgeTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  datePreviewAgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  pickerColumnsRow: {
    flexDirection: 'row',
    height: 220,
    gap: 8,
    marginBottom: 18,
  },
  pickerColumn: {
    flex: 1,
    backgroundColor: '#FAF7F2',
    borderRadius: 16,
    padding: 6,
    borderWidth: 1,
    borderColor: '#ECE0CE',
  },
  columnHeader: {
    fontSize: 11,
    fontWeight: '900',
    color: '#8C5A20',
    textAlign: 'center',
    paddingVertical: 4,
    letterSpacing: 0.6,
  },
  columnScroll: {
    flex: 1,
  },
  pickerItem: {
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
    marginVertical: 2,
  },
  pickerItemSelected: {
    backgroundColor: '#3D2314',
  },
  pickerItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#705746',
  },
  pickerItemTextSelected: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  confirmDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3D2314',
    height: 54,
    borderRadius: 16,
    shadowColor: '#3D2314',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  confirmDateBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
