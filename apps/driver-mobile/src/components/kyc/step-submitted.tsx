import { colors, typography, createStyles } from '@/design-system';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

interface StepSubmittedProps {
  onGoHome: () => void;
}

export function StepSubmitted({ onGoHome }: StepSubmittedProps) {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.topSection}>
          {/* Big Green Check Circle */}
          <View style={styles.checkCircle}>
            <Text style={styles.checkIcon}>✓</Text>
          </View>

          <Text style={styles.title}>Application submitted</Text>
          <Text style={styles.subtitle}>You&apos;re all set.</Text>
          <Text style={styles.bodyText}>
            We&apos;re reviewing your documents. Usually, you&apos;ll be notified when your account is
            approved and ready to receive ride offers.
          </Text>

          {/* Stepper Card */}
          <View style={styles.statusCard}>
            <Text style={styles.statusHeader}>Application status</Text>
            <View style={styles.statusRow}>
              <Text style={styles.dotActive}>●</Text>
              <Text style={styles.statusTextActive}>Submitted</Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.dotPending}>○</Text>
              <Text style={styles.statusTextPending}>Under review</Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.dotPending}>○</Text>
              <Text style={styles.statusTextPending}>Approved</Text>
            </View>
          </View>
        </View>

        {/* Go to Home button */}
        <Pressable
          style={({ pressed }) => [styles.homeBtn, pressed && styles.btnPressed]}
          onPress={onGoHome}>
          <Text style={styles.homeBtnText}>Go to home</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = createStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'center',
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#86EFAC',
  },
  checkIcon: {
    fontSize: 40,
    fontWeight: '800',
    color: '#16A34A',
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#16A34A',
    marginBottom: 12,
    textAlign: 'center',
  },
  bodyText: {
    fontSize: typography.sizes.label,
    color: colors.secondary,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 12,
  },
  statusCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  statusHeader: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dotActive: {
    fontSize: typography.sizes.base,
    color: '#16A34A',
  },
  statusTextActive: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.text,
  },
  dotPending: {
    fontSize: typography.sizes.base,
    color: '#9CA3AF',
  },
  statusTextPending: {
    fontSize: typography.sizes.base,
    color: '#9CA3AF',
  },
  homeBtn: {
    backgroundColor: colors.darkNavy,
    borderRadius: 18,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 3,
  },
  btnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  homeBtnText: {
    color: colors.white,
    fontSize: typography.sizes.base,
    fontWeight: '800',
  },
}));
