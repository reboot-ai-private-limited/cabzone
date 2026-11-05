import { NativeModules, Platform } from 'react-native';

export const CABZONE_BG_CALL_NOTIFICATION_TASK = 'CABZONE_BG_CALL_NOTIFICATION_TASK';
export const RIDE_CALL_CHANNEL_ID = 'ride-calls';
export const RIDE_CALL_RING_CHANNEL_ID = 'ride-calls-ring';
export const RIDE_CALL_CATEGORY_ID = 'ride-call';

let globalsRegistered = false;
let callKeepSetupPromise: Promise<boolean> | null = null;
let bgTaskRegistered = false;
const programmaticCallKeepEnds = new Map<string, number>();
const incomingRideByCallId = new Map<string, string>();

export function isProgrammaticCallKeepEnd(callId: string): boolean {
  const until = programmaticCallKeepEnds.get(callId);
  if (!until) return false;
  if (Date.now() > until) {
    programmaticCallKeepEnds.delete(callId);
    return false;
  }
  return true;
}

export function getIncomingRideIdForCall(callId?: string | null): string | undefined {
  return callId ? incomingRideByCallId.get(callId) : undefined;
}

export function hasNativeWebRtc(): boolean {
  return Platform.OS !== 'web' && NativeModules?.WebRTCModule != null;
}

export function hasNativeCallKeep(): boolean {
  return Platform.OS !== 'web' && NativeModules?.RNCallKeep != null;
}

export function ensureLiveKitGlobals(): boolean {
  if (globalsRegistered) return true;
  if (!hasNativeWebRtc()) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registerGlobals } = require('@livekit/react-native') as typeof import('@livekit/react-native');
    registerGlobals();
    globalsRegistered = true;
    return true;
  } catch {
    // Safe fallback for Node unit-test sandboxes or Expo Go without native modules
    return false;
  }
}

export async function setupCallKeepOnce(appName = 'Cabzone Driver'): Promise<boolean> {
  if (!hasNativeCallKeep()) return false;
  if (callKeepSetupPromise) return callKeepSetupPromise;
  callKeepSetupPromise = (async () => {
    try {
      const mod = await import('react-native-callkeep');
      const RNCallKeep = mod.default;
      await RNCallKeep.setup({
        ios: {
          appName,
          supportsVideo: false,
          includesCallsInRecents: false,
          maximumCallGroups: '1',
          maximumCallsPerCallGroup: '1',
        },
        android: {
          alertTitle: 'Ride call permissions',
          alertDescription: 'Cabzone Driver needs microphone permission for private in-app ride calls.',
          cancelButton: 'Cancel',
          okButton: 'Allow',
          additionalPermissions: [],
          selfManaged: true,
          foregroundService: {
            channelId: 'cabzone-voice-call',
            channelName: 'Active ride call',
            notificationTitle: `${appName} ride call in progress`,
          },
        },
      });
      RNCallKeep.setAvailable?.(true);
      return true;
    } catch (err) {
      callKeepSetupPromise = null;
      console.warn('[VoiceBootstrap] RNCallKeep setup failed:', err);
      return false;
    }
  })();
  return callKeepSetupPromise;
}

export async function ensureCallNotificationSetup(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await import('expo-notifications');
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(RIDE_CALL_CHANNEL_ID, {
        name: 'Incoming ride calls',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 300, 500, 300, 500],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
        sound: 'default',
      });
      // Ringing channel (29s ring) used for incoming-call pushes when the app is closed.
      await Notifications.setNotificationChannelAsync(RIDE_CALL_RING_CHANNEL_ID, {
        name: 'Incoming ride calls (ringing)',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 700, 500, 700, 500, 700, 500, 700, 500, 700, 500, 700],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
        sound: 'ring_long.wav',
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
      });
    }
    await Notifications.setNotificationCategoryAsync(RIDE_CALL_CATEGORY_ID, [
      {
        identifier: 'ANSWER_CALL',
        buttonTitle: 'Accept',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'DECLINE_CALL',
        buttonTitle: 'Decline',
        options: { isDestructive: true, opensAppToForeground: true },
      },
    ]);
  } catch {
    // ignore on unsupported environments
  }
}

export interface IncomingCallAlertInput {
  callId: string;
  rideId: string;
  callerName: string;
  expiresAt?: string;
  extraData?: Record<string, string>;
}

export async function presentSystemIncomingCall(
  input: IncomingCallAlertInput,
  appName = 'Cabzone Driver',
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  incomingRideByCallId.set(input.callId, input.rideId);
  if (input.expiresAt) {
    const expMs = Date.parse(input.expiresAt);
    if (Number.isFinite(expMs) && Date.now() >= expMs) {
      return false;
    }
  }
  await ensureCallNotificationSetup();
  const ready = await setupCallKeepOnce(appName);
  if (ready) {
    try {
      const RNCallKeep = (await import('react-native-callkeep')).default;
      RNCallKeep.displayIncomingCall(input.callId, input.callId, input.callerName, 'generic', false);
      if (Platform.OS === 'android') {
        RNCallKeep.backToForeground();
      }
    } catch (err) {
      console.warn('[VoiceBootstrap] displayIncomingCall error:', err);
    }
  }
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      identifier: `ride-call-${input.callId}`,
      content: {
        title: `Incoming ride call · ${input.callerName}`,
        body: 'Tap Accept to answer privately in Cabzone Driver.',
        categoryIdentifier: RIDE_CALL_CATEGORY_ID,
        sound: 'ring_long.wav',
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: {
          type: 'ride.call.incoming',
          callId: input.callId,
          rideId: input.rideId,
          callerName: input.callerName,
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
          ...(input.extraData ?? {}),
        },
        ...(Platform.OS === 'android' ? { channelId: RIDE_CALL_RING_CHANNEL_ID } : {}),
      },
      trigger: null,
    });
  } catch {
    // ignore
  }
  return true;
}

export async function dismissSystemIncomingCall(callId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  programmaticCallKeepEnds.set(callId, Date.now() + 10_000);
  if (hasNativeCallKeep()) {
    try {
      const RNCallKeep = (await import('react-native-callkeep')).default;
      RNCallKeep.endCall(callId);
    } catch {
      // ignore
    }
  }
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.dismissNotificationAsync(`ride-call-${callId}`);
  } catch {
    // ignore
  }
}

function extractTaskData(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const top = raw as Record<string, unknown>;
  const inner = top.data && typeof top.data === 'object' ? (top.data as Record<string, unknown>) : top;
  if (typeof inner.dataString === 'string') {
    try {
      const parsed = JSON.parse(inner.dataString) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // fall through
    }
  }
  if (typeof inner.body === 'string') {
    try {
      const parsed = JSON.parse(inner.body) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // fall through
    }
  }
  return inner;
}

function registerBackgroundCallTask(appName: string): void {
  if (bgTaskRegistered || Platform.OS === 'web' || !hasNativeCallKeep()) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    if (!TaskManager.isTaskDefined(CABZONE_BG_CALL_NOTIFICATION_TASK)) {
      TaskManager.defineTask(CABZONE_BG_CALL_NOTIFICATION_TASK, async ({ data, error }) => {
        if (error) return;
        const payload = extractTaskData(data);
        if (!payload) return;
        const type = typeof payload.type === 'string' ? payload.type : '';
        const callId = typeof payload.callId === 'string' ? payload.callId : '';
        const rideId = typeof payload.rideId === 'string' ? payload.rideId : '';
        if (type === 'ride.call.incoming' && callId && rideId) {
          const callerName =
            typeof payload.callerName === 'string' && payload.callerName.trim()
              ? payload.callerName.trim()
              : 'Cabzone Rider';
          const expiresAt = typeof payload.expiresAt === 'string' ? payload.expiresAt : undefined;
          await presentSystemIncomingCall(
            { callId, rideId, callerName, expiresAt },
            appName,
          );
        } else if (type === 'ride.call.ended' && callId) {
          await dismissSystemIncomingCall(callId);
        }
      });
    }
    void Notifications.registerTaskAsync(CABZONE_BG_CALL_NOTIFICATION_TASK).catch(() => {});
    bgTaskRegistered = true;
  } catch {
    // ignore in environments without task-manager
  }
}

ensureLiveKitGlobals();
registerBackgroundCallTask('Cabzone Driver');
