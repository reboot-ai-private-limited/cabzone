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
import { INDIAN_VEHICLE_REG_REGEX } from '@cabzone/contracts';
import type { OnboardingDraft } from './types';

interface StepVehicleInfoProps {
  draft: OnboardingDraft;
  onUpdate: (partial: Partial<OnboardingDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}

const CAB_MODELS = ['Maruti Dzire Tour', 'Hyundai Aura', 'Tata Tigor', 'Toyota Etios', 'Maruti WagonR'];
const ERICKSHAW_MODELS = ['Mahindra Treo', 'Piaggio Ape E-City', 'Saarthi Star', 'Yatri EV'];
const COLORS = ['White', 'Silver', 'Grey', 'Red', 'Yellow'];

export function StepVehicleInfo({
  draft,
  onUpdate,
  onNext,
  onBack,
}: StepVehicleInfoProps) {
  const [vehicleType, setVehicleType] = useState(draft.vehicleType);
  const [regNumber, setRegNumber] = useState(draft.registrationNumber || '');
  const [model, setModel] = useState(draft.model || (draft.vehicleType === 'CAB' ? 'Maruti Dzire Tour' : 'Mahindra Treo'));
  const [color, setColor] = useState(draft.color || 'White');

  const modelsList = vehicleType === 'CAB' ? CAB_MODELS : ERICKSHAW_MODELS;

  const handleRegChange = (text: string) => {
    // Uppercase and remove spaces/special chars
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    setRegNumber(cleaned);
  };

  const isRegValid = INDIAN_VEHICLE_REG_REGEX.test(regNumber);

  const handleContinue = () => {
    onUpdate({
      vehicleType,
      registrationNumber: regNumber,
      model,
      color,
      make: vehicleType === 'CAB' ? 'Maruti Suzuki' : 'Mahindra',
      manufactureYear: 2022,
    });
    onNext();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top row */}
        <View style={styles.topRow}>
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <View style={styles.stepCounterBadge}>
            <Text style={styles.stepCounterText}>3 of 6</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: '50%' }]} />
        </View>

        <Text style={styles.heading}>Your vehicle</Text>
        <Text style={styles.subheading}>Let&apos;s add your vehicle details for compliance verification</Text>

        {/* Vehicle Type Selector */}
        <View style={styles.typeSelectorRow}>
          <Pressable
            style={[styles.typeBtn, vehicleType === 'CAB' && styles.typeBtnActive]}
            onPress={() => {
              setVehicleType('CAB');
              setModel('Maruti Dzire Tour');
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
                onPress={() => setModel(m)}>
                <Text style={[styles.chipText, model === m && styles.chipTextActive]}>
                  {m}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Color Chips */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Vehicle colour</Text>
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
        </View>

        {/* Next Button */}
        <Pressable
          style={({ pressed }) => [
            styles.nextBtn,
            !isRegValid && styles.btnDisabled,
            pressed && styles.btnPressed,
          ]}
          onPress={handleContinue}
          disabled={!isRegValid}>
          <Text style={styles.nextBtnText}>Next →</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
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
  stepCounterBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  stepCounterText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4B5563',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    marginBottom: 28,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#002451',
    borderRadius: 3,
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
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  typeBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  typeBtnActive: {
    borderColor: '#002451',
    backgroundColor: '#FFFFFF',
  },
  typeIcon: {
    fontSize: 20,
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
  },
  typeLabelActive: {
    color: '#002451',
    fontWeight: '800',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111827',
  },
  regInput: {
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  helperText: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 6,
  },
  errorHint: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#002451',
    borderColor: '#002451',
  },
  chipText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  nextBtn: {
    marginTop: 16,
    backgroundColor: '#002451',
    borderRadius: 18,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#002451',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  btnDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  btnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  nextBtnText: {
    color: '#C8FF00',
    fontSize: 16,
    fontWeight: '800',
  },
});
