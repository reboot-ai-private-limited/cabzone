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
import { LinearGradient } from 'expo-linear-gradient';
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

const VARIANT_GRADIENTS: Record<CandyButtonVariant, [string, string, ...string[]]> = {
  primary: ['#B07548', '#7A4A2B', '#4A2A18'],
  espresso: ['#4E2914', '#381C0D', '#241006'],
  muted: ['#E6DAC5', '#DFD3BC', '#D7C7AE'],
};

/**
 * React Native port of the web "CandyButton" in brown palettes:
 * - 'primary': rich caramel/chestnut brown
 * - 'espresso': deep dark chocolate/espresso
 * - 'muted': soft sand/cream disabled state
 */
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
  const activeGradient = customColors || VARIANT_GRADIENTS[variant];

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
          transform: [
            { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.95] }) },
            { rotate: press.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1deg'] }) },
          ],
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
        <LinearGradient
          colors={activeGradient}
          locations={[0, 0.55, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[
            styles.button,
            variant === 'espresso' && styles.espressoButton,
            isMuted && styles.mutedButton,
            height ? { minHeight: height, height } : null,
          ]}>
          {/* Inner top highlight (the web ::after line), omitted in muted mode */}
          {!isMuted && (
            <View pointerEvents="none" style={styles.highlightWrap}>
              <LinearGradient
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.highlight}
              />
            </View>
          )}

          {loading ? (
            <ActivityIndicator size="small" color={isMuted ? '#8C7B68' : '#FFFFFF'} />
          ) : (
            <>
              <Text
                style={[
                  styles.text,
                  isMuted && styles.mutedText,
                  variant === 'espresso' && styles.espressoText,
                  textStyle,
                ]}>
                {title}
              </Text>
              {icon}
            </>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: {
    borderRadius: 16,
    shadowColor: '#7A4A2B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 7,
  },
  espressoGlow: {
    shadowColor: '#381C0D',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 8,
  },
  mutedContainer: {
    borderRadius: 16,
    opacity: 0.95,
  },
  button: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#C9976B',
    paddingHorizontal: 28,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  espressoButton: {
    borderColor: '#633517',
  },
  mutedButton: {
    borderWidth: 0,
    borderColor: 'transparent',
  },
  highlightWrap: {
    position: 'absolute',
    top: 1,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  highlight: {
    width: '60%',
    height: 1.2,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16.5,
    fontWeight: '700',
    lineHeight: 22,
    letterSpacing: 0.3,
  },
  espressoText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  mutedText: {
    color: '#A5957F',
    fontWeight: '600',
  },
});

export default CandyButton;
