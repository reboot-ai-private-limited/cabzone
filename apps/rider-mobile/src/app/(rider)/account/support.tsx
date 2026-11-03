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

const FAQS = [
  {
    q: 'How does Cabzone fare negotiation work?',
    a: 'Cabzone computes a Suggested Fare from route distance and active city/state rates. You can request at the Suggested Fare or adjust your Proposed Fare within the allowed floor/ceiling range. Nearby drivers can either accept your fare immediately or send a counter-offer.',
  },
  {
    q: 'Why do I need to share a 4-digit Pickup OTP?',
    a: 'When your driver arrives at pickup, a 4-digit Pickup OTP is shown only in your app. The driver must enter this code to start the trip, ensuring you board the right verified vehicle.',
  },
  {
    q: 'How do I pay for my ride?',
    a: 'All Cabzone rides are paid directly to the driver at the end of the trip via Cash or the driver’s personal UPI QR at the locked Agreed Fare.',
  },
  {
    q: 'What if there is a payment issue or overcharge?',
    a: 'Open the completed trip from the Activity tab and tap "File Payment Dispute". Describe the issue and Cabzone Support will review the immutable ride event log.',
  },
];

export default function SupportScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
        </Pressable>
        <Text style={styles.topBarTitle}>Help & Disputes</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.supportHero}>
          <Ionicons name="help-buoy" size={28} color={colors.deepBrown} />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Need help with a trip?</Text>
            <Text style={styles.heroSub}>
              To report a payment discrepancy on a settled trip, open Activity → select your trip → tap &quot;File Payment Dispute&quot;.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionHeader}>FREQUENTLY ASKED QUESTIONS</Text>
        {FAQS.map((item) => (
          <View key={item.q} style={styles.faqCard}>
            <Text style={styles.faqQ}>{item.q}</Text>
            <Text style={styles.faqA}>{item.a}</Text>
          </View>
        ))}
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
  supportHero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.amber,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
  },
  heroTitle: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  heroSub: {
    ...typography.caption,
    color: colors.deepBrown,
    marginTop: 2,
  },
  sectionHeader: {
    ...typography.label,
    color: colors.brandBrown,
    marginTop: 6,
  },
  faqCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 6,
  },
  faqQ: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  faqA: {
    ...typography.caption,
    color: colors.secondary,
  },
}));
