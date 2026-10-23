import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth-context';
import { colors, typography } from '@/design-system';

export default function DriverVehicleScreen() {
  const router = useRouter();
  const { vehicle } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
          <Text style={styles.backText}>Account</Text>
        </Pressable>
        <Text style={styles.topTitle}>Registered Vehicle</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {!vehicle ? (
          <View style={styles.card}>
            <Text style={styles.title}>No Vehicle Linked</Text>
            <Text style={styles.sub}>
              Contact Cabzone Driver Support if you need to register or replace your commercial vehicle.
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.plateBox}>
              <Text style={styles.plateLabel}>REGISTRATION NUMBER</Text>
              <Text style={styles.plateNumber}>{vehicle.registrationNumber}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.key}>Category</Text>
              <Text style={styles.val}>{vehicle.vehicleType}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.key}>Make & Model</Text>
              <Text style={styles.val}>
                {vehicle.make} {vehicle.model}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.key}>Color</Text>
              <Text style={styles.val}>{vehicle.color || '—'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.key}>Manufacture Year</Text>
              <Text style={styles.val}>{vehicle.manufactureYear || '—'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.key}>Verification Status</Text>
              <Text style={[styles.val, { color: colors.success }]}>
                {vehicle.verificationStatus || 'VERIFIED'}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.noticeCard}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.deepBrown} />
          <Text style={styles.noticeText}>
            Vehicle changes require RC, Insurance, and Commercial Permit verification by Cabzone Compliance. Contact Driver Support to request a vehicle transfer.
          </Text>
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
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  title: { fontSize: typography.sizes.lg, fontWeight: '800', color: colors.deepBrown },
  sub: { fontSize: typography.sizes.xs, color: colors.secondary, lineHeight: 18 },
  plateBox: {
    backgroundColor: colors.cream,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
  },
  plateLabel: { fontSize: 10, fontWeight: '800', color: colors.brandBrown, letterSpacing: 0.6 },
  plateNumber: { fontSize: 24, fontWeight: '800', color: colors.deepBrown, marginTop: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  key: { fontSize: typography.sizes.xs, color: colors.secondary, fontWeight: '600' },
  val: { fontSize: typography.sizes.sm, color: colors.deepBrown, fontWeight: '800' },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.lightCream,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeText: {
    flex: 1,
    fontSize: typography.sizes.xs,
    color: colors.deepBrown,
    lineHeight: 18,
    fontWeight: '600',
  },
});
