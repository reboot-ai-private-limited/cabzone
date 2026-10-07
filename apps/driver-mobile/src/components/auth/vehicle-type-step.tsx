import React, { useState } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

interface VehicleTypeStepProps {
  onSelect: (type: 'CAB' | 'E_RICKSHAW') => void;
  onBack: () => void;
}

export function VehicleTypeStep({ onSelect, onBack }: VehicleTypeStepProps) {
  const [selectedType, setSelectedType] = useState<'CAB' | 'E_RICKSHAW' | null>(null);

  const handleSelect = (type: 'CAB' | 'E_RICKSHAW') => {
    setSelectedType(type);
    setTimeout(() => {
      onSelect(type);
    }, 200);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Back navigation */}
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>

        {/* Heading */}
        <View style={styles.titleSection}>
          <Text style={styles.heading}>What do you drive?</Text>
          <Text style={styles.subheading}>Choose your vehicle category to get started</Text>
        </View>

        {/* Options */}
        <View style={styles.cardList}>
          <VehicleCard
            type="CAB"
            icon="🚕"
            title="Car / Cab"
            subtitle="Offer city rides & outstation intercity trips"
            tag="Active Launch"
            isSelected={selectedType === 'CAB'}
            onPress={() => handleSelect('CAB')}
          />

          <VehicleCard
            type="E_RICKSHAW"
            icon="🛺"
            title="E-Rickshaw"
            subtitle="City local commutes, point-to-point and share trips"
            tag="Supported in Siliguri"
            isSelected={selectedType === 'E_RICKSHAW'}
            onPress={() => handleSelect('E_RICKSHAW')}
          />
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💡 You will be eligible for ride requests specifically configured for your vehicle type.
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
  isSelected,
  onPress,
}: {
  type: 'CAB' | 'E_RICKSHAW';
  icon: string;
  title: string;
  subtitle: string;
  tag: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  const [cardScale] = useState(() => new Animated.Value(1));
  const [iconScale] = useState(() => new Animated.Value(1));
  const reducedMotion = useReducedMotion();

  const handlePress = () => {
    if (!reducedMotion) {
      // 180ms: scale 1 -> 0.98 -> 1
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

      // Icon scale -> 1.04
      Animated.spring(iconScale, {
        toValue: 1.04,
        friction: 5,
        useNativeDriver: true,
      }).start();
    }
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale: cardScale }] }}>
      <Pressable
        onPress={handlePress}
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
          <Text style={[styles.chevron, isSelected && styles.chevronSelected]}>›</Text>
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
    borderColor: '#E5E7EB',
  },
  backArrow: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  titleSection: {
    marginBottom: 32,
  },
  heading: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.darkNavy,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 15,
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
    borderColor: '#E5E7EB',
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
    fontSize: 26,
  },
  chevron: {
    fontSize: 28,
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
    fontSize: 14,
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
    fontSize: 11,
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
    borderColor: '#E5E7EB',
  },
  infoText: {
    fontSize: 13,
    color: colors.secondary,
    lineHeight: 19,
  },
});
