import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { createStyles } from '@/design-system';

export interface RoutePointIconProps {
  type: 'pickup' | 'drop';
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function RoutePointIcon({ type, size = 18, style }: RoutePointIconProps) {
  const isPickup = type === 'pickup';
  const color = isPickup ? '#059669' : '#DC2626';

  return (
    <View
      style={[
        styles.outerContainer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          borderWidth: 2,
          backgroundColor: '#FFFFFF',
        },
        style,
      ]}
      accessibilityLabel={isPickup ? 'Pickup point' : 'Destination point'}
    >
      <View
        style={[
          styles.coreDot,
          {
            width: Math.max(4, Math.round(size * 0.42)),
            height: Math.max(4, Math.round(size * 0.42)),
            borderRadius: Math.round(size * 0.21),
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

export function RouteConnector({ height = 24, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.connectorContainer, { height }, style]}>
      <View style={styles.connectorDot} />
      <View style={styles.connectorDot} />
      <View style={styles.connectorDot} />
    </View>
  );
}

const styles = createStyles(() => ({
  outerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreDot: {},
  connectorContainer: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    marginVertical: 2,
  },
  connectorDot: {
    width: 2.5,
    height: 4,
    borderRadius: 1.5,
    backgroundColor: '#d1d5db',
  },
}));
