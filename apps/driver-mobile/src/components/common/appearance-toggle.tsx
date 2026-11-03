import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, createStyles, useTheme, type ThemePreference } from '@/design-system';

const OPTIONS: { value: ThemePreference; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

/** Light / Dark / System selector. System follows the phone's appearance setting. */
export function AppearanceToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Ionicons name="contrast-outline" size={22} color={colors.deepBrown} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>Appearance</Text>
        <Text style={styles.sub}>
          {preference === 'system' ? 'Matches your phone setting' : `Always ${preference}`}
        </Text>
      </View>
      <View style={styles.segmented} accessibilityRole="radiogroup">
        {OPTIONS.map((opt) => {
          const active = preference === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={[styles.seg, active && styles.segActive]}
              onPress={() => setPreference(opt.value)}
              accessibilityRole="radio"
              accessibilityLabel={`${opt.label} theme`}
              accessibilityState={{ selected: active }}
            >
              <Ionicons name={opt.icon} size={16} color={active ? colors.amber : colors.deepBrown} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = createStyles(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.lightCream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  sub: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 2,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.cream,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
  },
  seg: {
    minWidth: 36,
    minHeight: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segActive: {
    backgroundColor: colors.deepBrown,
  },
}));
