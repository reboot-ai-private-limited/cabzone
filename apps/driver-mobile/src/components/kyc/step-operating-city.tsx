import { colors, typography } from '@/design-system';
import React, { useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CandyButton } from '@/components/buttons/candy-button';
import {
  OnboardingFormScroll,
  type OnboardingFormScrollHandle,
} from './onboarding-form-scroll';
import { resolveOperatingCitySelection } from './onboarding-ux-helpers';
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
    tag: 'Main Hub',
    tagColor: '#B45309',
    icon: 'business',
  },
  {
    id: 'bagdogra',
    name: 'Bagdogra / Airport',
    subtitle: 'Airport Corridor, Bihar More & Panighata',
    tag: 'Airport',
    tagColor: '#0369A1',
    icon: 'airplane',
  },
  {
    id: 'jalpaiguri',
    name: 'Jalpaiguri',
    subtitle: 'District Town, Mohitnagar & Circuit Bench',
    tag: 'High Demand',
    tagColor: '#B45309',
    icon: 'navigate',
  },
  {
    id: 'coochbehar',
    name: 'Cooch Behar',
    subtitle: 'Heritage City, New Cooch Behar & Baneswar',
    tag: 'Popular',
    tagColor: '#4338CA',
    icon: 'map',
  },
  {
    id: 'darjeeling',
    name: 'Darjeeling & Hills',
    subtitle: 'Hill Zone · Mall Rd, Ghoom, Kurseong & Mirik',
    tag: 'Hill Trips',
    tagColor: '#047857',
    icon: 'trail-sign',
  },
  {
    id: 'malbazar',
    name: 'Malbazar & Dooars',
    subtitle: 'Chalsa, Lataguri & Dooars Tourist Belt',
    tag: 'Tourist Zone',
    tagColor: '#047857',
    icon: 'leaf',
  },
  {
    id: 'alipurduar',
    name: 'Alipurduar',
    subtitle: 'Junction, Town & Dooars Gateway',
    tag: 'Gateway',
    tagColor: '#6D28D9',
    icon: 'train',
  },
];

const SUPPORTED_CITY_NAMES = SUPPORTED_CITIES.map((c) => c.name);

export function StepOperatingCity({
  draft,
  onUpdate,
  onNext,
  onBack,
}: StepOperatingCityProps) {
  const insets = useSafeAreaInsets();
  const formScrollRef = useRef<OnboardingFormScrollHandle>(null);
  const searchBoxRef = useRef<React.ComponentRef<typeof View>>(null);
  const customCardRef = useRef<React.ComponentRef<typeof View>>(null);
  const searchInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const customInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const [selectedCity, setSelectedCity] = useState(draft.city || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [customCity, setCustomCity] = useState('');
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [focusedField, setFocusedField] = useState<'search' | 'custom' | null>(null);

  const isSupportedHub = useMemo(
    () =>
      Boolean(
        selectedCity &&
          SUPPORTED_CITIES.some((c) => c.name.toLowerCase() === selectedCity.trim().toLowerCase()),
      ),
    [selectedCity],
  );

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
    Keyboard.dismiss();
    setSelectedCity(name);
    setCustomCity('');
    setIsAddingCustom(false);
    onUpdate({ city: name, isCustomCity: false });
  };

  const handleApplyCustomCity = () => {
    const trimmed = customCity.trim();
    if (trimmed.length >= 3) {
      Keyboard.dismiss();
      const matchedHub = SUPPORTED_CITIES.find(
        (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
      );
      const finalName = matchedHub ? matchedHub.name : trimmed;
      setSelectedCity(finalName);
      setCustomCity('');
      setIsAddingCustom(false);
      onUpdate({ city: finalName, isCustomCity: !matchedHub });
    }
  };

  const resolved = useMemo(
    () =>
      resolveOperatingCitySelection({
        selectedCity,
        isAddingCustom,
        customCity,
        supportedCityNames: SUPPORTED_CITY_NAMES,
      }),
    [selectedCity, isAddingCustom, customCity],
  );

  const handleContinue = () => {
    if (!resolved.canContinue) return;
    Keyboard.dismiss();
    setSelectedCity(resolved.city);
    setCustomCity('');
    setIsAddingCustom(false);
    onUpdate({
      city: resolved.city,
      isCustomCity: resolved.isCustomCity,
    });
    onNext();
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
          accessibilityLabel="Go back to personal information">
          <Ionicons name="arrow-back" size={20} color="#172B3A" />
        </Pressable>

        <View style={styles.stepBadge} accessibilityLabel="Step 2 of 6">
          <View style={styles.stepDot} />
          <Text style={styles.stepBadgeText}>Step 2 of 6</Text>
        </View>
      </View>

      {/* 6-Step Segmented Progress Bar */}
      <View style={styles.progressContainer} importantForAccessibility="no-hide-descendants">
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
          Select an active Cabzon hub, or request a new operating area for upcoming launch.
        </Text>
      </View>

      {/* Search Bar */}
      <View
        ref={searchBoxRef}
        collapsable={false}
        style={[
          styles.searchWrapper,
          focusedField === 'search' && styles.searchWrapperFocused,
        ]}>
        <Ionicons name="search" size={19} color="#8C5A20" style={styles.searchIcon} />
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder="Search city, area or district..."
          placeholderTextColor="#53616C"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => {
            setFocusedField('search');
            formScrollRef.current?.focusTarget(searchBoxRef.current);
          }}
          onBlur={() => setFocusedField((prev) => (prev === 'search' ? null : prev))}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => Keyboard.dismiss()}
          accessibilityLabel="Search operating city"
        />
        {searchQuery.length > 0 && (
          <Pressable
            onPress={() => setSearchQuery('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear city search">
            <Ionicons name="close-circle" size={18} color="#C4B5A5" />
          </Pressable>
        )}
      </View>

      {/* City Options List */}
      <View style={styles.cityList} accessibilityRole="radiogroup">
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
              accessibilityLabel={`${city.name}, ${city.subtitle}`}
              accessibilityState={{ selected: isSelected }}>
              {/* Left Icon */}
              <View style={[styles.cityIconBox, isSelected && styles.cityIconBoxSelected]}>
                <Ionicons name={city.icon} size={22} color={colors.darkNavy} />
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
                {isSelected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
              </View>
            </Pressable>
          );
        })}

        {/* Empty Search Fallback */}
        {filteredCities.length === 0 && (
          <View style={styles.noResultsCard}>
            <Ionicons name="location-outline" size={32} color="#D97706" style={{ marginBottom: 6 }} />
            <Text style={styles.noResultsTitle}>No active hub matches your search</Text>
            <Text style={styles.noResultsSub}>
              You can request a new operating area below. Dispatch in requested areas opens once Cabzon activates service in that region.
            </Text>
          </View>
        )}
      </View>

      {/* Custom City Request Section */}
      {!isAddingCustom ? (
        <Pressable
          style={({ pressed }) => [styles.addCustomCityBtn, pressed && styles.btnPressed]}
          onPress={() => {
            setIsAddingCustom(true);
            setTimeout(() => {
              customInputRef.current?.focus();
              formScrollRef.current?.focusTarget(customCardRef.current);
            }, 80);
          }}
          accessibilityRole="button"
          accessibilityLabel="Request a new operating area">
          <View style={styles.addCustomIconCircle}>
            <Ionicons name="add" size={18} color="#12304A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.addCustomTitle}>Request a new area</Text>
            <Text style={styles.addCustomSub}>
              Register interest for a town or district not yet in the active hub list
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#C4B5A5" />
        </Pressable>
      ) : (
        <View ref={customCardRef} collapsable={false} style={styles.customCityInputCard}>
          <Text style={styles.customInputLabel}>Request a new operating area:</Text>
          <View style={styles.customInputRow}>
            <View
              style={[
                styles.customInputBox,
                focusedField === 'custom' && styles.customInputBoxFocused,
              ]}>
              <TextInput
                ref={customInputRef}
                style={styles.customTextInput}
                placeholder="e.g. Raiganj, Islampur, Birpara"
                placeholderTextColor="#53616C"
                value={customCity}
                onChangeText={setCustomCity}
                onFocus={() => {
                  setFocusedField('custom');
                  formScrollRef.current?.focusTarget(customCardRef.current);
                }}
                onBlur={() => setFocusedField((prev) => (prev === 'custom' ? null : prev))}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={handleApplyCustomCity}
                accessibilityLabel="New operating area name"
              />
              {customCity.length > 0 && (
                <Pressable
                  onPress={() => setCustomCity('')}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Clear requested area">
                  <Ionicons name="close-circle" size={18} color="#C4B5A5" />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={handleApplyCustomCity}
              style={[
                styles.customApplyBtn,
                customCity.trim().length < 3 && styles.customApplyBtnDisabled,
              ]}
              disabled={customCity.trim().length < 3}
              accessibilityRole="button"
              accessibilityLabel="Apply requested area">
              <Text style={styles.customApplyBtnText}>Apply</Text>
            </Pressable>
          </View>
          <Text style={{ fontSize: 11.5, color: colors.secondary, marginTop: 6 }}>
            Note: Requested areas are recorded on your profile; live ride dispatch begins once Cabzon activates your zone.
          </Text>
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setCustomCity('');
              setIsAddingCustom(false);
            }}
            style={styles.cancelCustomBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Cancel custom area request">
            <Text style={styles.cancelCustomText}>Cancel</Text>
          </Pressable>
        </View>
      )}

      {/* Selected City Confirmation Banner */}
      {selectedCity ? (
        <View style={styles.selectedBanner}>
          <Ionicons name="location" size={18} color="#065F46" />
          <Text style={styles.selectedBannerText}>
            {isSupportedHub ? 'Active Hub: ' : 'Requested Area: '}
            <Text style={{ fontWeight: '800' }}>{selectedCity}</Text>
            {!isSupportedHub ? ' (Pending zone activation)' : ''}
          </Text>
        </View>
      ) : null}

      {/* Smart GPS Telemetry Note */}
      <View style={styles.noteBox}>
        <Ionicons name="flash" size={18} color="#D97706" style={{ marginRight: 10, marginTop: 1 }} />
        <Text style={styles.noteText}>
          <Text style={{ fontWeight: '700', color: colors.text }}>Zone Dispatch Policy: </Text>
          Active hubs receive live trip offers immediately after KYC approval. Requested areas will be notified when local service launches.
        </Text>
      </View>

      {/* Bottom CTA Button */}
      <View style={styles.ctaSection}>
        <CandyButton
          title="Continue to Vehicle Details"
          onPress={handleContinue}
          disabled={!resolved.canContinue}
          variant={resolved.canContinue ? 'espresso' : 'muted'}
          icon={
            <Ionicons
              name="arrow-forward"
              size={18}
              color={resolved.canContinue ? '#FFFFFF' : colors.secondary}
            />
          }
          style={{ width: '100%' }}
        />

        {resolved.prompt ? (
          <Text style={styles.validationPrompt} accessibilityRole="alert">
            {resolved.prompt}
          </Text>
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
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    height: 50,
    marginBottom: 16,
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  searchWrapperFocused: {
    borderColor: colors.darkNavy,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
    color: colors.text,
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
    borderColor: colors.border,
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cityCardSelected: {
    borderColor: colors.darkNavy,
    backgroundColor: colors.surface,
    shadowColor: colors.darkNavy,
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
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.text,
  },
  cityNameSelected: {
    color: colors.darkNavy,
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
    color: colors.secondary,
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
    borderColor: colors.darkNavy,
    backgroundColor: colors.darkNavy,
  },
  noResultsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: 6,
  },
  noResultsTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  noResultsSub: {
    fontSize: typography.sizes.sm,
    color: colors.secondary,
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
    borderColor: colors.border,
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
    fontSize: typography.sizes.label,
    fontWeight: '800',
    color: colors.text,
  },
  addCustomSub: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    fontWeight: '500',
  },
  customCityInputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: colors.darkNavy,
    marginBottom: 16,
  },
  customInputLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customInputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  customInputBoxFocused: {
    borderColor: colors.darkNavy,
    backgroundColor: '#FFFFFF',
  },
  customTextInput: {
    flex: 1,
    height: '100%',
    fontSize: 14.5,
    fontWeight: '600',
    color: colors.text,
    paddingVertical: 0,
  },
  customApplyBtn: {
    backgroundColor: colors.darkNavy,
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
    fontSize: typography.sizes.label,
  },
  cancelCustomBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 6,
  },
  cancelCustomText: {
    fontSize: 12.5,
    color: colors.darkNavy,
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
    color: colors.secondary,
    lineHeight: 18,
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
