import React, { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';
import { colors, motion, createStyles } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export interface CabzonProgressProps {
  totalSteps?: number;
  currentStep: number; // 0-indexed
}

export function CabzonProgress({
  totalSteps = 3,
  currentStep,
}: CabzonProgressProps) {
  const reducedMotion = useReducedMotion();

  return (
    <View style={styles.container} accessibilityRole="progressbar">
      {Array.from({ length: totalSteps }).map((_, idx) => (
        <ProgressSegment
          key={idx}
          isActive={idx === currentStep}
          isCompleted={idx < currentStep}
          reducedMotion={reducedMotion}
        />
      ))}
    </View>
  );
}

function ProgressSegment({
  isActive,
  isCompleted,
  reducedMotion,
}: {
  isActive: boolean;
  isCompleted: boolean;
  reducedMotion: boolean;
}) {
  const [widthAnim] = useState(() => new Animated.Value(isCompleted ? 1 : 0));

  useEffect(() => {
    if (reducedMotion) {
      widthAnim.setValue(isCompleted || isActive ? 1 : 0);
      return;
    }

    if (isActive) {
      widthAnim.setValue(0);
      Animated.timing(widthAnim, {
        toValue: 1,
        duration: 250,
        easing: motion.nativeEasing.standard,
        useNativeDriver: false,
      }).start();
    } else if (isCompleted) {
      widthAnim.setValue(1);
    } else {
      widthAnim.setValue(0);
    }
  }, [isActive, isCompleted, reducedMotion, widthAnim]);

  const widthInterpolate = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.segmentBackground}>
      <Animated.View
        style={[
          styles.segmentFill,
          {
            width: widthInterpolate,
            backgroundColor: colors.cabzonBlue,
          },
        ]}
      />
    </View>
  );
}

const styles = createStyles(() => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 12,
  },
  segmentBackground: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  segmentFill: {
    height: '100%',
    borderRadius: 2,
  },
}));
