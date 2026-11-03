import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, createStyles } from '@/design-system';
import { splitPlaceLabel } from './ride-route-strip-utils';

export interface RideRouteStripProps {
  pickup: string;
  drop: string;
}

/**
 * Pickup title on the left, destination title on the right, a car badge on the line between them.
 * Used on the Activity cards so a trip reads at a glance.
 */
export function RideRouteStrip({ pickup, drop }: RideRouteStripProps) {
  const from = splitPlaceLabel(pickup);
  const to = splitPlaceLabel(drop);
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`From ${pickup} to ${drop}`}
    >
      <View style={styles.side}>
        <View style={[styles.dot, styles.dotFrom]} />
        <Text style={styles.name} numberOfLines={3}>
          {from.name}
        </Text>
      </View>

      <View style={styles.connector} importantForAccessibility="no-hide-descendants">
        <View style={styles.line} />
        <View style={styles.badge}>
          <Ionicons name="car-sport" size={14} color={colors.deepBrown} />
        </View>
        <View style={styles.line} />
      </View>

      <View style={[styles.side, styles.sideRight]}>
        <View style={[styles.dot, styles.dotTo]} />
        <Text style={[styles.name, styles.alignRight]} numberOfLines={3}>
          {to.name}
        </Text>
      </View>
    </View>
  );
}

const styles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  side: { flex: 1.5 },
  sideRight: { alignItems: 'flex-end' },
  dot: { width: 9, height: 9, borderRadius: 4.5, marginBottom: spacing.xs },
  dotFrom: { backgroundColor: colors.success },
  dotTo: { backgroundColor: colors.brandBrown },
  name: { fontSize: 15, lineHeight: 19, fontWeight: '800', color: colors.deepBrown },
  alignRight: { textAlign: 'right' },
  // The badge sits level with the place names, like the reference design.
  connector: { flex: 0.45, minWidth: 46, flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  line: { flex: 1, height: 2, borderRadius: 1, backgroundColor: '#FBE3A5' },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
