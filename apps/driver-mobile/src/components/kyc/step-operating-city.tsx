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
import { CandyButton } from '@/components/buttons/candy-button';
import type { OnboardingDraft } from './types';

interface StepOperatingCityProps {
  draft: OnboardingDraft;
  onUpdate: (partial: Partial<OnboardingDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}

interface CityItem {
  id: string;
  name: string;
  subtitle: string;
  tag?: string;
  tagColor?: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const SUPPORTED_CITIES: CityItem[] = [
  {
    id: 'siliguri',
    name: 'Siliguri',
    subtitle: 'Main Hub · Junction, Sevoke Rd, Matigara & City Centre',
    tag: 'Main Hub 🔥',
    tagColor: '#B45309',
    icon: 'business',
  },
  {
    id: 'bagdogra',
    name: 'Bagdogra / Airport',
    subtitle: 'Airport Corridor, Bihar More & Panighata',
    tag: 'Airport ✈️',
    tagColor: '#0369A1',
    icon: 'airplane',
  },
  {
    id: 'jalpaiguri',
    name: 'Jalpaiguri',
    subtitle: 'District Town, Mohitnagar & Circuit Bench',
    tag: 'High Demand ⚡',
    tagColor: '#B45309',
    icon: 'navigate',
  },
  {
    id: 'coochbehar',
    name: 'Cooch Behar',
    subtitle: 'Heritage City, New Cooch Behar & Baneswar',
    tag: 'Popular 🛣️',
    tagColor: '#4338CA',
    icon: 'map',
  },
  {
    id: 'darjeeling',
    name: 'Darjeeling & Hills',
    subtitle: 'Hill Zone · Mall Rd, Ghoom, Kurseong & Mirik',
    tag: 'Hill Trips 🏔️',
    tagColor: '#047857',
    icon: 'trail-sign',
  },
  {
    id: 'malbazar',
    name: 'Malbazar & Dooars',
    subtitle: 'Chalsa, Lataguri & Dooars Tourist Belt',
    tag: 'Tourist Zone 🌿',
    tagColor: '#047857',
    icon: 'leaf',
  },
  {
    id: 'alipurduar',
    name: 'Alipurduar',
    subtitle: 'Junction, Town & Dooars Gateway',
    tag: 'Gateway 🚊',
    tagColor: '#6D28D9',
    icon: 'train',
  },
];

export function StepOperatingCity({
  draft,
  onUpdate,
  onNext,
  onBack,
}: StepOperatingCityProps) {
  const insets = useSafeAreaInsets();
  const [selectedCity, setSelectedCity] = useState(draft.city || 'Siliguri');
  const [searchQuery, setSearchQuery] = useState('');
  const [customCity, setCustomCity] = useState('');
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  // Filter cities based on search
  const filteredCities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SUPPORTED_CITIES;
    return SUPPORTED_CITIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        (c.tag && c.tag.toLowerCase().includes(q)),
    );
  }, [searchQuery]);

  const handleSelectCity = (name: string) => {
    setSelectedCity(name);
    setIsAddingCustom(false);
  };

  const handleApplyCustomCity = () => {
    const trimmed = customCity.trim();
    if (trimmed.length >= 3) {
      setSelectedCity(trimmed);
      setIsAddingCustom(false);
    }
  };

  const handleContinue = () => {
    if (!selectedCity) return;
    onUpdate({ city: selectedCity });
    onNext();
  };

  const isSelectedValid = Boolean(selectedCity && selectedCity.trim().length >= 2);

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
            accessibilityLabel="Go back to personal information">
            <Ionicons name="arrow-back" size={20} color="#2C1810" />
          </Pressable>

          <View style={styles.stepBadge}>
            <View style={styles.stepDot} />
            <Text style={styles.stepBadgeText}>Step 2 of 6</Text>
          </View>
        </View>

        {/* 6-Step Segmented Progress Bar */}
        <View style={styles.progressContainer}>
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <View
              key={s}
              style={[
                styles.progressSegment,
                s <= 2 ? styles.progressSegmentActive : styles.progressSegmentInactive,
              ]}
            />
          ))}
        </View>

        {/* Headline & Subhead */}
        <View style={styles.titleSection}>
          <Text style={styles.heading}>Where do you drive?</Text>
          <Text style={styles.subheading}>
            Select your primary operating base. You will automatically receive local and outstation trip requests in this region.
          </Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchWrapper}>
          <Ionicons name="search" size={19} color="#8C5A20" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search city, area or district..."
            placeholderTextColor="#A89A88"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#C4B5A5" />
            </Pressable>
          )}
        </View>

        {/* City Options List */}
        <View style={styles.cityList}>
          {filteredCities.map((city) => {
            const isSelected = selectedCity.toLowerCase() === city.name.toLowerCase();
            return (
              <Pressable
                key={city.id}
                style={({ pressed }) => [
                  styles.cityCard,
                  isSelected && styles.cityCardSelected,
                  pressed && styles.btnPressed,
                ]}
                onPress={() => handleSelectCity(city.name)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}>
                {/* Left Icon */}
                <View style={[styles.cityIconBox, isSelected && styles.cityIconBoxSelected]}>
                  <Ionicons
                    name={city.icon}
                    size={22}
                    color={isSelected ? '#3D2314' : '#8C4A1B'}
                  />
                </View>

                {/* City Info */}
                <View style={styles.cityInfo}>
                  <View style={styles.cityNameRow}>
                    <Text style={[styles.cityName, isSelected && styles.cityNameSelected]}>
                      {city.name}
                    </Text>
                    {city.tag && (
                      <View style={styles.tagBadge}>
                        <Text style={[styles.tagText, { color: city.tagColor || '#B45309' }]}>
                          {city.tag}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.citySubtitle}>{city.subtitle}</Text>
                </View>

                {/* Radio Indicator */}
                <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                  {isSelected && (
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  )}
                </View>
              </Pressable>
            );
          })}

          {/* Empty Search Fallback */}
          {filteredCities.length === 0 && (
            <View style={styles.noResultsCard}>
              <Ionicons name="location-outline" size={32} color="#D97706" style={{ marginBottom: 6 }} />
              <Text style={styles.noResultsTitle}>No matching city found</Text>
              <Text style={styles.noResultsSub}>
                You can add your own city below to operate in your preferred location.
              </Text>
            </View>
          )}
        </View>

        {/* Custom City Entry Section */}
        {!isAddingCustom ? (
          <Pressable
            style={({ pressed }) => [styles.addCustomCityBtn, pressed && styles.btnPressed]}
            onPress={() => setIsAddingCustom(true)}>
            <View style={styles.addCustomIconCircle}>
              <Ionicons name="add" size={18} color="#8C4A1B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.addCustomTitle}>Operating in another city?</Text>
              <Text style={styles.addCustomSub}>Enter your district or town name</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#C4B5A5" />
          </Pressable>
        ) : (
          <View style={styles.customCityInputCard}>
            <Text style={styles.customInputLabel}>Enter your operating city name:</Text>
            <View style={styles.customInputRow}>
              <TextInput
                style={styles.customTextInput}
                placeholder="e.g. Raiganj, Islampur, Birpara"
                placeholderTextColor="#A89A88"
                value={customCity}
                onChangeText={setCustomCity}
                autoFocus
                autoCapitalize="words"
              />
              <Pressable
                onPress={handleApplyCustomCity}
                style={[
                  styles.customApplyBtn,
                  customCity.trim().length < 3 && styles.customApplyBtnDisabled,
                ]}
                disabled={customCity.trim().length < 3}>
                <Text style={styles.customApplyBtnText}>Select</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => setIsAddingCustom(false)}
              style={styles.cancelCustomBtn}
              hitSlop={8}>
              <Text style={styles.cancelCustomText}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {/* Selected City Confirmation Banner */}
        {selectedCity && (
          <View style={styles.selectedBanner}>
            <Ionicons name="location" size={18} color="#065F46" />
            <Text style={styles.selectedBannerText}>
              Selected: <Text style={{ fontWeight: '800' }}>{selectedCity}</Text>
            </Text>
          </View>
        )}

        {/* Smart GPS Telemetry Note */}
        <View style={styles.noteBox}>
          <Ionicons name="flash" size={18} color="#D97706" style={{ marginRight: 10, marginTop: 1 }} />
          <Text style={styles.noteText}>
            <Text style={{ fontWeight: '700', color: '#2C1810' }}>Smart Dispatch: </Text>
            You are never restricted to strict borders. When on duty, Cabzon matches you with incoming trip requests based on your live GPS location.
          </Text>
        </View>

        {/* Bottom CTA Button */}
        <View style={styles.ctaSection}>
          <CandyButton
            title="Continue to Vehicle Details"
            onPress={handleContinue}
            disabled={!isSelectedValid}
            variant={isSelectedValid ? 'espresso' : 'muted'}
            icon={<Ionicons name="arrow-forward" size={18} color={isSelectedValid ? '#FFFFFF' : '#B3A48C'} />}
            style={{ width: '100%' }}
          />

          {!isSelectedValid && (
            <Text style={styles.validationPrompt}>• Please select an operating city to continue</Text>
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
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#ECE0CE',
    paddingHorizontal: 14,
    height: 50,
    marginBottom: 16,
    shadowColor: '#3D2314',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
    color: '#2C1810',
    paddingVertical: 0,
  },
  cityList: {
    gap: 10,
    marginBottom: 16,
  },
  cityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ECE0CE',
    shadowColor: '#3D2314',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cityCardSelected: {
    borderColor: '#8C4A1B',
    backgroundColor: '#FFFDF9',
    shadowColor: '#8C4A1B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  cityIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  cityIconBoxSelected: {
    backgroundColor: '#FDE68A',
  },
  cityInfo: {
    flex: 1,
  },
  cityNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 3,
  },
  cityName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2C1810',
  },
  cityNameSelected: {
    color: '#3D2314',
  },
  tagBadge: {
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  tagText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  citySubtitle: {
    fontSize: 12.5,
    color: '#705746',
    fontWeight: '500',
    lineHeight: 16,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1C4B5',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  radioCircleActive: {
    borderColor: '#3D2314',
    backgroundColor: '#3D2314',
  },
  noResultsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ECE0CE',
    marginVertical: 6,
  },
  noResultsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2C1810',
    marginBottom: 4,
  },
  noResultsSub: {
    fontSize: 13,
    color: '#705746',
    textAlign: 'center',
    lineHeight: 18,
  },
  addCustomCityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.2,
    borderColor: '#ECE0CE',
    borderStyle: 'dashed',
    marginBottom: 16,
  },
  addCustomIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  addCustomTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2C1810',
  },
  addCustomSub: {
    fontSize: 12,
    color: '#705746',
    fontWeight: '500',
  },
  customCityInputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#8C4A1B',
    marginBottom: 16,
  },
  customInputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2C1810',
    marginBottom: 8,
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customTextInput: {
    flex: 1,
    height: 48,
    backgroundColor: '#FFFDF9',
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#ECE0CE',
    paddingHorizontal: 14,
    fontSize: 14.5,
    fontWeight: '600',
    color: '#2C1810',
  },
  customApplyBtn: {
    backgroundColor: '#3D2314',
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customApplyBtnDisabled: {
    backgroundColor: '#D1C4B5',
  },
  customApplyBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  cancelCustomBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 4,
  },
  cancelCustomText: {
    fontSize: 12.5,
    color: '#8C4A1B',
    fontWeight: '700',
  },
  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 14,
  },
  selectedBannerText: {
    fontSize: 13.5,
    color: '#065F46',
    marginLeft: 8,
    fontWeight: '600',
  },
  noteBox: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.2,
    borderColor: '#FDE68A',
    marginBottom: 24,
  },
  noteText: {
    flex: 1,
    fontSize: 12.5,
    color: '#705746',
    lineHeight: 18,
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
