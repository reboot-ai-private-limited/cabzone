import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '@/design-system';
import {
  computeKeyboardBottomPadding,
  computeScrollDeltaForFocusedRect,
} from './onboarding-ux-helpers';

export { computeKeyboardBottomPadding, computeScrollDeltaForFocusedRect };

export interface MeasurableTarget {
  measureInWindow?: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
  measure?: (
    callback: (
      x: number,
      y: number,
      width: number,
      height: number,
      pageX: number,
      pageY: number,
    ) => void,
  ) => void;
}

export interface OnboardingFormScrollHandle {
  focusTarget: (target: MeasurableTarget | null) => void;
  scrollToTop: (animated?: boolean) => void;
}

function measureTargetRect(
  target: MeasurableTarget,
  cb: (topY: number, height: number) => void,
): void {
  if (typeof target.measureInWindow === 'function') {
    target.measureInWindow((_x, y, _w, h) => cb(y, h));
    return;
  }
  if (typeof target.measure === 'function') {
    target.measure((_x, _y, _w, h, _pageX, pageY) => cb(pageY, h));
  }
}

export interface OnboardingFormScrollProps extends Omit<ScrollViewProps, 'contentContainerStyle'> {
  topPadding?: number;
  baseBottomPadding?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  showKeyboardDismissPill?: boolean;
  children: React.ReactNode;
}

export const OnboardingFormScroll = forwardRef<
  OnboardingFormScrollHandle,
  OnboardingFormScrollProps
>(function OnboardingFormScroll(
  {
    topPadding = 16,
    baseBottomPadding = 44,
    contentContainerStyle,
    showKeyboardDismissPill = true,
    onScroll,
    children,
    ...rest
  },
  ref,
) {
  const containerRef = useRef<React.ComponentRef<typeof View>>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrollOffsetRef = useRef(0);
  const restingHeightRef = useRef(0);
  const currentHeightRef = useRef(0);
  const keyboardScreenYRef = useRef(0);
  const activeTargetRef = useRef<MeasurableTarget | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const scrollActiveTargetIntoView = useCallback(() => {
    const target = activeTargetRef.current;
    const container = containerRef.current;
    if (!target || !container) return;

    measureTargetRect(container, (containerTopY, measuredContainerH) => {
      const effectiveContainerH = measuredContainerH || currentHeightRef.current;
      measureTargetRect(target, (targetTopY, targetHeight) => {
        const nextY = computeScrollDeltaForFocusedRect({
          currentScrollY: scrollOffsetRef.current,
          containerTopY,
          containerHeight: effectiveContainerH,
          keyboardScreenY: keyboardScreenYRef.current,
          targetTopY,
          targetHeight,
        });
        if (nextY !== null) {
          scrollRef.current?.scrollTo({ y: nextY, animated: true });
        }
      });
    });
  }, []);

  const scheduleScrollCheck = useCallback(
    (delayMs = 90) => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        scrollActiveTargetIntoView();
      }, delayMs);
    },
    [scrollActiveTargetIntoView],
  );

  useImperativeHandle(
    ref,
    () => ({
      focusTarget(target: MeasurableTarget | null) {
        activeTargetRef.current = target;
        if (target) {
          scheduleScrollCheck(80);
        }
      },
      scrollToTop(animated = false) {
        scrollOffsetRef.current = 0;
        scrollRef.current?.scrollTo({ y: 0, animated });
      },
    }),
    [scheduleScrollCheck],
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      const height = Math.max(0, event.endCoordinates?.height ?? 0);
      keyboardScreenYRef.current = event.endCoordinates?.screenY ?? 0;
      setKeyboardHeight(height);
      scheduleScrollCheck(Platform.OS === 'ios' ? 60 : 110);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardScreenYRef.current = 0;
      setKeyboardHeight(0);
    });

    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      showSub.remove();
      hideSub.remove();
    };
  }, [scheduleScrollCheck]);

  const handleContainerLayout = (event: LayoutChangeEvent) => {
    const h = event.nativeEvent.layout.height;
    currentHeightRef.current = h;
    setContainerHeight(h);
    if (keyboardHeight === 0 && h > 0) {
      restingHeightRef.current = Math.max(restingHeightRef.current, h);
    } else if (keyboardHeight > 0) {
      scheduleScrollCheck(50);
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  };

  const effectiveBottomPadding = computeKeyboardBottomPadding({
    platform: Platform.OS,
    keyboardHeight,
    restingContainerHeight: restingHeightRef.current,
    currentContainerHeight: containerHeight || currentHeightRef.current,
    baseBottomPadding,
  });

  const shrunkBy =
    Platform.OS === 'ios'
      ? keyboardHeight
      : restingHeightRef.current > 0 && containerHeight > 0
        ? Math.max(0, restingHeightRef.current - containerHeight)
        : 0;
  const uncompensatedKeyboardHeight =
    Platform.OS === 'ios' ? 0 : Math.max(0, keyboardHeight - shrunkBy);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <View
        ref={containerRef}
        collapsable={false}
        style={styles.inner}
        onLayout={handleContainerLayout}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: topPadding,
              paddingBottom: effectiveBottomPadding,
            },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={handleScroll}
          {...rest}>
          {children}
        </ScrollView>

        {showKeyboardDismissPill && keyboardHeight > 0 ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.dismissPillAnchor,
              { bottom: uncompensatedKeyboardHeight + 10 },
            ]}>
            <Pressable
              onPress={() => Keyboard.dismiss()}
              style={({ pressed }) => [styles.dismissPill, pressed && styles.dismissPillPressed]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Hide keyboard">
              <Text style={styles.dismissPillText}>Done</Text>
              <Ionicons name="chevron-down" size={15} color={colors.deepBrown} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  dismissPillAnchor: {
    position: 'absolute',
    right: 16,
    alignItems: 'flex-end',
  },
  dismissPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  dismissPillPressed: {
    opacity: 0.85,
  },
  dismissPillText: {
    fontSize: typography.sizes.xs,
    fontWeight: '800',
    color: colors.deepBrown,
  },
});
