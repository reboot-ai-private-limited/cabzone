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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { INDIAN_VEHICLE_REG_REGEX } from '@cabzone/contracts';
import { CandyButton } from '@/components/buttons/candy-button';
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
  
  const [vehicleType, setVehicleType] = useState(draft.vehicleType);
  const [regNumber, setRegNumber] = useState(draft.registrationNumber || '');
  const [model, setModel] = useState(draft.model || (draft.vehicleType === 'CAB' ? 'Maruti Dzire Tour' : 'Mahindra Treo'));
  const [make, setMake] = useState(draft.make || '');
  const [color, setColor] = useState(draft.color || 'White');

  const modelsList = vehicleType === 'CAB' ? CAB_MODELS : ERICKSHAW_MODELS;

  const handleRegChange = (text: string) => {
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    setRegNumber(cleaned);
  };

  const isRegValid = INDIAN_VEHICLE_REG_REGEX.test(regNumber);
  const isValid = isRegValid && model.trim().length > 0 && make.trim().length > 0 && color.trim().length > 0;

  const handleContinue = () => {
    onUpdate({
      vehicleType,
      registrationNumber: regNumber,
      model: model.trim(),
      color: color.trim(),
      make: make.trim(),
      manufactureYear: 2022,
    });
    onNext();
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
            accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={20} color="#2C1810" />
          </Pressable>

          <View style={styles.stepBadge}>
            <View style={styles.stepDot} />
            <Text style={styles.stepBadgeText}>Step 3 of 6</Text>
          </View>
        </View>

        {/* 6-Step Segmented Progress Bar */}
        <View style={styles.progressContainer}>
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
            Let&apos;s add your vehicle details for compliance verification.
          </Text>
        </View>

        {/* Vehicle Type Selector */}
        <View style={styles.typeSelectorRow}>
          <Pressable
            style={[styles.typeBtn, vehicleType === 'CAB' && styles.typeBtnActive]}
            onPress={() => {
              setVehicleType('CAB');
              setModel('Maruti Dzire Tour');
              setMake('Maruti Suzuki');
            }}>
            <Text style={styles.typeIcon}>🚕</Text>
            <Text style={[styles.typeLabel, vehicleType === 'CAB' && styles.typeLabelActive]}>
              Cab / Car
            </Text>
          </Pressable>

          <Pressable
            style={[styles.typeBtn, vehicleType === 'E_RICKSHAW' && styles.typeBtnActive]}
            onPress={() => {
              setVehicleType('E_RICKSHAW');
              setModel('Mahindra Treo');
              setMake('Mahindra');
            }}>
            <Text style={styles.typeIcon}>🛺</Text>
            <Text style={[styles.typeLabel, vehicleType === 'E_RICKSHAW' && styles.typeLabelActive]}>
              E-Rickshaw
            </Text>
          </Pressable>
        </View>

        {/* Registration Number */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Registration number *</Text>
          <TextInput
            style={[styles.input, styles.regInput]}
            placeholder="e.g. WB74AB1234"
            placeholderTextColor="#9CA3AF"
            value={regNumber}
            onChangeText={handleRegChange}
            autoCapitalize="characters"
            maxLength={10}
          />
          {regNumber.length > 0 && !isRegValid ? (
            <Text style={styles.errorHint}>Format: State (2 letters) + District (1-2 digits) + Series + Number (e.g. WB74AB1234)</Text>
          ) : (
            <Text style={styles.helperText}>Must be a valid commercial or commercial-compliant registration number</Text>
          )}
        </View>

        {/* Model Chips */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Vehicle model *</Text>
          <View style={styles.chipsRow}>
            {modelsList.map((m) => (
              <Pressable
                key={m}
                style={[styles.chip, model === m && styles.chipActive]}
                onPress={() => {
                  setModel(m);
                  setMake(MODEL_MAKES[m] ?? '');
                }}>
                <Text style={[styles.chipText, model === m && styles.chipTextActive]}>
                  {m}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.helperText}>Or enter your model manually</Text>
          <TextInput
            style={[styles.input, styles.manualInput]}
            placeholder="Enter vehicle model"
            placeholderTextColor="#9CA3AF"
            value={model}
            onChangeText={(value) => {
              if (modelsList.includes(model)) setMake('');
              setModel(value);
            }}
            autoCapitalize="words"
            maxLength={50}
            accessibilityLabel="Vehicle model"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Manufacturer / make *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Maruti Suzuki"
            placeholderTextColor="#9CA3AF"
            value={make}
            onChangeText={setMake}
            autoCapitalize="words"
            maxLength={50}
            accessibilityLabel="Vehicle manufacturer"
          />
        </View>

        {/* Color Chips */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Vehicle colour *</Text>
          <View style={styles.chipsRow}>
            {COLORS.map((c) => (
              <Pressable
                key={c}
                style={[styles.chip, color === c && styles.chipActive]}
                onPress={() => setColor(c)}>
                <Text style={[styles.chipText, color === c && styles.chipTextActive]}>
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.helperText}>Or enter your vehicle colour manually</Text>
          <TextInput
            style={[styles.input, styles.manualInput]}
            placeholder="Enter vehicle colour"
            placeholderTextColor="#9CA3AF"
            value={color}
            onChangeText={setColor}
            autoCapitalize="words"
            maxLength={30}
            accessibilityLabel="Vehicle colour"
          />
        </View>

        <CandyButton
          title="Continue"
          onPress={handleContinue}
          disabled={!isValid}
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
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  typeBtn: {
    flex: 1,
    backgroundColor: '#FFFDF9',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ECE0CE',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  typeBtnActive: {
    borderColor: '#8C4A1B',
    backgroundColor: '#FFFFFF',
    shadowColor: '#8C4A1B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  typeIcon: {
    fontSize: 20,
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#705746',
  },
  typeLabelActive: {
    color: '#2C1810',
    fontWeight: '800',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#3D2314',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFDF9',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#ECE0CE',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#2C1810',
    fontWeight: '600',
  },
  regInput: {
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  helperText: {
    fontSize: 11.5,
    color: '#8C7B68',
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
    backgroundColor: '#FFFDF9',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#ECE0CE',
  },
  chipActive: {
    backgroundColor: '#3D2314',
    borderColor: '#3D2314',
    shadowColor: '#3D2314',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 2,
  },
  chipText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#705746',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  actionBtn: {
    marginTop: 16,
  },
});
