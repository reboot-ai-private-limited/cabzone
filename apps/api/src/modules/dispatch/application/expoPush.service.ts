import { logger } from '../../../shared/logging/logger.js';
import type { PushTokenPort } from './pushToken.port.js';
import type { PushReceiptPort } from './pushReceipt.port.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

interface ExpoResult {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export type PushSender = (messages: Array<Record<string, unknown>>) => Promise<ExpoResult[] | void>;
export type ReceiptReader = (ids: string[]) => Promise<Record<string, ExpoResult>>;

async function sendToExpo(messages: Array<Record<string, unknown>>): Promise<ExpoResult[]> {
  const tickets: ExpoResult[] = [];
  for (let offset = 0; offset < messages.length; offset += 100) {
    const batch = messages.slice(offset, offset + 100);
    let res: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(batch),
        });
        if (res.ok || (res.status !== 429 && res.status < 500)) break;
      } catch (err) {
        if (attempt === 2) throw err;
      }
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * 3 ** attempt));
    }
    if (!res) throw new Error('Expo push unavailable');
    if (!res.ok) throw new Error(`Expo push rejected with HTTP ${res.status}`);
    const body = await res.json() as { data?: ExpoResult[] };
    if (!Array.isArray(body.data) || body.data.length !== batch.length) throw new Error('Invalid Expo push ticket response');
    tickets.push(...body.data);
  }
  return tickets;
}

async function readReceipts(ids: string[]): Promise<Record<string, ExpoResult>> {
  const res = await fetch(EXPO_RECEIPTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(`Expo receipts rejected with HTTP ${res.status}`);
  const body = await res.json() as { data?: Record<string, ExpoResult> };
  if (!body.data || typeof body.data !== 'object') throw new Error('Invalid Expo receipt response');
  return body.data;
}

/** Expo push delivery. Production wiring injects Mongo token and receipt repositories. */
export class ExpoPushService {
  constructor(
    private readonly tokens: PushTokenPort,
    private readonly receipts: PushReceiptPort,
    private readonly sender: PushSender = sendToExpo,
    private readonly receiptReader: ReceiptReader = readReceipts,
  ) {}

  async register(userId: string, installationId: string, token: string): Promise<boolean> {
    if (!EXPO_TOKEN.test(token)) return false;
    await this.tokens.put(userId, installationId, token);
    return true;
  }

  async unregister(userId: string, installationId: string): Promise<void> {
    await this.tokens.remove(userId, installationId);
  }

  /** Best effort: never throws. */
  async notify(
    userIds: string[],
    message: { title: string; body: string; data?: Record<string, unknown>; expiresAt?: Date | null },
  ): Promise<void> {
    try {
      if (message.expiresAt && message.expiresAt <= new Date()) return;
      const { expiresAt, ...content } = message;
      const messages = (await this.tokens.list(userIds)).map((to) => ({
        to,
        sound: 'default',
        priority: 'high',
        channelId: 'ride-offers',
        ...(expiresAt ? { ttl: Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) } : {}),
        ...content,
      }));
      if (messages.length === 0) return;
      const tickets = await this.sender(messages) ?? [];
      for (const [index, ticket] of tickets.entries()) {
        const token = messages[index]?.to;
        if (typeof token !== 'string') continue;
        if (ticket.status === 'ok' && ticket.id) {
          await this.receipts.add(ticket.id, token, new Date(Date.now() + 15 * 60_000));
        } else if (ticket.details?.error === 'DeviceNotRegistered') {
          await this.tokens.removeToken(token);
        } else if (ticket.status === 'error') {
          logger.warn({ reason: ticket.details?.error ?? 'unknown' }, 'expo push ticket failed');
        }
      }
    } catch (err) {
      logger.warn({ err: String(err) }, 'expo push failed');
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
        if (result.details?.error === 'DeviceNotRegistered') await this.tokens.removeToken(item.token);
        else if (result.status === 'error') {
          logger.warn({ reason: result.details?.error ?? 'unknown' }, 'expo push receipt failed');
        }
        await this.receipts.remove(item.id);
      }
    } catch (err) {
      logger.warn({ err: String(err) }, 'expo receipt check failed');
      for (const item of pending) await this.receipts.postpone(item.id, new Date(now.getTime() + 60_000));
    }
  }
}
