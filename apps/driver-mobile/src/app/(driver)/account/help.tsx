import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '@/design-system';

const SUPPORT_PHONE = '+919800000000';
const SUPPORT_EMAIL = 'driversupport@cabzone.in';

const FAQS = [
  {
    q: 'How do I receive ride payments?',
    a: 'Passengers pay 100% of the agreed fare directly to you in Cash or via your personal UPI QR at the end of the trip. Confirm receipt in the app to settle the ride.',
  },
  {
    q: 'How is the 8% platform commission deducted?',
    a: 'When you confirm direct payment receipt, Cabzone records an 8% platform commission debit against your Driver Wallet balance.',
  },
  {
    q: 'Why can’t I go online?',
    a: 'Ensure your KYC is VERIFIED, a vehicle is linked, device GPS location permissions are granted, and you do not have an unresolved active ride or suspended wallet.',
  },
  {
    q: 'What if a passenger disputes payment?',
    a: 'If a ride enters PAYMENT_DISPUTED, our support team reviews the trip route and audit log. Contact Driver Support with your trip ID for rapid resolution.',
  },
];

export default function DriverHelpScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
          <Text style={styles.backText}>Account</Text>
        </Pressable>
        <Text style={styles.topTitle}>Support & Help</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>Cabzone Driver Support Desk</Text>
          <Text style={styles.contactSub}>
            Available daily for active ride issues, payment disputes, and document renewals.
          </Text>

          <View style={styles.actionRow}>
            <Pressable
              style={styles.callSupportBtn}
              onPress={() => void Linking.openURL(`tel:${SUPPORT_PHONE}`)}>
              <Ionicons name="call" size={18} color={colors.deepBrown} />
              <Text style={styles.callSupportText}>Call Support</Text>
            </Pressable>

            <Pressable
              style={styles.emailSupportBtn}
              onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
              <Ionicons name="mail-outline" size={18} color={colors.deepBrown} />
              <Text style={styles.emailSupportText}>Email Desk</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.faqCard}>
          <Text style={styles.faqHeader}>Frequently Asked Questions</Text>
          {FAQS.map((item, idx) => (
            <View key={item.q} style={[styles.faqItem, idx > 0 && styles.faqBorder]}>
              <Text style={styles.faqQ}>{item.q}</Text>
              <Text style={styles.faqA}>{item.a}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  scrollContent: { padding: 20, gap: 16 },
  contactCard: {
    backgroundColor: colors.cream,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  contactTitle: { fontSize: typography.sizes.lg, fontWeight: '800', color: colors.deepBrown },
  contactSub: { fontSize: typography.sizes.xs, color: colors.secondary, lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  callSupportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.amber,
  },
  callSupportText: { fontSize: typography.sizes.xs, fontWeight: '800', color: colors.deepBrown },
  emailSupportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emailSupportText: { fontSize: typography.sizes.xs, fontWeight: '800', color: colors.deepBrown },
  faqCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  faqHeader: { fontSize: typography.sizes.base, fontWeight: '800', color: colors.deepBrown },
  faqItem: { paddingTop: 10, gap: 4 },
  faqBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  faqQ: { fontSize: typography.sizes.xs, fontWeight: '800', color: colors.deepBrown },
  faqA: { fontSize: typography.sizes.xs, color: colors.secondary, lineHeight: 18 },
});
