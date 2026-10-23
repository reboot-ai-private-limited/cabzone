import React, { useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export type CandyButtonVariant = 'primary' | 'espresso' | 'muted';

export interface CandyButtonProps {
  title: string;
  onPress: () => void;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  variant?: CandyButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  colors?: [string, string, ...string[]];
  height?: number;
}

export function CandyButton({
  title,
  onPress,
  icon,
  style,
  textStyle,
  variant = 'primary',
  disabled = false,
  loading = false,
  colors: customColors,
  height,
}: CandyButtonProps) {
  const [press] = useState(() => new Animated.Value(0));
  const reducedMotion = useReducedMotion();

  const isMuted = variant === 'muted' || disabled;
  const backgroundColor = isMuted ? colors.lightCream : customColors?.[0] ?? colors.amber;

  const animate = (to: number) => {
    if (reducedMotion || isMuted || loading) return;
    Animated.timing(press, {
      toValue: to,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        isMuted ? styles.mutedContainer : styles.glow,
        variant === 'espresso' && styles.espressoGlow,
        !isMuted && {
          transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) }],
        },
        style,
      ]}>
      <Pressable
        onPress={isMuted || loading ? undefined : onPress}
        onPressIn={() => animate(1)}
        onPressOut={() => animate(0)}
        disabled={isMuted || loading}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: isMuted, busy: loading }}>
        <View
          style={[
            styles.button,
            { backgroundColor },
            isMuted && styles.mutedButton,
            height ? { minHeight: height, height } : null,
          ]}>
          {loading ? (
            <ActivityIndicator size="small" color={isMuted ? colors.secondary : colors.deepBrown} />
          ) : (
            <>
              <Text
                style={[
                  styles.text,
                  isMuted && styles.mutedText,
                  textStyle,
                ]}>
                {title}
              </Text>
              {icon}
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: {
    borderRadius: 8,
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  espressoGlow: {
    shadowColor: colors.darkNavy,
  },
  mutedContainer: {
    borderRadius: 8,
    opacity: 0.95,
  },
  button: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 0,
    paddingHorizontal: 28,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  mutedButton: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    color: colors.deepBrown,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: 0,
  },
  mutedText: {
    color: colors.secondary,
    fontWeight: '600',
  },
});

export default CandyButton;
