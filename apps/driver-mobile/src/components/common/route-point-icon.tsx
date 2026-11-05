import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { createStyles } from '@/design-system';

export interface RoutePointIconProps {
  type: 'pickup' | 'drop';
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function RoutePointIcon({ type, size = 22, style }: RoutePointIconProps) {
  const isPickup = type === 'pickup';

  const outerSize = size;
  const innerSize = Math.round(size * 0.65);
  const coreSize = Math.round(size * 0.32);

  return (
    <View
      style={[
        styles.outerContainer,
        {
          width: outerSize,
          height: outerSize,
          borderRadius: isPickup ? outerSize / 2 : Math.max(6, Math.round(outerSize * 0.28)),
          backgroundColor: isPickup ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.18)',
        },
        style,
      ]}
      accessibilityLabel={isPickup ? 'Pickup point' : 'Destination point'}
    >
      <View
        style={[
          styles.midLayer,
          {
            width: innerSize,
            height: innerSize,
            borderRadius: isPickup ? innerSize / 2 : Math.max(4, Math.round(innerSize * 0.24)),
            backgroundColor: isPickup ? '#059669' : '#dc2626',
          },
        ]}
      >
        <View
          style={[
            styles.coreDot,
            {
              width: coreSize,
              height: coreSize,
              borderRadius: isPickup ? coreSize / 2 : 2,
            },
          ]}
        />
      </View>
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
  midLayer: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  coreDot: {
    backgroundColor: '#ffffff',
  },
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
