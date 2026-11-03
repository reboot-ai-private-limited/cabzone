import React, { useEffect, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { colors, motion, createStyles } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export type DriverPresenceStatus = 'OFFLINE' | 'CHECKING' | 'ONLINE';

export interface CabzonStatusIndicatorProps {
  status: DriverPresenceStatus;
  subtext?: string;
}

export function CabzonStatusIndicator({
  status,
  subtext,
}: CabzonStatusIndicatorProps) {
  const [pulseAnim] = useState(() => new Animated.Value(1));
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (status !== 'ONLINE' || reducedMotion) {
      pulseAnim.setValue(1);
      return;
    }

    // 2-3s cycle subtle pulse: opacity 0.6 -> 1 -> 0.6
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 1200,
          easing: motion.nativeEasing.smooth,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: motion.nativeEasing.smooth,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [status, reducedMotion, pulseAnim]);

  const getStatusColor = () => {
    switch (status) {
      case 'ONLINE':
        return colors.success;
      case 'CHECKING':
        return colors.warning;
      case 'OFFLINE':
      default:
        return colors.secondary;
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'ONLINE':
        return 'ONLINE';
      case 'CHECKING':
        return 'CHECKING...';
      case 'OFFLINE':
      default:
        return 'OFFLINE';
    }
  };

  const getDefaultSubtext = () => {
    switch (status) {
      case 'ONLINE':
        return 'Receiving ride requests';
      case 'CHECKING':
        return 'Verifying duty eligibility';
      case 'OFFLINE':
      default:
        return 'Not receiving ride requests';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.badgeRow}>
        <Animated.View
          style={[
            styles.dot,
            {
              backgroundColor: getStatusColor(),
              opacity: status === 'ONLINE' ? pulseAnim : 1,
            },
          ]}
        />
        <Text style={[styles.statusText, { color: getStatusColor() }]}>
          {getStatusLabel()}
        </Text>
      </View>
      <Text style={styles.subtext}>{subtext ?? getDefaultSubtext()}</Text>
    </View>
  );
}

const styles = createStyles(() => ({
  container: {
    alignItems: 'center',
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtext: {
    fontSize: 13,
    color: colors.secondary,
  },
}));
