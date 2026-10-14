import { colors, typography } from '@/design-system';
import React, { useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VEHICLE_CATEGORY_REGISTRY } from '@cabzone/contracts';
import { CandyButton } from '@/components/buttons/candy-button';
import { useAuth } from '@/context/auth-context';
import { driverApi } from '@/services/api';
import {
  isValidRegistrationNumber,
  MAX_VEHICLE_REG_LENGTH,
  MIN_VEHICLE_YEAR,
  normalizeRegistrationNumber,
  validateManufactureYear,
} from '@/services/profile';
import type { OnboardingDraft } from './types';

interface StepVehicleInfoProps {
  draft: OnboardingDraft;
  onUpdate: (partial: Partial<OnboardingDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}

const CAB_MODELS = ['Maruti Dzire Tour', 'Hyundai Aura', 'Tata Tigor', 'Toyota Etios', 'Maruti WagonR'];
const ERICKSHAW_MODELS = ['Mahindra Treo', 'Piaggio Ape E-City', 'Saarthi Star', 'Yatri EV'];
const MODEL_MAKES: Record<string, string> = {
  'Maruti Dzire Tour': 'Maruti Suzuki',
  'Hyundai Aura': 'Hyundai',
  'Tata Tigor': 'Tata',
  'Toyota Etios': 'Toyota',
  'Maruti WagonR': 'Maruti Suzuki',
  'Mahindra Treo': 'Mahindra',
  'Piaggio Ape E-City': 'Piaggio',
  'Saarthi Star': 'Saarthi',
  'Yatri EV': 'Yatri',
};
const COLORS = ['White', 'Silver', 'Grey', 'Red', 'Yellow'];

export function StepVehicleInfo({
  draft,
  onUpdate,
  onNext,
  onBack,
}: StepVehicleInfoProps) {
  const insets = useSafeAreaInsets();
  const { token, refreshProfile } = useAuth();

  const [vehicleType, setVehicleType] = useState<'CAB' | 'E_RICKSHAW'>(
    draft.vehicleType === 'E_RICKSHAW' && VEHICLE_CATEGORY_REGISTRY.E_RICKSHAW.status === 'ACTIVE'
      ? 'E_RICKSHAW'
      : 'CAB',
  );
  const [regNumber, setRegNumber] = useState(
    normalizeRegistrationNumber(draft.registrationNumber || ''),
  );
  const [regTouched, setRegTouched] = useState(false);

  // Preserve model & make per vehicle category so switching never loses manual edits
  const [byType, setByType] = useState<{
    CAB: { model: string; make: string };
    E_RICKSHAW: { model: string; make: string };
  }>(() => ({
    CAB: {
      model: draft.vehicleType === 'CAB' ? draft.model || '' : '',
      make: draft.vehicleType === 'CAB' ? draft.make || '' : '',
    },
    E_RICKSHAW: {
      model: draft.vehicleType === 'E_RICKSHAW' ? draft.model || '' : '',
      make: draft.vehicleType === 'E_RICKSHAW' ? draft.make || '' : '',
    },
  }));

  const [color, setColor] = useState(draft.color || '');
  const [yearText, setYearText] = useState(
    draft.manufactureYear !== null && draft.manufactureYear !== undefined
      ? String(draft.manufactureYear)
      : '',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const model = byType[vehicleType].model;
  const make = byType[vehicleType].make;
  const modelsList = vehicleType === 'CAB' ? CAB_MODELS : ERICKSHAW_MODELS;
  const erickshawActive = VEHICLE_CATEGORY_REGISTRY.E_RICKSHAW.status === 'ACTIVE';

  const setModelAndMake = (nextModel: string, nextMake?: string) => {
    setByType((prev) => ({
      ...prev,
      [vehicleType]: {
        model: nextModel,
        make: nextMake !== undefined ? nextMake : prev[vehicleType].make,
      },
    }));
    onUpdate({
      model: nextModel,
      ...(nextMake !== undefined ? { make: nextMake } : {}),
    });
  };

  const handleRegChange = (text: string) => {
    const cleaned = normalizeRegistrationNumber(text);
    setRegNumber(cleaned);
    setSaveError(null);
    onUpdate({ registrationNumber: cleaned });
  };

  const isRegValid = isValidRegistrationNumber(regNumber);
  const yearValidation = useMemo(() => validateManufactureYear(yearText), [yearText]);
  const isCategoryActive = VEHICLE_CATEGORY_REGISTRY[vehicleType].status === 'ACTIVE';
  const isValid =
    isCategoryActive &&
    isRegValid &&
    model.trim().length > 0 &&
    make.trim().length > 0 &&
    color.trim().length > 0 &&
    yearValidation.valid;

  const handleContinue = async () => {
    setRegTouched(true);
    if (!isValid || isSaving) return;

    const updatedFields: Partial<OnboardingDraft> = {
      vehicleType,
      registrationNumber: regNumber,
      model: model.trim(),
      make: make.trim(),
      color: color.trim(),
      manufactureYear: yearValidation.year,
    };
    onUpdate(updatedFields);

    if (!token) {
      onNext();
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      if (draft.city) {
        await driverApi.saveProfile(token, { address: draft.city });
      }
      await driverApi.registerVehicle(token, {
        vehicleType,
        make: make.trim(),
        model: model.trim(),
        registrationNumber: regNumber,
        color: color.trim(),
        manufactureYear: yearValidation.year,
      });
      await refreshProfile();
      onNext();
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : 'Could not register vehicle. Please check the registration number and try again.',
      );
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
            style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back to operating city">
            <Ionicons name="chevron-back" size={20} color="#172B3A" />
          </Pressable>

          <View style={styles.stepBadge} accessibilityLabel="Step 3 of 6">
            <View style={styles.stepDot} />
            <Text style={styles.stepBadgeText}>Step 3 of 6</Text>
          </View>
        </View>

        {/* 6-Step Segmented Progress Bar */}
        <View style={styles.progressContainer} importantForAccessibility="no-hide-descendants">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <View
              key={s}
              style={[
                styles.progressSegment,
                s <= 3 ? styles.progressSegmentActive : styles.progressSegmentInactive,
              ]}
            />
          ))}
        </View>

        {/* Headline & Subhead */}
        <View style={styles.titleSection}>
          <Text style={styles.heading}>Your vehicle</Text>
          <Text style={styles.subheading}>
            Add your vehicle details as shown on your Registration Certificate (RC).
          </Text>
        </View>

        {/* Vehicle Type Selector */}
        <View style={styles.typeSelectorRow} accessibilityRole="radiogroup">
          <Pressable
            style={[styles.typeBtn, vehicleType === 'CAB' && styles.typeBtnActive]}
            onPress={() => {
              setVehicleType('CAB');
              onUpdate({ vehicleType: 'CAB' });
            }}
            accessibilityRole="radio"
            accessibilityLabel="Cab or Car, Active"
            accessibilityState={{ selected: vehicleType === 'CAB' }}>
            <Text style={styles.typeIcon}>🚕</Text>
            <Text style={[styles.typeLabel, vehicleType === 'CAB' && styles.typeLabelActive]}>
              Cab / Car
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.typeBtn,
              vehicleType === 'E_RICKSHAW' && styles.typeBtnActive,
              !erickshawActive && { opacity: 0.55 },
            ]}
            disabled={!erickshawActive}
            onPress={() => {
              if (!erickshawActive) return;
              setVehicleType('E_RICKSHAW');
              onUpdate({ vehicleType: 'E_RICKSHAW' });
            }}
            accessibilityRole="radio"
            accessibilityLabel={`E-Rickshaw, ${erickshawActive ? 'Active' : 'Coming Soon'}`}
            accessibilityState={{
              selected: vehicleType === 'E_RICKSHAW',
              disabled: !erickshawActive,
            }}>
            <Text style={styles.typeIcon}>🛺</Text>
            <View>
              <Text style={[styles.typeLabel, vehicleType === 'E_RICKSHAW' && styles.typeLabelActive]}>
                E-Rickshaw
              </Text>
              {!erickshawActive && (
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#B45309' }}>
                  Coming Soon
                </Text>
              )}
            </View>
          </Pressable>
        </View>

        {/* Registration Number (up to 11 chars) */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Registration number *</Text>
          <TextInput
            style={[styles.input, styles.regInput]}
            placeholder="e.g. WB74AB1234"
            placeholderTextColor="#9CA3AF"
            value={regNumber}
            onChangeText={handleRegChange}
            onBlur={() => setRegTouched(true)}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={MAX_VEHICLE_REG_LENGTH}
            accessibilityLabel="Vehicle registration number, required"
          />
          {(regTouched || regNumber.length >= 8) && regNumber.length > 0 && !isRegValid ? (
            <Text style={styles.errorHint} accessibilityRole="alert">
              Enter a valid Indian registration number: State (2 letters) + District (1–2 digits) + Series (0–3 letters) + 4 digits (e.g. WB74AB1234)
            </Text>
          ) : (
            <Text style={styles.helperText}>
              Up to 11 characters without spaces or hyphens (e.g. WB74AB1234 or DL1CAB1234)
            </Text>
          )}
        </View>

        {/* Model Presets & Manual Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Vehicle model *</Text>
          <Text style={[styles.helperText, { marginTop: 0, marginBottom: 8 }]}>
            Quick-select a common model or type yours below:
          </Text>
          <View style={styles.chipsRow} accessibilityRole="radiogroup">
            {modelsList.map((m) => {
              const selected = model === m;
              return (
                <Pressable
                  key={m}
                  style={[styles.chip, selected && styles.chipActive]}
                  onPress={() => setModelAndMake(m, MODEL_MAKES[m] ?? make)}
                  accessibilityRole="radio"
                  accessibilityLabel={`Preset model ${m}`}
                  accessibilityState={{ selected }}>
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                    {m}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={[styles.input, styles.manualInput]}
            placeholder="Or type your vehicle model (e.g. Swift Dzire)"
            placeholderTextColor="#9CA3AF"
            value={model}
            onChangeText={(value) => setModelAndMake(value)}
            autoCapitalize="words"
            maxLength={50}
            accessibilityLabel="Vehicle model, required"
          />
        </View>

        {/* Manufacturer / Make */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Manufacturer / make *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Maruti Suzuki, Hyundai, Tata"
            placeholderTextColor="#9CA3AF"
            value={make}
            onChangeText={(val) => setModelAndMake(model, val)}
            autoCapitalize="words"
            maxLength={50}
            accessibilityLabel="Vehicle manufacturer, required"
          />
        </View>

        {/* Color Chips & Manual Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Vehicle colour *</Text>
          <View style={styles.chipsRow} accessibilityRole="radiogroup">
            {COLORS.map((c) => {
              const selected = color === c;
              return (
                <Pressable
                  key={c}
                  style={[styles.chip, selected && styles.chipActive]}
                  onPress={() => {
                    setColor(c);
                    onUpdate({ color: c });
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={`Colour ${c}`}
                  accessibilityState={{ selected }}>
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                    {c}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={[styles.input, styles.manualInput]}
            placeholder="Select above or type vehicle colour"
            placeholderTextColor="#9CA3AF"
            value={color}
            onChangeText={(val) => {
              setColor(val);
              onUpdate({ color: val });
            }}
            autoCapitalize="words"
            maxLength={30}
            accessibilityLabel="Vehicle colour, required"
          />
        </View>

        {/* Manufacture Year (Optional, never silently hardcoded) */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Manufacture year (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder={`e.g. 2021 (${MIN_VEHICLE_YEAR}–${new Date().getFullYear() + 1})`}
            placeholderTextColor="#9CA3AF"
            value={yearText}
            onChangeText={(val) => {
              const digits = val.replace(/\D/g, '').slice(0, 4);
              setYearText(digits);
              const check = validateManufactureYear(digits);
              if (check.valid) {
                onUpdate({ manufactureYear: check.year });
              }
            }}
            keyboardType="number-pad"
            maxLength={4}
            accessibilityLabel="Vehicle manufacture year, optional"
          />
          {!yearValidation.valid && yearValidation.error ? (
            <Text style={styles.errorHint} accessibilityRole="alert">
              {yearValidation.error}
            </Text>
          ) : (
            <Text style={styles.helperText}>
              Leave blank if unknown, or enter the 4-digit model year from your RC.
            </Text>
          )}
        </View>

        {saveError ? (
          <View
            accessibilityRole="alert"
            style={{
              backgroundColor: '#FEE2E2',
              borderRadius: 14,
              padding: 12,
              borderWidth: 1,
              borderColor: '#FCA5A5',
              marginBottom: 12,
            }}>
            <Text style={{ color: '#991B1B', fontSize: typography.sizes.sm, fontWeight: '700' }}>
              ⚠️ {saveError}
            </Text>
          </View>
        ) : null}

        <CandyButton
          title="Save & Continue"
          onPress={() => void handleContinue()}
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

        {!isValid && (
          <Text
            style={{
              fontSize: 12.5,
              color: colors.darkNavy,
              fontWeight: '600',
              marginTop: 10,
              textAlign: 'center',
            }}>
            {!isRegValid
              ? '• Enter a valid registration number to continue'
              : !model.trim()
                ? '• Select or type your vehicle model'
                : !make.trim()
                  ? '• Enter the vehicle manufacturer / make'
                  : !color.trim()
                    ? '• Select or type your vehicle colour'
                    : !yearValidation.valid
                      ? `• ${yearValidation.error}`
                      : '• Complete required vehicle fields'}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  typeBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  typeBtnActive: {
    borderColor: colors.darkNavy,
    backgroundColor: '#FFFFFF',
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  typeIcon: {
    fontSize: 20,
  },
  typeLabel: {
    fontSize: typography.sizes.label,
    fontWeight: '700',
    color: colors.secondary,
  },
  typeLabelActive: {
    color: colors.text,
    fontWeight: '800',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.darkNavy,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: typography.sizes.base,
    color: colors.text,
    fontWeight: '600',
  },
  regInput: {
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  helperText: {
    fontSize: 11.5,
    color: colors.secondary,
    marginTop: 6,
    fontWeight: '500',
  },
  manualInput: {
    marginTop: 8,
  },
  errorHint: {
    fontSize: 11.5,
    color: '#DC2626',
    marginTop: 6,
    fontWeight: '600',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.darkNavy,
    borderColor: colors.darkNavy,
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 2,
  },
  chipText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.secondary,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  actionBtn: {
    marginTop: 16,
  },
});
