import React, { useEffect, useState } from 'react';
import { Animated, Pressable, Text } from 'react-native';
import { colors, motion, createStyles } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export interface CabzonToastProps {
  message: string;
  type?: 'success' | 'info' | 'error';
  visible: boolean;
  onDismiss: () => void;
  durationMs?: number; // 2500ms default, 0 for sticky
}

export function CabzonToast({
  message,
  type = 'info',
  visible,
  onDismiss,
  durationMs = 2500,
}: CabzonToastProps) {
  const [anim] = useState(() => new Animated.Value(0));
  const reducedMotion = useReducedMotion();

  const hideToast = React.useCallback(() => {
    if (reducedMotion) {
      anim.setValue(0);
      onDismiss();
      return;
    }

    Animated.timing(anim, {
      toValue: 0,
      duration: 200,
      easing: motion.nativeEasing.exit,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDismiss();
    });
  }, [reducedMotion, anim, onDismiss]);

  useEffect(() => {
    if (visible) {
      if (reducedMotion) {
        anim.setValue(1);
      } else {
        Animated.timing(anim, {
          toValue: 1,
          duration: motion.duration.normal,
          easing: motion.nativeEasing.enter,
          useNativeDriver: true,
        }).start();
      }

      if (durationMs > 0 && type !== 'error') {
        const timer = setTimeout(() => {
          hideToast();
        }, durationMs);
        return () => clearTimeout(timer);
      }
    } else {
      hideToast();
    }
  }, [visible, durationMs, type, reducedMotion, anim, hideToast]);

  if (!visible) return null;

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-12, 0],
  });

  const getBorderColor = () => {
    switch (type) {
      case 'success':
        return colors.success;
      case 'error':
        return colors.error;
      case 'info':
      default:
        return colors.cabzonBlue;
    }
  };

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          opacity: anim,
          transform: [{ translateY }],
          borderColor: getBorderColor(),
        },
      ]}
    >
      <Text style={styles.toastText}>{message}</Text>
      {type === 'error' && (
        <Pressable onPress={hideToast} style={styles.dismissBtn}>
          <Text style={styles.dismissText}>✕</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = createStyles(() => ({
  toastContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderLeftWidth: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
    zIndex: 9999,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  dismissBtn: {
    paddingLeft: 12,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.secondary,
  },
}));
