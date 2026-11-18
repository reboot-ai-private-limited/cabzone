import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importPKCS8, SignJWT } from 'jose';
import { env } from '../../../config/env.js';
import { logger } from '../../../shared/logging/logger.js';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

export interface FirebaseServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string | undefined;
}

export interface FcmMessageInput {
  token: string;
  title: string;
  body: string;
  channelId: string;
  sound: string;
  priority: 'normal' | 'high';
  ttlSeconds: number;
  data?: Record<string, unknown> | undefined;
}

export interface FcmSendResult {
  status: 'ok' | 'unregistered' | 'error';
  reason?: string | undefined;
}

export type FcmPushSender = (messages: FcmMessageInput[]) => Promise<FcmSendResult[]>;

interface FcmErrorBody {
  error?: {
    status?: string;
    details?: Array<{ errorCode?: string }>;
  };
}

function parseServiceAccount(raw: string): FirebaseServiceAccount | null {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const jsonText = trimmed.startsWith('{')
      ? trimmed
      : Buffer.from(trimmed, 'base64').toString('utf8');
    const parsed = JSON.parse(jsonText) as Partial<FirebaseServiceAccount>;
    if (
      typeof parsed.project_id !== 'string' ||
      !parsed.project_id.trim() ||
      typeof parsed.client_email !== 'string' ||
      !parsed.client_email.trim() ||
      typeof parsed.private_key !== 'string' ||
      !parsed.private_key.trim()
    ) {
      return null;
    }
    return {
      project_id: parsed.project_id.trim(),
      client_email: parsed.client_email.trim(),
      private_key: parsed.private_key.replace(/\\n/g, '\n'),
      token_uri: typeof parsed.token_uri === 'string' && parsed.token_uri ? parsed.token_uri : undefined,
    };
  } catch {
    return null;
  }
}

export function loadFirebaseServiceAccount(): FirebaseServiceAccount | null {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const explicitPath = path.resolve(env.FIREBASE_SERVICE_ACCOUNT_PATH);
    if (!fs.existsSync(explicitPath)) return null;
    return parseServiceAccount(fs.readFileSync(explicitPath, 'utf8'));
  }
  if (env.NODE_ENV === 'test') {
    return null;
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), 'firebase-adminsdk.json'),
    path.resolve(process.cwd(), 'apps/api/firebase-adminsdk.json'),
    path.resolve(moduleDir, '../firebase-adminsdk.json'),
    path.resolve(moduleDir, '../../../../firebase-adminsdk.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const account = parseServiceAccount(fs.readFileSync(candidate, 'utf8'));
      if (account) return account;
    }
  }
  return null;
}

function buildFcmPayload(msg: FcmMessageInput): Record<string, unknown> {
  const soundName = msg.sound === 'default' ? 'default' : msg.sound.replace(/\.[^.]+$/, '');
  return {
    message: {
      token: msg.token,
      notification: {
        title: msg.title,
        body: msg.body,
      },
      // expo-notifications reads `notification.request.content.data` from `remoteMessage.data["body"]`.
      data: {
        title: msg.title,
        message: msg.body,
        channelId: msg.channelId,
        sound: msg.sound,
        body: JSON.stringify(msg.data ?? {}),
      },
      android: {
        priority: msg.priority === 'normal' ? 'NORMAL' : 'HIGH',
        ttl: `${Math.max(1, Math.floor(msg.ttlSeconds))}s`,
        notification: {
          channel_id: msg.channelId,
          sound: soundName,
        },
      },
    },
  };
}

export function createFcmSender(explicitAccount?: FirebaseServiceAccount | null): FcmPushSender {
  let cachedToken: { accessToken: string; expiresAtMs: number; clientEmail: string } | null = null;
  let inFlightToken: Promise<string> | null = null;

  async function getAccessToken(account: FirebaseServiceAccount): Promise<string> {
    if (
      cachedToken &&
      cachedToken.clientEmail === account.client_email &&
      cachedToken.expiresAtMs > Date.now()
    ) {
      return cachedToken.accessToken;
    }
    if (inFlightToken) return inFlightToken;

    inFlightToken = (async () => {
      const tokenUri = account.token_uri || DEFAULT_TOKEN_URI;
      const nowSec = Math.floor(Date.now() / 1000);
      const key = await importPKCS8(account.private_key, 'RS256');
      const assertion = await new SignJWT({ scope: FCM_SCOPE })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setIssuer(account.client_email)
        .setSubject(account.client_email)
        .setAudience(tokenUri)
        .setIssuedAt(nowSec)
        .setExpirationTime(nowSec + 3600)
        .sign(key);

      const res = await fetch(tokenUri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`FCM OAuth token request failed with HTTP ${res.status}`);
      }
      const body = (await res.json()) as { access_token?: string; expires_in?: number };
      if (!body.access_token) {
        throw new Error('Invalid FCM OAuth token response');
      }
      const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;
      cachedToken = {
        accessToken: body.access_token,
        expiresAtMs: Date.now() + Math.max(60, expiresIn - 60) * 1000,
        clientEmail: account.client_email,
      };
      return body.access_token;
    })();

    try {
      return await inFlightToken;
    } finally {
      inFlightToken = null;
    }
  }

  async function sendOne(
    account: FirebaseServiceAccount,
    accessToken: string,
    msg: FcmMessageInput,
  ): Promise<FcmSendResult> {
    const endpoint = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`;
    const payload = JSON.stringify(buildFcmPayload(msg));
    let res: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: payload,
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok || (res.status !== 429 && res.status < 500)) break;
      } catch (err) {
        if (attempt === 2) {
          logger.warn({ err: String(err) }, 'fcm push request error');
          return { status: 'error', reason: 'TRANSPORT_ERROR' };
        }
      }
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 3 ** attempt));
      }
    }

    if (!res) return { status: 'error', reason: 'TRANSPORT_ERROR' };
    if (res.ok) return { status: 'ok' };

    const errorBody = (await res.json().catch(() => null)) as FcmErrorBody | null;
    const isUnregistered =
      res.status === 404 ||
      Boolean(errorBody?.error?.details?.some((d) => d.errorCode === 'UNREGISTERED'));
    if (isUnregistered) {
      return { status: 'unregistered' };
    }
    const detailCode = errorBody?.error?.details?.find(
      (d) => typeof d.errorCode === 'string',
    )?.errorCode;
    const reason = detailCode || errorBody?.error?.status || `HTTP_${res.status}`;
    return { status: 'error', reason };
  }

  return async (messages: FcmMessageInput[]): Promise<FcmSendResult[]> => {
    if (messages.length === 0) return [];
    const account = explicitAccount !== undefined ? explicitAccount : loadFirebaseServiceAccount();
    if (!account) {
      logger.warn('fcm service account not configured');
      return messages.map(() => ({ status: 'error', reason: 'FCM_NOT_CONFIGURED' }));
    }
    const accessToken = await getAccessToken(account);
    return Promise.all(messages.map((msg) => sendOne(account, accessToken, msg)));
  };
}

export const sendToFcm: FcmPushSender = createFcmSender();
