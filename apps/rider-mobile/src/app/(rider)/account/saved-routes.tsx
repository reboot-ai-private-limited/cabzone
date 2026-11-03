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
import { useAuth } from '@/context/auth-context';
import { useRide } from '@/context/ride-context';
import type { SavedRouteTemplate } from '@/services/rider-helpers';
import { colors, radii, spacing, typography, createStyles } from '@/design-system';

export default function SavedRoutesScreen() {
  const router = useRouter();
  const { templates, removeTemplate } = useAuth();
  const { setBookingDraft } = useRide();

  const handleLaunchTemplate = (tpl: SavedRouteTemplate) => {
    setBookingDraft({
      mode: tpl.mode,
      pickup: tpl.pickup,
      drop: tpl.drop,
    });
    router.push(
      tpl.mode === 'OUTSTATION'
        ? '/(rider)/(tabs)/intercity'
        : '/(rider)/(tabs)/home',
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.deepBrown} />
        </Pressable>
        <Text style={styles.topBarTitle}>Saved Route Templates</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {templates.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="bookmark-outline" size={36} color={colors.secondary} />
            <Text style={styles.emptyTitle}>No saved templates yet</Text>
            <Text style={styles.emptySub}>
              Tap &quot;Save&quot; next to any route on the Home or Intercity tab to create a 1-tap quick-launch template.
            </Text>
          </View>
        ) : (
          templates.map((tpl) => (
            <View key={tpl.id} style={styles.tplCard}>
              <View style={styles.tplTopRow}>
                <View style={styles.modeTag}>
                  <Text style={styles.modeTagText}>{tpl.mode}</Text>
                </View>
                <Pressable onPress={() => void removeTemplate(tpl.id)}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </Pressable>
              </View>
              <Text style={styles.tplLabel}>{tpl.label}</Text>
              <Text style={styles.tplAddress} numberOfLines={1}>
                From: {tpl.pickup.address}
              </Text>
              <Text style={styles.tplAddress} numberOfLines={1}>
                To: {tpl.drop.address}
              </Text>
              <Pressable
                style={styles.launchBtn}
                onPress={() => handleLaunchTemplate(tpl)}
              >
                <Text style={styles.launchBtnText}>Book This Route</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.deepBrown} />
              </Pressable>
            </View>
          ))
        )}
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
  emptyCard: {
    backgroundColor: colors.cream,
    borderRadius: radii.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  emptySub: {
    ...typography.caption,
    color: colors.secondary,
    textAlign: 'center',
  },
  tplCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 6,
  },
  tplTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modeTag: {
    backgroundColor: colors.warmBeige,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  modeTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  tplLabel: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  tplAddress: {
    ...typography.caption,
    color: colors.secondary,
  },
  launchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.amber,
    borderWidth: 1,
    borderColor: colors.deepBrown,
    paddingVertical: 10,
    borderRadius: radii.md,
    marginTop: 6,
  },
  launchBtnText: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
}));
