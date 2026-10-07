import React, { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { OnboardingDraft } from './types';

interface StepOperatingCityProps {
  draft: OnboardingDraft;
  onUpdate: (partial: Partial<OnboardingDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}

const SUPPORTED_CITIES = [
  { id: 'siliguri', name: 'Siliguri', subtitle: 'Main Hub (Junction, Sevoke Rd, Matigara)' },
  { id: 'bagdogra', name: 'Bagdogra / Airport', subtitle: 'Airport Corridor & Panighata' },
  { id: 'jalpaiguri', name: 'Jalpaiguri', subtitle: 'District town & Mohitnagar' },
  { id: 'coochbehar', name: 'Cooch Behar', subtitle: 'Heritage City & New Cooch Behar' },
  { id: 'darjeeling', name: 'Darjeeling & Hills', subtitle: 'Hill zone (Outstation trips)' },
];

export function StepOperatingCity({
  draft,
  onUpdate,
  onNext,
  onBack,
}: StepOperatingCityProps) {
  const [selectedCity, setSelectedCity] = useState(draft.city || 'Siliguri');

  const handleContinue = () => {
    onUpdate({ city: selectedCity });
    onNext();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top bar with back and counter */}
        <View style={styles.topRow}>
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <View style={styles.stepCounterBadge}>
            <Text style={styles.stepCounterText}>2 of 6</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: '33.3%' }]} />
        </View>

        <Text style={styles.heading}>Where do you drive?</Text>
        <Text style={styles.subheading}>
          Select your primary operating city. You can accept outstation trips and update this anytime.
        </Text>

        {/* City Options List */}
        <View style={styles.cityList}>
          {SUPPORTED_CITIES.map((city) => {
            const isSelected = selectedCity === city.name;
            return (
              <Pressable
                key={city.id}
                style={[styles.cityCard, isSelected && styles.cityCardSelected]}
                onPress={() => setSelectedCity(city.name)}>
                <View style={styles.cityIconBox}>
                  <Text style={styles.cityIcon}>📍</Text>
                </View>
                <View style={styles.cityInfo}>
                  <Text style={[styles.cityName, isSelected && styles.cityNameSelected]}>
                    {city.name}
                  </Text>
                  <Text style={styles.citySubtitle}>{city.subtitle}</Text>
                </View>
                <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                  {isSelected ? <View style={styles.radioInner} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            💡 You do not need to manually configure geofence zones. Dispatch algorithms automatically route rides based on your real-time GPS telemetry.
          </Text>
        </View>

        {/* Next Button */}
        <Pressable
          style={({ pressed }) => [styles.nextBtn, pressed && styles.btnPressed]}
          onPress={handleContinue}>
          <Text style={styles.nextBtnText}>Next →</Text>
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
  cityList: {
    gap: 12,
    marginBottom: 24,
  },
  cityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  cityCardSelected: {
    borderColor: '#002451',
    backgroundColor: '#FFFFFF',
  },
  cityIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cityIcon: {
    fontSize: 20,
  },
  cityInfo: {
    flex: 1,
  },
  cityName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  cityNameSelected: {
    color: '#002451',
  },
  citySubtitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  radioCircleActive: {
    borderColor: '#002451',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#002451',
  },
  noteBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 24,
  },
  noteText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  nextBtn: {
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
