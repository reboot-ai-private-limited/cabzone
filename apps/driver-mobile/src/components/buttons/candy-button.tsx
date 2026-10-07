import React, { useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export interface CandyButtonProps {
  title: string;
  onPress: () => void;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * React Native port of the web "CandyButton" in a brown palette:
 * gradient fill, light border, soft glow, inner top highlight line and a
 * playful press (scale .95 + 1deg rotate).
 */
export function CandyButton({ title, onPress, icon, style }: CandyButtonProps) {
  const [press] = useState(() => new Animated.Value(0));
  const reducedMotion = useReducedMotion();

  const animate = (to: number) => {
    if (reducedMotion) return;
    Animated.timing(press, {
      toValue: to,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.glow,
        {
          transform: [
            { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.95] }) },
            { rotate: press.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1deg'] }) },
          ],
        },
        style,
      ]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animate(1)}
        onPressOut={() => animate(0)}
        accessibilityRole="button"
        accessibilityLabel={title}>
        <LinearGradient
          colors={['#B07548', '#7A4A2B', '#4A2A18']}
          locations={[0, 0.55, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.button}>
          {/* Inner top highlight (the web ::after line) */}
          <View pointerEvents="none" style={styles.highlightWrap}>
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.highlight}
            />
          </View>
          <Text style={styles.text}>{title}</Text>
          {icon}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Outer glow: shadow-[0_4px_48px_-12px] equivalent in brown
  glow: {
    borderRadius: 14,
    shadowColor: '#7A4A2B',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 8,
  },
  button: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C9976B',
    paddingHorizontal: 36,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
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
    height: 1,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16.5,
    fontWeight: '700',
    lineHeight: 22,
    letterSpacing: 0.3,
  },
});

export default CandyButton;
