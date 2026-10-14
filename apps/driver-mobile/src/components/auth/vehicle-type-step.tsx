import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { VEHICLE_CATEGORY_REGISTRY } from '@cabzone/contracts';
import { colors, typography } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

interface VehicleTypeStepProps {
  onSelect: (type: 'CAB' | 'E_RICKSHAW') => void;
  onBack: () => void;
}

export function VehicleTypeStep({ onSelect, onBack }: VehicleTypeStepProps) {
  const [selectedType, setSelectedType] = useState<'CAB' | 'E_RICKSHAW' | null>(null);
  const cabActive = VEHICLE_CATEGORY_REGISTRY.CAB.status === 'ACTIVE';
  const erickshawActive = VEHICLE_CATEGORY_REGISTRY.E_RICKSHAW.status === 'ACTIVE';

  const handleSelect = (type: 'CAB' | 'E_RICKSHAW') => {
    if (VEHICLE_CATEGORY_REGISTRY[type].status !== 'ACTIVE') return;
    setSelectedType(type);
    setTimeout(() => {
      onSelect(type);
    }, 200);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Back navigation */}
        <Pressable
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backArrow}>←</Text>
        </Pressable>

        {/* Heading */}
        <View style={styles.titleSection}>
          <Text style={styles.heading}>What do you drive?</Text>
          <Text style={styles.subheading}>Choose an active vehicle category to get started</Text>
        </View>

        {/* Options */}
        <View style={styles.cardList} accessibilityRole="radiogroup">
          <VehicleCard
            type="CAB"
            icon="🚕"
            title="Car / Cab"
            subtitle="Offer city rides & outstation intercity trips"
            tag={cabActive ? 'Active Launch' : 'Coming Soon'}
            disabled={!cabActive}
            isSelected={selectedType === 'CAB'}
            onPress={() => handleSelect('CAB')}
          />

          <VehicleCard
            type="E_RICKSHAW"
            icon="🛺"
            title="E-Rickshaw"
            subtitle="Local city commutes — onboarding opens when E-Rickshaw dispatch launches"
            tag={erickshawActive ? 'Active Launch' : 'Coming Soon'}
            disabled={!erickshawActive}
            isSelected={selectedType === 'E_RICKSHAW'}
            onPress={() => handleSelect('E_RICKSHAW')}
          />
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💡 Cab / Car onboarding is currently active. E-Rickshaw registration is staged and will open once local E-Rickshaw dispatch is enabled.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function VehicleCard({
  icon,
  title,
  subtitle,
  tag,
  disabled,
  isSelected,
  onPress,
}: {
  type: 'CAB' | 'E_RICKSHAW';
  icon: string;
  title: string;
  subtitle: string;
  tag: string;
  disabled?: boolean;
  isSelected: boolean;
  onPress: () => void;
}) {
  const [cardScale] = useState(() => new Animated.Value(1));
  const [iconScale] = useState(() => new Animated.Value(1));
  const reducedMotion = useReducedMotion();

  const handlePress = () => {
    if (disabled) return;
    if (!reducedMotion) {
      Animated.sequence([
        Animated.timing(cardScale, {
          toValue: 0.98,
          duration: 90,
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 1,
          duration: 90,
          useNativeDriver: true,
        }),
      ]).start();

      Animated.spring(iconScale, {
        toValue: 1.04,
        friction: 5,
        useNativeDriver: true,
      }).start();
    }
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale: cardScale }], opacity: disabled ? 0.6 : 1 }}>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        accessibilityRole="radio"
        accessibilityLabel={`${title}, ${tag}`}
        accessibilityState={{ selected: isSelected, disabled: Boolean(disabled) }}
        style={[
          styles.optionCard,
          isSelected && styles.optionCardSelected,
        ]}
      >
        <View style={styles.cardHeader}>
          <Animated.View
            style={[
              styles.iconCircle,
              isSelected && styles.iconCircleSelected,
              { transform: [{ scale: iconScale }] },
            ]}
          >
            <Text style={styles.vehicleIcon}>{icon}</Text>
          </Animated.View>
          <Text style={[styles.chevron, isSelected && styles.chevronSelected]}>
            {disabled ? '🔒' : '›'}
          </Text>
        </View>
        <Text style={[styles.cardTitle, isSelected && styles.cardTitleSelected]}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
        <View style={[styles.tag, isSelected && styles.tagSelected]}>
          <Text style={[styles.tagText, isSelected && styles.tagTextSelected]}>{tag}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 36,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backArrow: {
    fontSize: typography.sizes.xl,
    fontWeight: '700',
    color: colors.text,
  },
  titleSection: {
    marginBottom: 32,
  },
  heading: {
    fontSize: typography.sizes.xxl,
    fontWeight: '800',
    color: colors.darkNavy,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: typography.sizes.base,
    color: colors.secondary,
    lineHeight: 22,
  },
  cardList: {
    gap: 16,
    marginBottom: 28,
  },
  optionCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  optionCardSelected: {
    borderColor: colors.cabzonBlue,
    backgroundColor: colors.softBlue,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleSelected: {
    backgroundColor: colors.lightBlue,
  },
  vehicleIcon: {
    fontSize: typography.sizes.xxl,
  },
  chevron: {
    fontSize: typography.sizes.xxl,
    color: '#9CA3AF',
    fontWeight: '300',
  },
  chevronSelected: {
    color: colors.cabzonBlue,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.darkNavy,
    marginBottom: 4,
  },
  cardTitleSelected: {
    color: colors.cabzonBlue,
  },
  cardSubtitle: {
    fontSize: typography.sizes.label,
    color: colors.secondary,
    lineHeight: 20,
    marginBottom: 14,
  },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagSelected: {
    backgroundColor: colors.lightBlue,
  },
  tagText: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: '#059669',
  },
  tagTextSelected: {
    color: colors.cabzonBlue,
  },
  infoBox: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: {
    fontSize: typography.sizes.sm,
    color: colors.secondary,
    lineHeight: 19,
  },
});
