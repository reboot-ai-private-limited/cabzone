import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  Linking,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Room, RoomEvent } from 'livekit-client';
import { RIDE_COMMUNICATION_STATUSES, type RideCallDto } from '@cabzone/contracts';
import { useAuth } from './auth-context';
import { useRide } from './ride-context';
import { rideCallsApi } from '@/services/api';
import { getOrCreateDeviceId } from '@/services/storage';
import { setActiveRideCallRoom, stopActiveRideCallMedia } from '@/services/ride-call-media';
import {
  dismissSystemIncomingCall,
  ensureLiveKitGlobals,
  getIncomingRideIdForCall,
  hasNativeCallKeep,
  hasNativeWebRtc,
  isProgrammaticCallKeepEnd,
  presentSystemIncomingCall,
  setupCallKeepOnce,
} from '@/services/voice-bootstrap';
import {
  deriveCallViewMode,
  formatCallDuration,
  isActiveRideCall,
  newCallRequestId,
} from '@/services/ride-call';
import { RideCallSheet } from '@/components/ride/ride-call-sheet';
import { startCallRing } from '@/services/ringtone';

interface RideCallContextValue {
  activeCall: RideCallDto | null;
  startCall: (rideId: string, counterpartName?: string) => Promise<void>;
  acceptCall: (rideId?: string, callId?: string) => Promise<void>;
  declineCall: (rideId?: string, callId?: string) => Promise<void>;
  endCall: () => Promise<void>;
}

const RideCallContext = createContext<RideCallContextValue | null>(null);

export function RideCallProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token } = useAuth();
  const { activeRide, chatRevision } = useRide();

  const eligibleRide = useMemo(() => {
    if (!token || !activeRide) return null;
    if (!RIDE_COMMUNICATION_STATUSES.includes(activeRide.status)) return null;
    return activeRide;
  }, [activeRide, token]);

  const [call, setCall] = useState<RideCallDto | null>(null);
  const [minimised, setMinimised] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [audioConnected, setAudioConnected] = useState(false);
  const [connectedAtMs, setConnectedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [micDenied, setMicDenied] = useState(false);
  const [terminalNotice, setTerminalNotice] = useState<string | null>(null);
  const [counterpartOverride, setCounterpartOverride] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const callRef = useRef<RideCallDto | null>(null);
  const joinedCallIdRef = useRef<string | null>(null);
  const answeredByMeRef = useRef<string | null>(null);
  const selfEndedCallIdRef = useRef<string | null>(null);
  const alertedCallIdRef = useRef<string | null>(null);
  const handledNotifRef = useRef<string | null>(null);

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  const counterpartName =
    counterpartOverride || eligibleRide?.passenger?.name?.trim() || 'Passenger';

  const teardownLocalMedia = useCallback(async (dismissCallId?: string | null) => {
    joinedCallIdRef.current = null;
    const activeRoom = roomRef.current;
    roomRef.current = null;
    setActiveRideCallRoom(null);
    try {
      await activeRoom?.disconnect();
    } catch {
      // ignore disconnect race
    }
    await stopActiveRideCallMedia();
    if (dismissCallId) {
      await dismissSystemIncomingCall(dismissCallId);
    }
    setAudioConnected(false);
    setConnectedAtMs(null);
    setMuted(false);
    setSpeaker(true);
  }, []);

  const connectMediaRoom = useCallback(
    async (targetCall: RideCallDto) => {
      if (!token || joinedCallIdRef.current === targetCall.id) return;
      joinedCallIdRef.current = targetCall.id;
      try {
        if (Platform.OS === 'android') {
          const perm = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          );
          if (perm !== PermissionsAndroid.RESULTS.GRANTED) {
            selfEndedCallIdRef.current = targetCall.id;
            void rideCallsApi.end(token, targetCall.rideId, targetCall.id).catch(() => {});
            await teardownLocalMedia(targetCall.id);
            setCall(null);
            setMinimised(false);
            setMicDenied(true);
            return;
          }
        }
        if (!ensureLiveKitGlobals()) {
          throw new Error('Private calls require the native Cabzone Driver app build.');
        }
        const installationId = await getOrCreateDeviceId();
        const cred = await rideCallsApi.token(
          token,
          targetCall.rideId,
          targetCall.id,
          installationId,
        );
        if (hasNativeWebRtc()) {
          const lk = await import('@livekit/react-native');
          await lk.AudioSession.configureAudio({
            android: {
              preferredOutputList: ['speaker', 'earpiece', 'headset', 'bluetooth'],
              audioTypeOptions: lk.AndroidAudioTypePresets.communication,
            },
            ios: { defaultOutput: 'speaker' },
          });
          await lk.AudioSession.startAudioSession();
        }
        const room = new Room();
        roomRef.current = room;
        setActiveRideCallRoom(room);

        const markRemoteConnected = () => {
          setAudioConnected(true);
          setConnectedAtMs((prev) => prev ?? Date.now());
          void rideCallsApi.connected(token, targetCall.rideId, targetCall.id).catch(() => {});
        };
        room.on(RoomEvent.ParticipantConnected, markRemoteConnected);
        room.on(RoomEvent.TrackSubscribed, markRemoteConnected);

        await room.connect(cred.url, cred.token);
        await room.localParticipant.setMicrophoneEnabled(true);
        if (room.remoteParticipants.size > 0) {
          markRemoteConnected();
        }
        await dismissSystemIncomingCall(targetCall.id);
      } catch {
        await teardownLocalMedia(targetCall.id);
        setCall(null);
        setMinimised(false);
        setTerminalNotice("Couldn't connect. Try chat.");
      }
    },
    [teardownLocalMedia, token],
  );

  const syncCurrentCall = useCallback(async () => {
    if (!token || !eligibleRide) return;
    try {
      const res = await rideCallsApi.current(token, eligibleRide.id);
      const next = res.call;
      const prev = callRef.current;
      if (isActiveRideCall(next)) {
        setCall(next);
        if (next.connectedAt) {
          const parsed = Date.parse(next.connectedAt);
          if (Number.isFinite(parsed)) {
            setConnectedAtMs((cur) => cur ?? parsed);
          }
        }
        if (
          next.state === 'RINGING' &&
          next.callerRole !== 'DRIVER' &&
          alertedCallIdRef.current !== next.id
        ) {
          alertedCallIdRef.current = next.id;
          setTerminalNotice(null);
          setMicDenied(false);
          setMinimised(false);
          if (AppState.currentState !== 'active') {
            void presentSystemIncomingCall(
              {
                callId: next.id,
                rideId: next.rideId,
                callerName: counterpartName,
                expiresAt: next.ringingUntil,
              },
              'Cabzone Driver',
            );
          }
        }
        if (
          (next.state === 'ACCEPTED' || next.state === 'CONNECTED') &&
          (next.callerRole === 'DRIVER' || answeredByMeRef.current === next.id) &&
          joinedCallIdRef.current !== next.id
        ) {
          void connectMediaRoom(next);
        }
      } else if (prev) {
        await teardownLocalMedia(prev.id);
        setCall(null);
        if (
          selfEndedCallIdRef.current !== prev.id &&
          (prev.state === 'RINGING' || prev.state === 'ACCEPTED')
        ) {
          setMinimised(false);
          setTerminalNotice("Couldn't connect. Try chat.");
        }
      }
    } catch {
      // Transient sync loss; server deadlines remain authoritative.
    }
  }, [connectMediaRoom, counterpartName, eligibleRide, teardownLocalMedia, token]);

  useEffect(() => {
    if (token && eligibleRide) return;
    const prev = callRef.current;
    if (prev || roomRef.current) {
      void teardownLocalMedia(prev?.id ?? null);
    }
    setCall(null);
    setMinimised(false);
    setMicDenied(false);
    setTerminalNotice(null);
    setCounterpartOverride(null);
  }, [eligibleRide, teardownLocalMedia, token]);

  useEffect(() => {
    if (!token || !eligibleRide) return;
    const boot = setTimeout(() => {
      void syncCurrentCall();
    }, 0);
    return () => clearTimeout(boot);
  }, [chatRevision, eligibleRide, syncCurrentCall, token]);

  useEffect(() => {
    if (!token || !eligibleRide) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncCurrentCall();
    });
    return () => sub.remove();
  }, [eligibleRide, syncCurrentCall, token]);

  useEffect(() => {
    if (!token || !eligibleRide || !isActiveRideCall(call)) return;
    const timer = setInterval(() => {
      void syncCurrentCall();
    }, 3000);
    return () => clearInterval(timer);
  }, [call, eligibleRide, syncCurrentCall, token]);

  const viewMode = deriveCallViewMode({
    call,
    myRole: 'DRIVER',
    audioConnected,
    micDenied,
    terminalNotice,
  });

  // Ring while an incoming call is waiting: until it is answered, declined or ends, or 30 seconds
  // pass. If the app leaves the foreground the native CallKeep UI takes over, so stop here.
  const ringingCallId = viewMode === 'incoming' ? (call?.id ?? null) : null;
  const ringingUntil = call?.ringingUntil ?? null;
  useEffect(() => {
    if (!ringingCallId || AppState.currentState !== 'active') return;
    const stop = startCallRing(ringingCallId, ringingUntil);
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stop();
    });
    return () => {
      sub.remove();
      stop();
    };
  }, [ringingCallId, ringingUntil]);

  useEffect(() => {
    if (viewMode !== 'connected') return;
    const boot = setTimeout(() => setNowMs(Date.now()), 0);
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      clearTimeout(boot);
      clearInterval(timer);
    };
  }, [viewMode]);

  const startCall = useCallback(
    async (rideId: string, label?: string) => {
      if (!token) return;
      if (label) setCounterpartOverride(label);
      setMicDenied(false);
      setTerminalNotice(null);
      setMinimised(false);
      try {
        const installationId = await getOrCreateDeviceId();
        const created = await rideCallsApi.start(
          token,
          rideId,
          installationId,
          newCallRequestId(),
        );
        setCall(created);
        if (created.state === 'ACCEPTED' || created.state === 'CONNECTED') {
          answeredByMeRef.current = created.id;
          await connectMediaRoom(created);
        }
      } catch {
        setTerminalNotice("Couldn't connect. Try chat.");
      }
    },
    [connectMediaRoom, token],
  );

  const acceptCall = useCallback(
    async (rideIdArg?: string, callIdArg?: string) => {
      if (!token) return;
      const targetCallId = callIdArg ?? callRef.current?.id;
      const targetRideId =
        rideIdArg ??
        callRef.current?.rideId ??
        getIncomingRideIdForCall(targetCallId) ??
        eligibleRide?.id;
      if (!targetRideId || !targetCallId) return;
      answeredByMeRef.current = targetCallId;
      setMicDenied(false);
      setTerminalNotice(null);
      setMinimised(false);
      await dismissSystemIncomingCall(targetCallId);
      try {
        const installationId = await getOrCreateDeviceId();
        const updated = await rideCallsApi.answer(
          token,
          targetRideId,
          targetCallId,
          installationId,
        );
        setCall(updated);
        await connectMediaRoom(updated);
      } catch {
        await teardownLocalMedia(targetCallId);
        setCall(null);
        setTerminalNotice("Couldn't connect. Try chat.");
      }
    },
    [connectMediaRoom, eligibleRide?.id, teardownLocalMedia, token],
  );

  const declineCall = useCallback(
    async (rideIdArg?: string, callIdArg?: string) => {
      const targetCallId = callIdArg ?? callRef.current?.id;
      const targetRideId =
        rideIdArg ??
        callRef.current?.rideId ??
        getIncomingRideIdForCall(targetCallId) ??
        eligibleRide?.id;
      if (targetCallId) selfEndedCallIdRef.current = targetCallId;
      if (token && targetRideId && targetCallId) {
        await rideCallsApi.decline(token, targetRideId, targetCallId).catch(() => {});
      }
      await teardownLocalMedia(targetCallId ?? null);
      setCall(null);
      setMinimised(false);
    },
    [eligibleRide?.id, teardownLocalMedia, token],
  );

  const endCall = useCallback(async () => {
    const cur = callRef.current;
    if (cur) selfEndedCallIdRef.current = cur.id;
    if (token && cur) {
      await rideCallsApi.end(token, cur.rideId, cur.id).catch(() => {});
    }
    await teardownLocalMedia(cur?.id ?? null);
    setCall(null);
    setMinimised(false);
  }, [teardownLocalMedia, token]);

  const toggleMute = useCallback(async () => {
    const next = !muted;
    await roomRef.current?.localParticipant.setMicrophoneEnabled(!next).catch(() => {});
    setMuted(next);
  }, [muted]);

  const toggleSpeaker = useCallback(async () => {
    const next = !speaker;
    if (hasNativeWebRtc()) {
      const lk = await import('@livekit/react-native');
      await lk.AudioSession.selectAudioOutput(
        Platform.OS === 'ios' ? (next ? 'force_speaker' : 'default') : next ? 'speaker' : 'earpiece',
      ).catch(() => {});
    }
    setSpeaker(next);
  }, [speaker]);

  const openChat = useCallback(() => {
    const targetRideId = callRef.current?.rideId ?? eligibleRide?.id;
    if (isActiveRideCall(callRef.current)) {
      setMinimised(true);
    } else {
      setMicDenied(false);
      setTerminalNotice(null);
    }
    if (targetRideId) {
      router.push({ pathname: '/(driver)/chat/[rideId]', params: { rideId: targetRideId } });
    }
  }, [eligibleRide?.id, router]);

  useEffect(() => {
    if (!token || !hasNativeCallKeep()) return;
    let active = true;
    const subs: { remove: () => void }[] = [];
    void setupCallKeepOnce('Cabzone Driver').then(async (ready) => {
      if (!active || !ready) return;
      try {
        const RNCallKeep = (await import('react-native-callkeep')).default;
        subs.push(
          RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
            void acceptCall(undefined, callUUID);
          }),
          RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
            if (isProgrammaticCallKeepEnd(callUUID)) return;
            if (answeredByMeRef.current === callUUID && callRef.current?.state === 'RINGING') {
              return;
            }
            if (callRef.current?.id === callUUID && callRef.current.state === 'RINGING') {
              void declineCall(undefined, callUUID);
            } else if (callRef.current?.id === callUUID) {
              void endCall();
            }
          }),
        );
      } catch {
        // ignore in unsupported runtimes
      }
    });
    return () => {
      active = false;
      for (const s of subs) s.remove();
    };
  }, [acceptCall, declineCall, endCall, token]);

  useEffect(() => {
    if (!token || Platform.OS === 'web') return;
    let active = true;
    let sub: { remove: () => void } | null = null;
    void import('expo-notifications')
      .then((Notifications) => {
        if (!active) return;
        const onResponse = (
          response: NonNullable<ReturnType<typeof Notifications.getLastNotificationResponse>>,
        ) => {
          const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
          if (data.type !== 'ride.call.incoming') return;
          const idKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
          if (handledNotifRef.current === idKey) return;
          handledNotifRef.current = idKey;
          const nRideId = typeof data.rideId === 'string' ? data.rideId : undefined;
          const nCallId = typeof data.callId === 'string' ? data.callId : undefined;
          if (typeof data.callerName === 'string' && data.callerName.trim()) {
            setCounterpartOverride(data.callerName.trim());
          }
          if (response.actionIdentifier === 'DECLINE_CALL') {
            void declineCall(nRideId, nCallId);
          } else if (response.actionIdentifier === 'ANSWER_CALL') {
            void acceptCall(nRideId, nCallId);
          } else {
            setMinimised(false);
            if (nRideId) router.push(`/(driver)/ride/${nRideId}`);
            void syncCurrentCall();
          }
          Notifications.clearLastNotificationResponse();
        };
        const last = Notifications.getLastNotificationResponse();
        if (last) onResponse(last);
        sub = Notifications.addNotificationResponseReceivedListener(onResponse);
      })
      .catch(() => {});
    return () => {
      active = false;
      sub?.remove();
    };
  }, [acceptCall, declineCall, router, syncCurrentCall, token]);

  const elapsedSeconds =
    viewMode === 'connected' && connectedAtMs !== null
      ? Math.max(0, Math.floor((nowMs - connectedAtMs) / 1000))
      : 0;
  const timerLabel = formatCallDuration(elapsedSeconds);

  const value = useMemo<RideCallContextValue>(
    () => ({
      activeCall: call,
      startCall,
      acceptCall,
      declineCall,
      endCall,
    }),
    [acceptCall, call, declineCall, endCall, startCall],
  );

  return (
    <RideCallContext.Provider value={value}>
      {children}
      {viewMode !== 'idle' ? (
        <RideCallSheet
          viewMode={viewMode}
          minimised={minimised}
          name={counterpartName}
          timerLabel={timerLabel}
          ringingUntil={call?.ringingUntil ?? null}
          notice={terminalNotice}
          muted={muted}
          speaker={speaker}
          onAccept={() => void acceptCall()}
          onDecline={() => void declineCall()}
          onEnd={() => void endCall()}
          onToggleMute={() => void toggleMute()}
          onToggleSpeaker={() => void toggleSpeaker()}
          onMinimise={() => setMinimised(true)}
          onRestore={() => setMinimised(false)}
          onChat={openChat}
          onOpenSettings={() => void Linking.openSettings()}
          onDismiss={() => {
            setMicDenied(false);
            setTerminalNotice(null);
          }}
        />
      ) : null}
    </RideCallContext.Provider>
  );
}

export function useRideCall(): RideCallContextValue {
  const ctx = useContext(RideCallContext);
  if (!ctx) {
    throw new Error('useRideCall must be used within RideCallProvider');
  }
  return ctx;
}
