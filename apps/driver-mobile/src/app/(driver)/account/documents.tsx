import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth-context';
import { colors, typography } from '@/design-system';

const DOC_LABELS: Record<string, string> = {
  GOVERNMENT_ID: 'Government Identity Proof (Aadhaar / PAN / Voter ID)',
  DRIVING_LICENSE: 'Commercial Driving Licence',
  REGISTRATION_CERTIFICATE: 'Vehicle Registration Certificate (RC)',
  INSURANCE: 'Vehicle Commercial Insurance',
  PERMIT: 'Commercial Route / Fitness Permit',
};

export default function DriverDocumentsScreen() {
  const router = useRouter();
  const { driver, documents } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
          <Text style={styles.backText}>Account</Text>
        </Pressable>
        <Text style={styles.topTitle}>Compliance Documents</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>OVERALL KYC STATUS</Text>
          <Text style={styles.summaryValue}>{driver?.kycStatus || 'VERIFIED'}</Text>
          {driver?.dlNumber ? (
            <Text style={styles.summarySub}>Driving Licence: {driver.dlNumber}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Uploaded Documents</Text>
          {documents.length === 0 ? (
            <Text style={styles.emptyText}>No document records found.</Text>
          ) : (
            documents.map((doc) => {
              const isVerified = doc.verificationStatus === 'VERIFIED';
              const isExpired =
                doc.verificationStatus === 'EXPIRED' ||
                Boolean(doc.expiresAt && new Date(doc.expiresAt) < new Date());

              return (
                <View key={doc.id} style={styles.docRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docName}>{DOC_LABELS[doc.type] || doc.type}</Text>
                    {doc.documentNumberMasked ? (
                      <Text style={styles.docMeta}>Ref: {doc.documentNumberMasked}</Text>
                    ) : null}
                    <Text style={styles.docMeta}>
                      {doc.expiresAt
                        ? `Expires: ${new Date(doc.expiresAt).toLocaleDateString('en-IN')}`
                        : 'No expiry required'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      isExpired
                        ? styles.badgeRed
                        : isVerified
                          ? styles.badgeGreen
                          : styles.badgeAmber,
                    ]}>
                    <Text
                      style={[
                        styles.badgeText,
                        isExpired
                          ? { color: colors.error }
                          : isVerified
                            ? { color: colors.success }
                            : { color: colors.brandBrown },
                      ]}>
                      {isExpired ? 'EXPIRED' : doc.verificationStatus}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
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
  summaryCard: {
    backgroundColor: colors.cream,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  summaryLabel: { fontSize: 10, fontWeight: '800', color: colors.brandBrown, letterSpacing: 0.6 },
  summaryValue: { fontSize: 24, fontWeight: '800', color: colors.deepBrown, marginVertical: 4 },
  summarySub: { fontSize: typography.sizes.xs, color: colors.secondary, fontWeight: '600' },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  cardTitle: { fontSize: typography.sizes.base, fontWeight: '800', color: colors.deepBrown },
  emptyText: { fontSize: typography.sizes.xs, color: colors.secondary },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  docName: { fontSize: typography.sizes.xs, fontWeight: '800', color: colors.deepBrown },
  docMeta: { fontSize: 11, color: colors.secondary, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  badgeGreen: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  badgeAmber: { backgroundColor: colors.lightCream, borderColor: colors.warmBeige },
  badgeRed: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  badgeText: { fontSize: 10, fontWeight: '800' },
});
