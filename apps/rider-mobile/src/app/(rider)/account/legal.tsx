import React from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography, createStyles } from '@/design-system';

export default function LegalScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
        </Pressable>
        <Text style={styles.topBarTitle}>Terms, Privacy & Fare Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.heading}>1. Locked Pricing & Negotiation Snapshot</Text>
          <Text style={styles.body}>
            When you generate a quote and request a ride, the geographic classification (In-City, Outstation, or Interstate state segments) and pricing snapshot are locked. Neither the driver nor the platform can alter per-km rates mid-trip.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>2. Cash & UPI Payment</Text>
          <Text style={styles.body}>
            Pay the confirmed trip amount using an available in-app UPI option or cash. Cash is confirmed by the driver after receipt. UPI is confirmed only after Cabzone verifies the payment with its payment provider.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>3. Booking for Someone Else</Text>
          <Text style={styles.body}>
            When booking for another passenger, the account holder remains responsible for communicating the 4-digit Pickup OTP to the passenger and ensuring fair conduct and payment upon completion.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>4. Privacy & Location Data</Text>
          <Text style={styles.body}>
            Cabzone uses foreground location only to assist with pickup selection and route quoting. Your phone number and trip history are protected under Cabzone&apos;s zero-trust access controls.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = createStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 6,
  },
  heading: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  body: {
    ...typography.caption,
    color: colors.secondary,
  },
}));
