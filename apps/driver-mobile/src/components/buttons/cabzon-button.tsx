import React, { useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, motion } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export interface CabzonButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export function CabzonButton({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  textStyle,
  icon,
}: CabzonButtonProps) {
  const [scale] = useState(() => new Animated.Value(1));
  const reducedMotion = useReducedMotion();

  const handlePressIn = () => {
    if (disabled || loading || reducedMotion) return;
    Animated.timing(scale, {
      toValue: 0.97,
      duration: 100,
      easing: motion.nativeEasing.standard,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (disabled || loading || reducedMotion) return;
    Animated.timing(scale, {
      toValue: 1,
      duration: 150,
      easing: motion.nativeEasing.enter,
      useNativeDriver: true,
    }).start();
  };

  const isDisabled = disabled || loading;

  const getBackgroundColor = () => {
    if (isDisabled) return '#E2E8F0';
    switch (variant) {
      case 'primary':
        return colors.cabzonBlue;
      case 'secondary':
        return colors.lightBlue;
      case 'danger':
        return colors.error;
      case 'ghost':
        return 'transparent';
      default:
        return colors.cabzonBlue;
    }
  };

  const getTextColor = () => {
    if (isDisabled) return '#94A3B8';
    switch (variant) {
      case 'primary':
      case 'danger':
        return colors.white;
      case 'secondary':
        return colors.darkNavy;
      case 'ghost':
        return colors.cabzonBlue;
      default:
        return colors.white;
    }
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        style={[
          styles.button,
          { backgroundColor: getBackgroundColor() },
          variant === 'ghost' && styles.ghostBorder,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={variant === 'secondary' ? colors.darkNavy : colors.white}
          />
        ) : (
          <>
            {icon}
            <Text style={[styles.text, { color: getTextColor() }, textStyle]}>
              {title}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  ghostBorder: {
    borderWidth: 1,
    borderColor: colors.cabzonBlue,
  },
});
