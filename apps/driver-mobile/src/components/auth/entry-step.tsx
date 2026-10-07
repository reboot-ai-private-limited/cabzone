import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Platform,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { motion } from '@/design-system';
import { CandyButton } from '@/components/buttons/candy-button';
import { BlobBackground } from './blob-background';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { initPopSound, playPopSound, whenPopSoundReady } from '@/utils/sfx';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const PAGE_COUNT = 3;
const AUTO_SLIDE_MS = 4000;
const SLIDE_MS = 1100;
const SLIDE_EASING = Easing.bezier(0.65, 0, 0.35, 1);

const PILOT_COPY = {
  headline: 'Drive, Earn & Grow',
  body: '0% commission on your first 14 days.',
};

// Pages 2 & 3 of the swipeable hero (page 1 is the animated pilot orbit)
const EXTRA_SLIDES: {
  key: string;
  heroIcon: IconName;
  headline: string;
  body: string;
  pills: { label: string; icon: IconName }[];
}[] = [
  {
    key: 'earn',
    headline: 'Earn More, Keep More',
    body: 'Instant payouts and 100% of your tips.',
    heroIcon: 'wallet',
    pills: [
      { label: 'Instant\nPayouts', icon: 'flash' },
      { label: 'Keep 100%\nTips', icon: 'cash' },
      { label: 'Low\nCommission', icon: 'pricetag' },
      { label: 'Weekly\nBonuses', icon: 'gift' },
    ],
  },
  {
    key: 'safe',
    headline: 'Drive With Confidence',
    body: 'Verified riders and 24/7 support.',
    heroIcon: 'shield-checkmark',
    pills: [
      { label: 'Verified\nRiders', icon: 'checkmark-circle' },
      { label: 'SOS\nButton', icon: 'alert-circle' },
      { label: '24/7\nSupport', icon: 'headset' },
      { label: 'Safe\nTrips', icon: 'car-sport' },
    ],
  },
];

const SLIDE_PILL_POSITIONS = [
  { top: 42, right: 14 },
  { top: 114, left: 14 },
  { top: 232, left: 16 },
  { top: 234, right: 14 },
];

interface EntryStepProps {
  onBecomeDriver: () => void;
  onLogin: () => void;
}

export function EntryStep({ onBecomeDriver, onLogin }: EntryStepProps) {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const reducedMotion = useReducedMotion();

  // Swipeable hero pager (native-driven so it stays smooth while other animations run)
  const { width: windowWidth } = useWindowDimensions();
  const pageWidth = Math.min(windowWidth, 440);
  const [page, setPage] = useState(0);
  const [tx] = useState(() => new Animated.Value(0));
  const idx = useRef(0); // target page index, 0..PAGE_COUNT (PAGE_COUNT = clone of page 1)
  const dragBase = useRef(0);
  const dragReady = useRef(false);
  const userDragging = useRef(false);

  // Sticky slider bar animation values (elastic stretch & sticky spring)
  const [trackWidth, setTrackWidth] = useState(0);
  const [barPos] = useState(() => new Animated.Value(0));
  const [barStretch] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reducedMotion) {
      barPos.setValue(page);
      barStretch.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.spring(barPos, {
        toValue: page,
        tension: 190,
        friction: 14,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(barStretch, {
          toValue: 1.25,
          duration: 120,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(barStretch, {
          toValue: 1.0,
          tension: 220,
          friction: 11,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [page, reducedMotion, barPos, barStretch]);

  const barGap = 8;
  const segmentWidth = trackWidth > 0 ? (trackWidth - 2 * barGap) / 3 : 0;
  const barStep = segmentWidth + barGap;

  const slideTo = (i: number, duration = SLIDE_MS) => {
    idx.current = i;
    setPage(i % PAGE_COUNT);
    const wrap = () => {
      if (i >= PAGE_COUNT) {
        // landed on the clone of page 1: jump (invisibly) to the real page 1
        tx.setValue(0);
        idx.current = 0;
      }
    };
    if (reducedMotion) {
      tx.setValue(-i * pageWidth);
      wrap();
      return;
    }
    Animated.timing(tx, {
      toValue: -i * pageWidth,
      duration,
      easing: SLIDE_EASING,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) wrap();
    });
  };

  const goToPage = (i: number) => slideTo(i);

  // Finger drag: follows the finger, then eases to the nearest page (flick-aware)
  const pan = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- refs are only read inside gesture callbacks
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          userDragging.current = true;
          dragReady.current = false;
          tx.stopAnimation((v) => {
            dragBase.current = v;
            dragReady.current = true;
          });
        },
        onPanResponderMove: (_, g) => {
          if (!dragReady.current) return;
          const v = Math.max(-PAGE_COUNT * pageWidth, Math.min(0, dragBase.current + g.dx));
          tx.setValue(v);
        },
        onPanResponderRelease: (_, g) => {
          userDragging.current = false;
          const pos = dragBase.current + g.dx;
          const target = Math.round(-(pos + g.vx * 150) / pageWidth);
          slideTo(Math.max(0, Math.min(PAGE_COUNT, target)), 500);
        },
        onPanResponderTerminate: () => {
          userDragging.current = false;
          slideTo(Math.max(0, Math.min(PAGE_COUNT, idx.current)), 400);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageWidth, reducedMotion],
  );

  // Auto-slide forever (paused while the user drags; off for reduced motion)
  useEffect(() => {
    if (reducedMotion) return;
    const id = setInterval(() => {
      if (userDragging.current) return;
      slideTo(idx.current + 1);
    }, AUTO_SLIDE_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageWidth, reducedMotion]);

  // 1. Entrance pop values (staggered sticky spring physics)
  const [avatarScale] = useState(() => new Animated.Value(0));
  const [pill1Scale] = useState(() => new Animated.Value(0));
  const [pill2Scale] = useState(() => new Animated.Value(0));
  const [pill3Scale] = useState(() => new Animated.Value(0));
  const [pill4Scale] = useState(() => new Animated.Value(0));
  const [pill5Scale] = useState(() => new Animated.Value(0));

  // 2. Ambient looped motion values (isolated on inner nested containers to prevent matrix collisions)
  const [avatarPulse] = useState(() => new Animated.Value(1));
  const [bannerPulse] = useState(() => new Animated.Value(1));
  const [floatYLeft] = useState(() => new Animated.Value(0));
  const [floatYRight] = useState(() => new Animated.Value(0));
  const [beaconPulse] = useState(() => new Animated.Value(1));
  const [beaconOpacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    // Eagerly pre-warm audio subsystem on mount
    initPopSound().catch(() => {});

    // Respect Section 32 (Reduced Motion)
    if (reducedMotion) {
      avatarScale.setValue(1);
      pill1Scale.setValue(1);
      pill2Scale.setValue(1);
      pill3Scale.setValue(1);
      pill4Scale.setValue(1);
      pill5Scale.setValue(1);
      avatarPulse.setValue(1);
      bannerPulse.setValue(1);
      floatYLeft.setValue(0);
      floatYRight.setValue(0);
      beaconPulse.setValue(1);
      beaconOpacity.setValue(1);
      return;
    }

    // Ambient Loop A: Pilot avatar calm breathing pulse (Section 17/37: calm 2.8s cycle)
    const avatarLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(avatarPulse, {
          toValue: 1.035,
          duration: 1400,
          easing: motion.nativeEasing.smooth,
          useNativeDriver: true,
        }),
        Animated.timing(avatarPulse, {
          toValue: 1.0,
          duration: 1400,
          easing: motion.nativeEasing.smooth,
          useNativeDriver: true,
        }),
      ])
    );

    // Ambient Loop B: Center banner subtle pulse
    const bannerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bannerPulse, {
          toValue: 1.02,
          duration: 1600,
          easing: motion.nativeEasing.smooth,
          useNativeDriver: true,
        }),
        Animated.timing(bannerPulse, {
          toValue: 1.0,
          duration: 1600,
          easing: motion.nativeEasing.smooth,
          useNativeDriver: true,
        }),
      ])
    );

    // Ambient Loop C: Left pills smooth harmonic float (0 -> -4 -> 0 -> +4 -> 0)
    const floatLeftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatYLeft, {
          toValue: -4,
          duration: 1500,
          easing: motion.nativeEasing.smooth,
          useNativeDriver: true,
        }),
        Animated.timing(floatYLeft, {
          toValue: 4,
          duration: 3000,
          easing: motion.nativeEasing.smooth,
          useNativeDriver: true,
        }),
        Animated.timing(floatYLeft, {
          toValue: 0,
          duration: 1500,
          easing: motion.nativeEasing.smooth,
          useNativeDriver: true,
        }),
      ])
    );

    // Ambient Loop D: Right pills counter-phase float (0 -> +4 -> 0 -> -4 -> 0)
    const floatRightLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatYRight, {
          toValue: 4,
          duration: 1500,
          easing: motion.nativeEasing.smooth,
          useNativeDriver: true,
        }),
        Animated.timing(floatYRight, {
          toValue: -4,
          duration: 3000,
          easing: motion.nativeEasing.smooth,
          useNativeDriver: true,
        }),
        Animated.timing(floatYRight, {
          toValue: 0,
          duration: 1500,
          easing: motion.nativeEasing.smooth,
          useNativeDriver: true,
        }),
      ])
    );

    // Ambient Loop E: Online beacon glow halo (Section 17: subtle pulse, no flashing)
    const beaconLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(beaconPulse, {
            toValue: 1.45,
            duration: 1200,
            easing: motion.nativeEasing.smooth,
            useNativeDriver: true,
          }),
          Animated.timing(beaconPulse, {
            toValue: 1.0,
            duration: 1200,
            easing: motion.nativeEasing.smooth,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(beaconOpacity, {
            toValue: 0.45,
            duration: 1200,
            easing: motion.nativeEasing.smooth,
            useNativeDriver: true,
          }),
          Animated.timing(beaconOpacity, {
            toValue: 1.0,
            duration: 1200,
            easing: motion.nativeEasing.smooth,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    // Start all continuous ambient loops cleanly
    avatarLoop.start();
    bannerLoop.start();
    floatLeftLoop.start();
    floatRightLoop.start();
    beaconLoop.start();

    // 4. Staggered sticky entrance sequence with synchronized pop sound
    const stickySpring = (value: Animated.Value) =>
      Animated.spring(value, {
        toValue: 1,
        tension: 40,
        friction: 5.2,
        useNativeDriver: true,
      });

    const staggerInterval = 200;
    const pops = [avatarScale, pill1Scale, pill2Scale, pill3Scale, pill4Scale, pill5Scale];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const running: Animated.CompositeAnimation[] = [];
    let cancelled = false;

    // Wait for the audio to be decoded/loaded (max 700ms), then fire each pop's
    // sound and spring from the SAME timer tick so they cannot drift apart.
    whenPopSoundReady(700).then(() => {
      if (cancelled) return;
      pops.forEach((value, index) => {
        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            playPopSound();
            const spring = stickySpring(value);
            running.push(spring);
            spring.start();
          }, index * staggerInterval)
        );
      });
    });

    // Clean up all timers and stop all running loops on unmount
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      running.forEach((a) => a.stop());
      avatarLoop.stop();
      bannerLoop.stop();
      floatLeftLoop.stop();
      floatRightLoop.stop();
      beaconLoop.stop();
    };
  }, [
    reducedMotion,
    avatarScale,
    pill1Scale,
    pill2Scale,
    pill3Scale,
    pill4Scale,
    pill5Scale,
    avatarPulse,
    bannerPulse,
    floatYLeft,
    floatYRight,
    beaconPulse,
    beaconOpacity,
  ]);

  // Clean single-transform entrance style (no duplicate scale keys)
  const getPopStyle = (scaleVal: Animated.Value) => ({
    opacity: scaleVal.interpolate({
      inputRange: [0, 0.25, 1],
      outputRange: [0, 0.85, 1],
    }),
    transform: [{ scale: scaleVal }],
  });

  const renderCopy = (headline: string, body: string) => (
    <View style={styles.copySection}>
      <Text style={styles.headline} numberOfLines={1} adjustsFontSizeToFit>{headline}</Text>
      <Text style={styles.bodyText} numberOfLines={1} adjustsFontSizeToFit>{body}</Text>
    </View>
  );

  const pilotPage = (key: string) => (
    <View key={key} style={{ width: pageWidth, paddingHorizontal: 20, alignItems: 'center' }}>
      <View style={styles.orbitalContainer}>
        {/* Soft Warm Circular Backdrop Spotlight */}
        <BlobBackground />

        {/* Dashed Golden Elliptical Orbit Ring */}
        <View style={styles.dashedOrbit} />

        {/* Central Pilot Avatar with Glowing Golden Ring */}
        <Animated.View
          style={[
            styles.avatarGlowRing,
            getPopStyle(avatarScale),
          ]}>
          <Animated.View style={{ transform: [{ scale: avatarPulse }] }}>
            <Image
              source={require('@/assets/images/driverAvatar.png')}
              style={styles.avatarImage}
              resizeMode="cover"
            />
          </Animated.View>
        </Animated.View>

        {/* Pill 1: Top-Right (Avg. Daily) */}
        <Animated.View
          style={[
            styles.pillAvgDaily,
            getPopStyle(pill1Scale),
          ]}>
          <Animated.View style={[styles.pillInnerRow, { transform: [{ translateY: floatYRight }] }]}>
            <View style={styles.walletIconBox}>
              <Ionicons name="receipt-outline" size={17} color="#92400E" />
            </View>
            <View>
              <Text style={styles.avgDailyLabel}>Avg. Daily</Text>
              <Text style={styles.avgDailyValue}>₹250</Text>
            </View>
          </Animated.View>
        </Animated.View>

        {/* Pill 2: Mid-Left (Online Now) */}
        <Animated.View
          style={[
            styles.pillOnlineNow,
            getPopStyle(pill2Scale),
          ]}>
          <Animated.View style={[styles.pillInnerRow, { transform: [{ translateY: floatYLeft }] }]}>
            <Animated.View
              style={[
                styles.greenBeaconOuter,
                {
                  transform: [{ scale: beaconPulse }],
                  opacity: beaconOpacity,
                },
              ]}>
              <View style={styles.greenBeaconDot} />
            </Animated.View>
            <Text style={styles.onlineNowText}>Online{'\n'}Now</Text>
          </Animated.View>
        </Animated.View>

        {/* Pill 3: Center Banner (Drive, Earn & Keep 100% Tips) */}
        <Animated.View
          style={[
            styles.pillCenterBanner,
            getPopStyle(pill3Scale),
          ]}>
          <Animated.View style={[styles.pillInnerRow, { transform: [{ scale: bannerPulse }], width: '100%' }]}>
            <View style={styles.checkBadge}>
              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
            </View>
            <Text style={styles.centerBannerText}>
              Drive, Earn & Keep 100%{'\n'}Tips
            </Text>
          </Animated.View>
        </Animated.View>

        {/* Pill 4: Bottom-Left (24/7 Support) */}
        <Animated.View
          style={[
            styles.pillSupport,
            getPopStyle(pill4Scale),
          ]}>
          <Animated.View style={[styles.pillInnerRow, { transform: [{ translateY: floatYLeft }] }]}>
            <View style={styles.amberIconBox}>
              <Ionicons name="shield-checkmark" size={15} color="#D97706" />
            </View>
            <Text style={styles.pillSmallText}>24/7{'\n'}Support</Text>
          </Animated.View>
        </Animated.View>

        {/* Pill 5: Bottom-Right (Smart Dispatch) */}
        <Animated.View
          style={[
            styles.pillDispatch,
            getPopStyle(pill5Scale),
          ]}>
          <Animated.View style={[styles.pillInnerRow, { transform: [{ translateY: floatYRight }] }]}>
            <View style={styles.amberIconBox}>
              <Ionicons name="car-sport" size={16} color="#D97706" />
            </View>
            <Text style={styles.pillSmallText}>Smart{'\n'}Dispatch</Text>
          </Animated.View>
        </Animated.View>
      </View>
      {renderCopy(PILOT_COPY.headline, PILOT_COPY.body)}
    </View>
  );

  return (
    <View style={styles.outerContainer}>
      <View style={[styles.screen, isWeb && { maxWidth: 440 }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top, 22) + 12,
              paddingBottom: Math.max(insets.bottom, 16) + 6,
            },
          ]}
          showsVerticalScrollIndicator={false}
          bounces={false}>
          {/* Top Story / Progress Indicators with Sticky Spring Animation */}
          <View
            style={styles.storyBarsContainer}
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
            {[0, 1, 2].map((i) => (
              <Pressable
                key={i}
                hitSlop={{ top: 14, bottom: 14, left: 6, right: 6 }}
                style={styles.storyBarHit}
                onPress={() => goToPage(i)}>
                <View style={styles.storyBar} />
              </Pressable>
            ))}

            {/* Active Sticky Animated Bar */}
            {segmentWidth > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.storyBarActiveSticky,
                  {
                    width: segmentWidth,
                    transform: [
                      {
                        translateX: barPos.interpolate({
                          inputRange: [0, 1, 2],
                          outputRange: [0, barStep, barStep * 2],
                        }),
                      },
                      { scaleX: barStretch },
                    ],
                  },
                ]}
              />
            )}
          </View>

          <View style={styles.mainStack}>
            {/* Swipeable hero pager: top-centered native-driven translateX track */}
            <View
              style={{
                width: pageWidth,
                marginHorizontal: -20,
                alignSelf: 'center',
                overflow: 'hidden',
                marginTop: 10,
              }}
              {...pan.panHandlers}>
              <Animated.View
                style={{
                  flexDirection: 'row',
                  width: pageWidth * (PAGE_COUNT + 1),
                  transform: [{ translateX: tx }],
                }}>
                {pilotPage('p0')}

                {EXTRA_SLIDES.map((slide) => (
                  <View key={slide.key} style={{ width: pageWidth, paddingHorizontal: 20, alignItems: 'center' }}>
                    <View style={styles.orbitalContainer}>
                      <BlobBackground />
                      <View style={styles.dashedOrbit} />

                      <Animated.View style={[styles.avatarGlowRing, { transform: [{ scale: avatarPulse }] }]}>
                        <View style={styles.slideHeroIcon}>
                          <Ionicons name={slide.heroIcon} size={40} color="#D97706" />
                        </View>
                      </Animated.View>

                      {slide.pills.map((pill, i) => (
                        <Animated.View
                          key={pill.label}
                          style={[
                            styles.pillBase,
                            SLIDE_PILL_POSITIONS[i],
                            { transform: [{ translateY: i % 2 === 0 ? floatYLeft : floatYRight }] },
                          ]}>
                          <View style={styles.pillInnerRow}>
                            <View style={styles.amberIconBox}>
                              <Ionicons name={pill.icon} size={15} color="#D97706" />
                            </View>
                            <Text style={styles.pillSmallText}>{pill.label}</Text>
                          </View>
                        </Animated.View>
                      ))}
                    </View>
                    {renderCopy(slide.headline, slide.body)}
                  </View>
                ))}
                {/* Clone of page 1 so the loop wraps seamlessly */}
                {pilotPage('p0-clone')}
              </Animated.View>
            </View>

            {/* Flexible spacer between top-centered slider and CTA */}
            <View style={styles.midSpacer} />

            {/* Action CTAs */}
            <View style={styles.ctaSection}>
              <CandyButton
                title="Get Started as Driver"
                onPress={onBecomeDriver}
                icon={<Ionicons name="arrow-forward" size={19} color="#FFFFFF" />}
                style={{ width: '100%', maxWidth: 360, alignSelf: 'center' }}
              />

              <View style={styles.footerRow}>
                <Text style={styles.footerPrompt}>Already a registered partner? </Text>
                <Pressable onPress={onLogin} hitSlop={10}>
                  <Text style={styles.loginLink}>Log in</Text>
                </Pressable>
              </View>
            </View>

            {/* Bottom breathing space */}
            <View style={styles.bottomSpacer} />
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  storyBarHit: {
    flex: 1,
    justifyContent: 'center',
  },
  pillBase: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 13,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    zIndex: 6,
  },
  slideHeroIcon: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FFF7DB',
    borderWidth: 4,
    borderColor: '#F5B301',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerContainer: {
    flex: 1,
    backgroundColor: Platform.OS === 'web' ? '#0F172A' : '#FFFDF7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FFFDF7',
    position: 'relative',
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  mainStack: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    width: '100%',
    paddingTop: 10,
  },
  midSpacer: {
    flex: 1,
    minHeight: 32,
    maxHeight: 80,
  },
  bottomSpacer: {
    flex: 1,
    minHeight: 8,
    maxHeight: 24,
  },
  storyBarsContainer: {
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    height: 16,
    marginBottom: 18,
    position: 'relative',
  },
  storyBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5DECB',
  },
  storyBarActiveSticky: {
    position: 'absolute',
    left: 4,
    top: 6,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#111827',
  },
  orbitalContainer: {
    height: 350,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 390,
  },
  spotlightDisc: {
    position: 'absolute',
    width: 310,
    height: 310,
    borderRadius: 155,
    backgroundColor: '#FFF2C2',
    opacity: 0.72,
    alignSelf: 'center',
    top: 5,
  },
  dashedOrbit: {
    position: 'absolute',
    width: 290,
    height: 204,
    borderRadius: 145,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#E5C368',
    top: 52,
    alignSelf: 'center',
  },
  avatarGlowRing: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    width: 90,
    height: 90,
    borderRadius: 45,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
    zIndex: 5,
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  pillAvgDaily: {
    position: 'absolute',
    top: 36,
    right: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 13,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
    zIndex: 6,
  },
  pillInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walletIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#FDF2E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avgDailyLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
  },
  avgDailyValue: {
    fontSize: 13.5,
    color: '#111827',
    fontWeight: '800',
  },
  pillOnlineNow: {
    position: 'absolute',
    top: 96,
    left: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
    zIndex: 6,
  },
  greenBeaconOuter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  greenBeaconDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#059669',
  },
  onlineNowText: {
    fontSize: 11,
    color: '#111827',
    fontWeight: '800',
    lineHeight: 13,
  },
  pillCenterBanner: {
    position: 'absolute',
    top: 144,
    alignSelf: 'center',
    width: '90%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
    zIndex: 10,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  centerBannerText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 16,
  },
  pillSupport: {
    position: 'absolute',
    top: 232,
    left: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 13,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    zIndex: 6,
  },
  pillDispatch: {
    position: 'absolute',
    top: 232,
    right: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 13,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    zIndex: 6,
  },
  amberIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  pillSmallText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 13,
  },
  copySection: {
    marginTop: 36,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  headline: {
    fontSize: 27,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.6,
    lineHeight: 33,
  },
  bodyText: {
    marginTop: 6,
    fontSize: 13.5,
    lineHeight: 20,
    color: '#4B5563',
    textAlign: 'center',
    maxWidth: '92%',
    fontWeight: '400',
  },
  ctaSection: {
    alignItems: 'center',
    width: '100%',
  },
  primaryBtn: {
    width: '100%',
    height: 54,
    borderRadius: 18,
    backgroundColor: '#3D2314',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3D2314',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  arrowIcon: {
    marginLeft: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    marginBottom: 0,
  },
  footerPrompt: {
    fontSize: 13.5,
    color: '#6B7280',
    fontWeight: '500',
  },
  loginLink: {
    fontSize: 13.5,
    color: '#0F172A',
    fontWeight: '800',
  },
  homeIndicator: {
    width: 134,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5DECB',
    alignSelf: 'center',
    marginTop: 10,
  },
});
