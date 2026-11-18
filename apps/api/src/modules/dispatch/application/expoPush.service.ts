import { env } from '../../../config/env.js';
import { logger } from '../../../shared/logging/logger.js';
import { emitOperationalAlert } from '../../../shared/monitoring/alerting.js';
import type { PushTokenMetadata, PushTokenPort } from './pushToken.port.js';
import type { PushReceiptPort } from './pushReceipt.port.js';
import { sendToFcm, type FcmPushSender } from './fcmPush.sender.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;
/** Applied when a notification has no explicit expiry. */
export const DEFAULT_PUSH_TTL_SECONDS = 3600;
const NATIVE_DEVICE_TOKEN = /^[^\s]{16,512}$/;

export type PushNotificationChannel =
  | 'ride-offers'
  | 'ride-updates'
  | 'ride-calls'
  /** Channels whose sound is the 29s ring: a closed app keeps ringing like an incoming call. */
  | 'ride-offers-ring'
  | 'ride-calls-ring';

/** Bundled by the mobile apps (expo-notifications `sounds`); must stay under 30s for iOS. */
export const RING_PUSH_SOUND = 'ring_long.wav';

function pushSoundFor(channelId: PushNotificationChannel): string {
  return channelId === 'ride-offers-ring' || channelId === 'ride-calls-ring'
    ? RING_PUSH_SOUND
    : 'default';
}

interface ExpoResult {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export type PushSender = (messages: Array<Record<string, unknown>>) => Promise<ExpoResult[] | void>;
export type ReceiptReader = (ids: string[]) => Promise<Record<string, ExpoResult>>;

function buildExpoHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
  };
}

async function sendToExpo(messages: Array<Record<string, unknown>>): Promise<ExpoResult[]> {
  const tickets: ExpoResult[] = [];
  for (let offset = 0; offset < messages.length; offset += 100) {
    const batch = messages.slice(offset, offset + 100);
    let res: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: buildExpoHeaders(),
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok || (res.status !== 429 && res.status < 500)) break;
      } catch (err) {
        if (attempt === 2) throw err;
      }
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * 3 ** attempt));
    }
    if (!res) throw new Error('Expo push unavailable');
    if (!res.ok) throw new Error(`Expo push rejected with HTTP ${res.status}`);
    const body = (await res.json()) as { data?: ExpoResult[] };
    if (!Array.isArray(body.data) || body.data.length !== batch.length) {
      throw new Error('Invalid Expo push ticket response');
    }
    tickets.push(...body.data);
  }
  return tickets;
}

async function readReceipts(ids: string[]): Promise<Record<string, ExpoResult>> {
  const res = await fetch(EXPO_RECEIPTS_URL, {
    method: 'POST',
    headers: buildExpoHeaders(),
    body: JSON.stringify({ ids }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Expo receipts rejected with HTTP ${res.status}`);
  const body = (await res.json()) as { data?: Record<string, ExpoResult> };
  if (!body.data || typeof body.data !== 'object') throw new Error('Invalid Expo receipt response');
  return body.data;
}

/** Push delivery (direct FCM HTTP v1 for Android + Expo push fallback). */
export class ExpoPushService {
  constructor(
    private readonly tokens: PushTokenPort,
    private readonly receipts: PushReceiptPort,
    private readonly sender: PushSender = sendToExpo,
    private readonly receiptReader: ReceiptReader = readReceipts,
    private readonly fcmSender: FcmPushSender = sendToFcm,
  ) {}

  async register(
    userId: string,
    installationId: string,
    token: string,
    meta?: PushTokenMetadata,
  ): Promise<boolean> {
    const isExpoToken = EXPO_TOKEN.test(token);
    const transport = meta?.transport ?? (isExpoToken ? 'EXPO' : 'FCM');
    // Legacy VoIP call tokens are no longer sent to. Older app versions may still register them,
    // so accept and ignore instead of failing their registration.
    if (transport === 'FCM_CALL' || transport === 'APNS_VOIP') {
      return NATIVE_DEVICE_TOKEN.test(token);
    }
    if (transport === 'FCM') {
      if (!NATIVE_DEVICE_TOKEN.test(token) || isExpoToken) return false;
      await this.tokens.put(userId, installationId, token, { ...meta, transport: 'FCM' });
      return true;
    }
    if (!isExpoToken) return false;
    await this.tokens.put(userId, installationId, token, { ...meta, transport: 'EXPO' });
    return true;
  }

  async unregister(userId: string, installationId: string): Promise<void> {
    await this.tokens.remove(userId, installationId);
  }

  async hasInstallation(userId: string, installationId: string): Promise<boolean> {
    return this.tokens.hasInstallation?.(userId, installationId) ?? false;
  }

  /** Best effort: never throws. */
  async notify(
    userIds: string[],
    message: {
      title: string;
      body: string;
      channelId?: PushNotificationChannel;
      data?: Record<string, unknown>;
      expiresAt?: Date | null;
      /** FCM priority. High is for time-sensitive, user-visible alerts; use 'normal' for the rest. */
      priority?: 'normal' | 'high';
    },
  ): Promise<void> {
    try {
      if (message.expiresAt && message.expiresAt <= new Date()) return;
      const { expiresAt, channelId = 'ride-offers', priority = 'high', ...content } = message;
      // Never let a push sit in FCM for Expo's 4-week default: a late "driver arrived" is misleading.
      const ttl = expiresAt
        ? Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
        : DEFAULT_PUSH_TTL_SECONDS;
      const sound = pushSoundFor(channelId);

      const fcmTokens = await this.tokens.list(userIds, 'FCM');
      if (fcmTokens.length > 0) {
        try {
          const results = await this.fcmSender(
            fcmTokens.map((token) => ({
              token,
              title: content.title,
              body: content.body,
              channelId,
              sound,
              priority,
              ttlSeconds: ttl,
              data: content.data,
            })),
          );
          for (const [index, result] of results.entries()) {
            const token = fcmTokens[index];
            if (!token) continue;
            if (result.status === 'unregistered') {
              await this.tokens.removeToken(token);
            } else if (result.status === 'error') {
              const reason = result.reason ?? 'unknown';
              logger.warn({ reason }, 'fcm push failed');
              void emitOperationalAlert({
                category: 'PUSH_DELIVERY',
                severity: 'warning',
                dedupeKey: `PUSH_DELIVERY:fcm:${reason}`,
                summary: `FCM push rejected (${reason}).`,
                metadata: { reason, channelId },
              });
            }
          }
        } catch (err) {
          logger.warn({ err: String(err) }, 'fcm push transport failed');
          void emitOperationalAlert({
            category: 'PUSH_DELIVERY',
            severity: 'warning',
            dedupeKey: 'PUSH_DELIVERY:fcm-transport',
            summary: 'FCM push transport request failed.',
            metadata: { err: String(err), channelId },
          });
        }
      }

      const messages = (await this.tokens.list(userIds, 'EXPO')).map((to) => ({
        to,
        sound,
        priority,
        channelId,
        ttl,
        ...content,
      }));
      if (messages.length === 0) return;
      const tickets = (await this.sender(messages)) ?? [];
      for (const [index, ticket] of tickets.entries()) {
        const token = messages[index]?.to;
        if (typeof token !== 'string') continue;
        if (ticket.status === 'ok' && ticket.id) {
          await this.receipts.add(ticket.id, token, new Date(Date.now() + 15 * 60_000));
        } else if (ticket.details?.error === 'DeviceNotRegistered') {
          await this.tokens.removeToken(token);
        } else if (ticket.status === 'error') {
          const reason = ticket.details?.error ?? 'unknown';
          logger.warn({ reason }, 'expo push ticket failed');
          void emitOperationalAlert({
            category: 'PUSH_DELIVERY',
            severity: 'warning',
            dedupeKey: `PUSH_DELIVERY:ticket:${reason}`,
            summary: `Expo push ticket rejected (${reason}).`,
            metadata: { reason, channelId },
          });
        }
      }
    } catch (err) {
      logger.warn({ err: String(err) }, 'expo push failed');
      void emitOperationalAlert({
        category: 'PUSH_DELIVERY',
        severity: 'warning',
        dedupeKey: 'PUSH_DELIVERY:transport',
        summary: 'Expo push transport request failed.',
        metadata: { err: String(err) },
      });
    }
  }

  async checkReceipts(now: Date = new Date()): Promise<void> {
    const pending = await this.receipts.due(now, 100);
    if (pending.length === 0) return;
    try {
      const results = await this.receiptReader(pending.map((item) => item.id));
      for (const item of pending) {
        const result = results[item.id];
        if (!result) {
          await this.receipts.postpone(item.id, new Date(now.getTime() + 15 * 60_000));
          continue;
        }
        if (result.details?.error === 'DeviceNotRegistered') {
          await this.tokens.removeToken(item.token);
        } else if (result.status === 'error') {
          const reason = result.details?.error ?? 'unknown';
          logger.warn({ reason }, 'expo push receipt failed');
          void emitOperationalAlert({
            category: 'PUSH_DELIVERY',
            severity: 'warning',
            dedupeKey: `PUSH_DELIVERY:receipt:${reason}`,
            summary: `Expo push receipt reported error (${reason}).`,
            metadata: { reason },
          });
        }
        await this.receipts.remove(item.id);
      }
    } catch (err) {
      logger.warn({ err: String(err) }, 'expo receipt check failed');
      void emitOperationalAlert({
        category: 'PUSH_DELIVERY',
        severity: 'warning',
        dedupeKey: 'PUSH_DELIVERY:receipt-transport',
        summary: 'Expo push receipt verification failed.',
        metadata: { err: String(err) },
      });
      for (const item of pending) {
        await this.receipts.postpone(item.id, new Date(now.getTime() + 60_000));
      }
    }
  }
}
