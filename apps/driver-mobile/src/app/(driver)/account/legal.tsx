import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, createStyles } from '@/design-system';

export default function DriverLegalScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
          <Text style={styles.backText}>Account</Text>
        </Pressable>
        <Text style={styles.topTitle}>Terms & Platform Rules</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. Ride Payment</Text>
          <Text style={styles.body}>
            Passengers may pay cash to the driver or use Cabzone&apos;s in-app UPI payment. Confirm cash receipt only after receiving the full amount. Cabzone credits verified online ride earnings to the driver wallet after platform commission.
          </Text>

          <Text style={styles.sectionTitle}>2. Platform Commission (8%)</Text>
          <Text style={styles.body}>
            A standard 8% platform service fee (or the rate locked in the ride pricing snapshot) is debited from the Driver Wallet upon ride settlement. Wallet top-up credits maintain dispatch eligibility and are not counted as trip income.
          </Text>

          <Text style={styles.sectionTitle}>3. Location & Safety Telemetry</Text>
          <Text style={styles.body}>
            With location permission, the Cabzone Driver app can transmit GPS coordinates while you are online or on an assigned ride, including when the app is in the background. This supports nearby ride offers, pickup ETAs, and trip safety.
          </Text>

          <Text style={styles.sectionTitle}>4. Document Compliance</Text>
          <Text style={styles.body}>
            Driver Partners must maintain a valid Commercial Driving Licence, Registration Certificate (RC), Commercial Insurance, and Route Permit at all times.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = createStyles(() => ({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: typography.sizes.sm, fontWeight: '700', color: colors.deepBrown },
  topTitle: { fontSize: typography.sizes.base, fontWeight: '800', color: colors.deepBrown },
  scrollContent: { padding: 20 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  sectionTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '800',
    color: colors.deepBrown,
    marginTop: 6,
  },
  body: {
    fontSize: typography.sizes.xs,
    color: colors.secondary,
    lineHeight: 19,
  },
}));
