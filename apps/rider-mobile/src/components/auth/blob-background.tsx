import React, { memo, useEffect, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { createStyles } from '@/design-system';

const SIZE = 400;
const CENTER = SIZE / 2;
const BASE_R = 178;
const POINTS = 10;
const AMPLITUDE = 14;
const FRAME_MS = 50; // 20fps: smooth slow organic drift, keeps the JS thread free

// 10 control points with gentle differential frequencies for a living, cloud-like feel
const SPEEDS = [0.38, 0.52, 0.42, 0.60, 0.46, 0.54, 0.36, 0.58, 0.44, 0.50];
const PHASES = [0, 1.25, 2.5, 3.75, 5.0, 0.62, 1.88, 3.14, 4.4, 5.6];

function blobPath(t: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < POINTS; i++) {
    const angle = (i / POINTS) * Math.PI * 2;
    const r = BASE_R + AMPLITUDE * Math.sin(t * SPEEDS[i] + PHASES[i]);
    pts.push([CENTER + r * Math.cos(angle), CENTER + r * Math.sin(angle)]);
  }

  // Closed Catmull-Rom spline -> cubic Beziers (smooth, continuous curvature)
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < POINTS; i++) {
    const p0 = pts[(i - 1 + POINTS) % POINTS];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % POINTS];
    const p3 = pts[(i + 2) % POINTS];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + ' Z';
}

export interface BlobBackgroundProps {
  showOrbits?: boolean;
  style?: StyleProp<ViewStyle>;
  fill?: string;
  fillOpacity?: number;
  size?: number;
}

/** Fuller, rich warm sun halo blob that slowly morphs behind the hero. Static when reduced motion is on. */
function BlobBackgroundBase({
  showOrbits = false,
  style,
  fill,
  fillOpacity = 1,
  size = SIZE,
}: BlobBackgroundProps) {
  const reducedMotion = useReducedMotion();
  const [d, setD] = useState(() => blobPath(0));

  useEffect(() => {
    if (reducedMotion) return;
    const start = Date.now();
    const id = setInterval(() => {
      setD(blobPath((Date.now() - start) / 1000));
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [reducedMotion]);

  return (
    <View pointerEvents="none" style={[styles.wrap, { width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Defs>
          {/* Creamy glow: cream -> peach -> light caramel -> soft orange-brown rim (CandyButton-themed, light) */}
          <RadialGradient id="blobSunGlow" cx="42%" cy="38%" rx="62%" ry="62%">
            <Stop offset="0%" stopColor="#FFFBF2" stopOpacity={0.95} />
            <Stop offset="35%" stopColor="#FFF0D6" stopOpacity={0.9} />
            <Stop offset="68%" stopColor="#F9DDB8" stopOpacity={0.8} />
            <Stop offset="100%" stopColor="#EDBA8A" stopOpacity={0.62} />
          </RadialGradient>

          {/* Very soft warm aura */}
          <RadialGradient id="blobAtmosphere" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor="#F6D9B4" stopOpacity={0.3} />
            <Stop offset="70%" stopColor="#F0C79A" stopOpacity={0.12} />
            <Stop offset="100%" stopColor="#E8B07C" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Layer 1: Atmospheric aura feathering out from behind the blob */}
        <Circle cx={CENTER} cy={CENTER} r={BASE_R + 14} fill="url(#blobAtmosphere)" />

        {/* Layer 2: Main organic morphing Catmull-Rom spline blob */}
        <Path d={d} fill={fill ?? 'url(#blobSunGlow)'} fillOpacity={fillOpacity} />

        {/* Layer 3: Concentric orbit rings and satellite node accents */}
        {showOrbits && (
          <>
            {/* Inner dashed orbit ring */}
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={148}
              fill="none"
              stroke="#D9A978"
              strokeWidth={1.4}
              strokeDasharray="6, 8"
              opacity={0.5}
            />

            {/* Outer dashed orbit ring */}
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={186}
              fill="none"
              stroke="#C9976B"
              strokeWidth={1.1}
              strokeDasharray="6, 10"
              opacity={0.3}
            />

            {/* Orbital node accents */}
            <Circle cx={313} cy={294} r={3.5} fill="#C9976B" opacity={0.6} />
            <Circle cx={35} cy={115} r={2.5} fill="#C9976B" opacity={0.5} />
            <Circle cx={275} cy={95} r={2} fill="#D9A978" opacity={0.5} />

            {/* Swooping dashed trail curving toward road */}
            <Path
              d={`M ${CENTER} 350 C ${CENTER} 375, 175 395, 140 400`}
              fill="none"
              stroke="#D9A978"
              strokeWidth={1.3}
              strokeDasharray="5, 7"
              opacity={0.45}
            />
          </>
        )}
      </Svg>
    </View>
  );
}

export const BlobBackground = memo(BlobBackgroundBase);

const styles = createStyles(() => ({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
