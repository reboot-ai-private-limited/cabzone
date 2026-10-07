import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

const SIZE = 380;
const CENTER = SIZE / 2;
const BASE_R = 166;
const POINTS = 8;
const AMPLITUDE = 14;
const FRAME_MS = 50; // 20fps: slow blob, keeps the JS thread free for the pager

// Each control point drifts on its own slow sine -> organic, never-repeating feel
const SPEEDS = [0.55, 0.7, 0.45, 0.8, 0.6, 0.5, 0.75, 0.65];
const PHASES = [0, 1.3, 2.6, 3.9, 5.2, 0.7, 2.0, 3.3];

function blobPath(t: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < POINTS; i++) {
    const angle = (i / POINTS) * Math.PI * 2;
    const r = BASE_R + AMPLITUDE * Math.sin(t * SPEEDS[i] + PHASES[i]);
    pts.push([CENTER + r * Math.cos(angle), CENTER + r * Math.sin(angle)]);
  }

  // Closed Catmull-Rom spline -> cubic Beziers (smooth, no corners)
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

/** Soft warm blob that slowly morphs behind the hero. Static when reduced motion is on. */
function BlobBackgroundBase() {
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
    <View pointerEvents="none" style={styles.wrap}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Path d={d} fill="#FFF0BA" fillOpacity={0.78} />
      </Svg>
    </View>
  );
}

export const BlobBackground = memo(BlobBackgroundBase);

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    width: SIZE,
    height: SIZE,
  },
});
