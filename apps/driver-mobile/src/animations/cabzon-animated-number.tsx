import React, { useEffect, useRef, useState } from 'react';
import { Text, type TextStyle } from 'react-native';
import { motion } from '@/design-system';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export interface CabzonAnimatedNumberProps {
  value: number;
  duration?: number;
  prefix?: string;
  decimals?: number;
  style?: TextStyle;
}

export function CabzonAnimatedNumber({
  value,
  duration = motion.duration.normal,
  prefix = '₹',
  decimals = 2,
  style,
}: CabzonAnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValue = useRef(value);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || prevValue.current === value) {
      setDisplayValue(value);
      prevValue.current = value;
      return;
    }

    const startVal = prevValue.current;
    const diff = value - startVal;
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // ease-out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = startVal + diff * easeProgress;

      setDisplayValue(current);

      if (progress >= 1) {
        clearInterval(interval);
        prevValue.current = value;
      }
    }, 16);

    return () => clearInterval(interval);
  }, [value, duration, reducedMotion]);

  return (
    <Text style={style}>
      {prefix}
      {displayValue.toFixed(decimals)}
    </Text>
  );
}
