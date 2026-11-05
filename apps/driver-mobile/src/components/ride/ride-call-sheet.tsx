import React, { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { CallViewMode } from '@/services/ride-call';
import { createStyles } from '@/design-system';

export interface RideCallSheetProps {
  viewMode: Exclude<CallViewMode, 'idle'>;
  minimised: boolean;
  name: string;
  timerLabel: string;
  /** Deadline for answering an incoming call; shown as a countdown. */
  ringingUntil?: string | null;
  notice?: string | null;
  muted: boolean;
  speaker: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  onMinimise: () => void;
  onRestore: () => void;
  onChat: () => void;
  onOpenSettings: () => void;
  onDismiss: () => void;
}

const GREEN = '#22C55E';
const RED = '#EF4444';
const INK = '#1B1209';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : '')).toUpperCase();
}

function PulseRing({ delay, active }: { delay: number; active: boolean }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) {
      progress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration: 2100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, delay, progress]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pulseRing,
        {
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 2.3] }) }],
        },
      ]}
    />
  );
}

function RoundButton({
  icon,
  label,
  color,
  size = 56,
  active = false,
  dark = false,
  rotate,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color?: string;
  size?: number;
  active?: boolean;
  dark?: boolean;
  rotate?: string;
  onPress: () => void;
}) {
  const bg = color ?? (active ? INK : dark ? 'rgba(255,255,255,0.16)' : '#F1ECE6');
  const fg = color || active ? '#FFFFFF' : dark ? '#FFFFFF' : INK;
  return (
    <View style={styles.roundWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [
          styles.round,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          name={icon}
          size={size * 0.46}
          color={fg}
          style={rotate ? { transform: [{ rotate }] } : undefined}
        />
      </Pressable>
      <Text style={[styles.roundLabel, dark && styles.roundLabelDark]}>{label}</Text>
    </View>
  );
}

function IncomingCallScreen({
  name,
  ringingUntil,
  onAccept,
  onDecline,
}: Pick<RideCallSheetProps, 'name' | 'ringingUntil' | 'onAccept' | 'onDecline'>) {
  const reducedMotion = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const untilMs = ringingUntil ? Date.parse(ringingUntil) : NaN;
  const secondsLeft = Number.isFinite(untilMs) ? Math.max(0, Math.ceil((untilMs - now) / 1000)) : null;

  return (
    <View style={styles.fullScreen} accessibilityViewIsModal accessibilityLiveRegion="assertive">
      <LinearGradient colors={['#2A1A0E', '#1B1209', '#0E0905']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.incomingBody} edges={['top', 'bottom']}>
        <View style={styles.incomingTop}>
          <View style={styles.privateChip}>
            <Ionicons name="shield-checkmark" size={14} color="#FBBF24" />
            <Text style={styles.privateChipText}>Private ride call · numbers hidden</Text>
          </View>
        </View>

        <View style={styles.incomingCenter}>
          <View style={styles.avatarStage}>
            <PulseRing delay={0} active={!reducedMotion} />
            <PulseRing delay={700} active={!reducedMotion} />
            <PulseRing delay={1400} active={!reducedMotion} />
            <LinearGradient colors={['#FBBF24', '#F59E0B']} style={styles.avatar}>
              <Text style={styles.avatarText}>{initialsOf(name)}</Text>
            </LinearGradient>
          </View>
          <Text style={styles.callerName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.ringingText}>
            Incoming call{secondsLeft !== null ? ` · ${secondsLeft}s` : ''}
          </Text>
        </View>

        <View style={styles.incomingActions}>
          <RoundButton
            icon="call"
            label="Decline"
            color={RED}
            size={72}
            rotate="135deg"
            dark
            onPress={onDecline}
          />
          <RoundButton icon="call" label="Accept" color={GREEN} size={72} dark onPress={onAccept} />
        </View>
      </SafeAreaView>
    </View>
  );
}

export function RideCallSheet(props: RideCallSheetProps) {
  const {
    viewMode,
    minimised,
    name,
    timerLabel,
    notice,
    muted,
    speaker,
    onAccept,
    onDecline,
    onEnd,
    onToggleMute,
    onToggleSpeaker,
    onMinimise,
    onRestore,
    onChat,
    onOpenSettings,
    onDismiss,
  } = props;

  if (viewMode === 'incoming') {
    return (
      <IncomingCallScreen
        name={name}
        ringingUntil={props.ringingUntil}
        onAccept={onAccept}
        onDecline={onDecline}
      />
    );
  }

  if (minimised) {
    return (
      <View style={styles.bannerWrap} pointerEvents="box-none">
        <Pressable
          style={styles.returnBanner}
          onPress={onRestore}
          accessibilityRole="button"
          accessibilityLabel="Return to private ride call"
        >
          <View style={styles.liveDot} />
          <Text style={styles.returnBannerText}>
            {viewMode === 'connected' ? `Return to call · ${timerLabel}` : `Return to call · ${name}`}
          </Text>
        </Pressable>
      </View>
    );
  }

  const status =
    viewMode === 'outgoing'
      ? 'Calling…'
      : viewMode === 'connecting'
        ? 'Connecting…'
        : viewMode === 'connected'
          ? timerLabel
          : viewMode === 'mic_denied'
            ? 'Microphone access is needed for private calls.'
            : (notice ?? "Couldn't connect. Try chat.");
  const inCall = viewMode === 'outgoing' || viewMode === 'connecting' || viewMode === 'connected';

  return (
    <View style={styles.sheetWrap} pointerEvents="box-none">
      <View style={styles.sheet} accessibilityLiveRegion="polite">
        <View style={styles.sheetHeader}>
          <LinearGradient colors={['#FBBF24', '#F59E0B']} style={styles.smallAvatar}>
            <Text style={styles.smallAvatarText}>{initialsOf(name)}</Text>
          </LinearGradient>
          <View style={styles.flex}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {name}
            </Text>
            <View style={styles.statusRow}>
              {viewMode === 'connected' ? <View style={styles.liveDot} /> : null}
              <Text style={styles.sheetSub} numberOfLines={2}>
                {status}
              </Text>
            </View>
          </View>
          {inCall ? (
            <Pressable
              style={styles.hideBtn}
              onPress={onMinimise}
              accessibilityRole="button"
              accessibilityLabel="Minimise call controls"
            >
              <Ionicons name="chevron-down" size={20} color={INK} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.controlsRow}>
          {viewMode === 'connected' ? (
            <>
              <RoundButton
                icon={muted ? 'mic-off' : 'mic'}
                label={muted ? 'Unmute' : 'Mute'}
                active={muted}
                onPress={onToggleMute}
              />
              <RoundButton
                icon={speaker ? 'volume-high' : 'ear'}
                label={speaker ? 'Speaker' : 'Earpiece'}
                active={speaker}
                onPress={onToggleSpeaker}
              />
              <RoundButton icon="chatbubble-ellipses" label="Chat" onPress={onChat} />
              <RoundButton icon="call" label="End" color={RED} rotate="135deg" onPress={onEnd} />
            </>
          ) : viewMode === 'outgoing' || viewMode === 'connecting' ? (
            <>
              <RoundButton icon="chatbubble-ellipses" label="Chat" onPress={onChat} />
              <RoundButton icon="call" label="End" color={RED} rotate="135deg" onPress={onEnd} />
            </>
          ) : viewMode === 'mic_denied' ? (
            <>
              <RoundButton icon="settings" label="Settings" onPress={onOpenSettings} />
              <RoundButton icon="chatbubble-ellipses" label="Try chat" color={GREEN} onPress={onChat} />
              <RoundButton icon="close" label="Dismiss" onPress={onDismiss} />
            </>
          ) : (
            <>
              <RoundButton icon="chatbubble-ellipses" label="Try chat" color={GREEN} onPress={onChat} />
              <RoundButton icon="close" label="Dismiss" onPress={onDismiss} />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = createStyles(() => ({
  flex: { flex: 1 },
  pressed: { transform: [{ scale: 0.94 }], opacity: 0.9 },
  fullScreen: { ...StyleSheet.absoluteFill, zIndex: 1000, elevation: 20 },
  incomingBody: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 24 },
  incomingTop: { alignItems: 'center', paddingTop: 12 },
  privateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.14)',
  },
  privateChipText: { color: '#FBBF24', fontSize: 12, fontWeight: '600' },
  incomingCenter: { alignItems: 'center', gap: 10 },
  avatarStage: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  pulseRing: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    borderColor: '#FBBF24',
  },
  avatar: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 40, fontWeight: '800', color: INK },
  callerName: { fontSize: 30, fontWeight: '800', color: '#FFFFFF', maxWidth: '90%' },
  ringingText: { fontSize: 16, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  incomingActions: { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 28 },
  roundWrap: { alignItems: 'center', gap: 6, minWidth: 64 },
  round: { alignItems: 'center', justifyContent: 'center' },
  roundLabel: { fontSize: 12, fontWeight: '600', color: '#6B5E54' },
  roundLabelDark: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  bannerWrap: { position: 'absolute', top: 52, left: 16, right: 16, alignItems: 'center', zIndex: 999 },
  returnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: INK,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  returnBannerText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN },
  sheetWrap: { position: 'absolute', left: 12, right: 12, top: 52, zIndex: 1000 },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 18,
    elevation: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  smallAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  smallAvatarText: { fontSize: 17, fontWeight: '800', color: INK },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: INK },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  sheetSub: { fontSize: 14, color: '#6B5E54', flexShrink: 1 },
  hideBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1ECE6',
  },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start' },
}));
