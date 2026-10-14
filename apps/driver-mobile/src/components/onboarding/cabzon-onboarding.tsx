import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, motion } from '@/design-system';
import { CabzonButton } from '@/components/buttons/cabzon-button';
import { CabzonProgress } from '@/components/feedback/cabzon-progress';
import { CabzonPageTransition } from '@/animations/cabzon-page-transition';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export interface CabzonOnboardingProps {
  onComplete: () => void;
}

interface SlideData {
  headline: string;
  subheadline: string;
  icon: string;
  secondaryIcon?: string;
}

const SLIDES: SlideData[] = [
  {
    headline: 'Drive. Earn. Grow.',
    subheadline: 'Flexible hours, fair earnings and more control with Cabzon.',
    icon: '🚕',
    secondaryIcon: '🛺',
  },
  {
    headline: 'Choose your vehicle',
    subheadline: 'Drive a Cab or E-Rickshaw with Cabzon.',
    icon: '⚡',
    secondaryIcon: '🚗',
  },
  {
    headline: "You're almost ready",
    subheadline: 'Complete your profile and documents to start driving.',
    icon: '📋',
    secondaryIcon: '✓',
  },
];

export function CabzonOnboarding({ onComplete }: CabzonOnboardingProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  // Entrance animation values for Section 5 (useState to satisfy React 19 compiler ref rules)
  const [bgShapeOpacity] = useState(() => new Animated.Value(0));
  const [vehicleOpacity] = useState(() => new Animated.Value(0));
  const [vehicleScale] = useState(() => new Animated.Value(0.94));
  const [vehicleTranslateY] = useState(() => new Animated.Value(16));
  const [contentOpacity] = useState(() => new Animated.Value(0));
  const [contentTranslateY] = useState(() => new Animated.Value(12));
  const [ctaOpacity] = useState(() => new Animated.Value(0));
  const [ctaTranslateY] = useState(() => new Animated.Value(8));

  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      bgShapeOpacity.setValue(1);
      vehicleOpacity.setValue(1);
      vehicleScale.setValue(1);
      vehicleTranslateY.setValue(0);
      contentOpacity.setValue(1);
      contentTranslateY.setValue(0);
      ctaOpacity.setValue(1);
      ctaTranslateY.setValue(0);
      return;
    }

    // Reset values for entrance
    bgShapeOpacity.setValue(0);
    vehicleOpacity.setValue(0);
    vehicleScale.setValue(0.94);
    vehicleTranslateY.setValue(16);
    contentOpacity.setValue(0);
    contentTranslateY.setValue(12);
    ctaOpacity.setValue(0);
    ctaTranslateY.setValue(8);

    // Staggered entrance animation per Section 5
    Animated.parallel([
      // Background shapes: opacity 0→1, 400ms
      Animated.timing(bgShapeOpacity, {
        toValue: 1,
        duration: 400,
        easing: motion.nativeEasing.standard,
        useNativeDriver: true,
      }),
      // Vehicle: opacity 0→1, scale .94→1, translateY 16→0, 450ms
      Animated.parallel([
        Animated.timing(vehicleOpacity, {
          toValue: 1,
          duration: motion.duration.emphasis,
          easing: motion.nativeEasing.enter,
          useNativeDriver: true,
        }),
        Animated.timing(vehicleScale, {
          toValue: 1,
          duration: motion.duration.emphasis,
          easing: motion.nativeEasing.enter,
          useNativeDriver: true,
        }),
        Animated.timing(vehicleTranslateY, {
          toValue: 0,
          duration: motion.duration.emphasis,
          easing: motion.nativeEasing.enter,
          useNativeDriver: true,
        }),
      ]),
      // Headline & Subheadline: opacity 0→1, translateY 12→0, 300ms
      Animated.sequence([
        Animated.delay(100),
        Animated.parallel([
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: motion.duration.normal,
            easing: motion.nativeEasing.standard,
            useNativeDriver: true,
          }),
          Animated.timing(contentTranslateY, {
            toValue: 0,
            duration: motion.duration.normal,
            easing: motion.nativeEasing.standard,
            useNativeDriver: true,
          }),
        ]),
      ]),
      // CTA: opacity 0→1, translateY 8→0, 300ms
      Animated.sequence([
        Animated.delay(180),
        Animated.parallel([
          Animated.timing(ctaOpacity, {
            toValue: 1,
            duration: motion.duration.normal,
            easing: motion.nativeEasing.standard,
            useNativeDriver: true,
          }),
          Animated.timing(ctaTranslateY, {
            toValue: 0,
            duration: motion.duration.normal,
            easing: motion.nativeEasing.standard,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [currentSlide, reducedMotion, bgShapeOpacity, vehicleOpacity, vehicleScale, vehicleTranslateY, contentOpacity, contentTranslateY, ctaOpacity, ctaTranslateY]);

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setDirection('forward');
      setCurrentSlide((prev) => prev + 1);
    } else {
      onComplete();
    }
  };

  const slide = SLIDES[currentSlide];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Progress Indicator Section 7 */}
        <View style={styles.progressContainer}>
          <CabzonProgress totalSteps={3} currentStep={currentSlide} />
        </View>

        {/* Visual & Content inside Page Transition Section 6 */}
        <CabzonPageTransition pageKey={currentSlide} direction={direction} style={styles.pageContent}>
          {/* Decorative soft blue background shapes */}
          <Animated.View style={[styles.softGlow, { opacity: bgShapeOpacity }]} />

          {/* Large Visual Area */}
          <Animated.View
            style={[
              styles.visualArea,
              {
                opacity: vehicleOpacity,
                transform: [
                  { scale: vehicleScale },
                  { translateY: vehicleTranslateY },
                ],
              },
            ]}
          >
            <View style={styles.iconCirclePrimary}>
              <Text style={styles.primaryIconText}>{slide.icon}</Text>
            </View>
            {slide.secondaryIcon ? (
              <View style={styles.iconCircleSecondary}>
                <Text style={styles.secondaryIconText}>{slide.secondaryIcon}</Text>
              </View>
            ) : null}
          </Animated.View>

          {/* Headline & Subheadline */}
          <Animated.View
            style={[
              styles.textContainer,
              {
                opacity: contentOpacity,
                transform: [{ translateY: contentTranslateY }],
              },
            ]}
          >
            <Text style={styles.headline}>{slide.headline}</Text>
            <Text style={styles.subheadline}>{slide.subheadline}</Text>
          </Animated.View>
        </CabzonPageTransition>

        {/* CTA Button Section 8 */}
        <Animated.View
          style={[
            styles.ctaContainer,
            {
              opacity: ctaOpacity,
              transform: [{ translateY: ctaTranslateY }],
            },
          ]}
        >
          <CabzonButton
            title={currentSlide === SLIDES.length - 1 ? 'Get Started →' : 'Continue →'}
            onPress={handleNext}
          />
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  progressContainer: {
    paddingHorizontal: 8,
  },
  pageContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  softGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.lightBlue,
    opacity: 0.6,
  },
  visualArea: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  iconCirclePrimary: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  primaryIconText: {
    fontSize: 64,
  },
  iconCircleSecondary: {
    position: 'absolute',
    bottom: 10,
    right: 16,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.softBlue,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  secondaryIconText: {
    fontSize: 28,
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.darkNavy,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  subheadline: {
    fontSize: 16,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  ctaContainer: {
    width: '100%',
    paddingBottom: 8,
  },
});
