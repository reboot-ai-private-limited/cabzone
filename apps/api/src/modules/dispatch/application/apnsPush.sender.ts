import fs from 'node:fs';
import path from 'node:path';
import http2 from 'node:http2';
import { importPKCS8, SignJWT } from 'jose';
import { env } from '../../../config/env.js';
import { logger } from '../../../shared/logging/logger.js';

const HOST_PROD = 'https://api.push.apple.com';
const HOST_SANDBOX = 'https://api.sandbox.push.apple.com';

export interface ApnsConfig {
  keyPem: string;
  keyId: string;
  teamId: string;
  bundleId: string;
  production: boolean;
}

export interface ApnsMessageInput {
  token: string;
  title: string;
  body: string;
  sound: string;
  priority: 'normal' | 'high';
  ttlSeconds: number;
  data?: Record<string, unknown> | undefined;
}

export interface ApnsSendResult {
  status: 'ok' | 'unregistered' | 'error';
  reason?: string | undefined;
}

export type ApnsPushSender = (messages: ApnsMessageInput[]) => Promise<ApnsSendResult[]>;

export function loadApnsConfig(): ApnsConfig | null {
  if (!env.APNS_KEY_ID || !env.APNS_TEAM_ID) return null;
  let raw = env.APNS_KEY ?? '';
  if (!raw && env.APNS_KEY_PATH) {
    const p = path.resolve(env.APNS_KEY_PATH);
    if (!fs.existsSync(p)) return null;
    raw = fs.readFileSync(p, 'utf8');
  }
  raw = raw.trim();
  if (!raw) return null;
  // Accept raw PEM, PEM with literal \n, or base64 of the .p8 file.
  const pem = raw.includes('BEGIN PRIVATE KEY')
    ? raw.replace(/\\n/g, '\n')
    : Buffer.from(raw, 'base64').toString('utf8');
  if (!pem.includes('BEGIN PRIVATE KEY')) return null;
  return {
    keyPem: pem,
    keyId: env.APNS_KEY_ID,
    teamId: env.APNS_TEAM_ID,
    bundleId: env.APNS_BUNDLE_ID,
    production: env.APNS_PRODUCTION,
  };
}

export function createApnsSender(explicit?: ApnsConfig | null): ApnsPushSender {
  const sessions = new Map<string, http2.ClientHttp2Session>();
  let jwt: { value: string; expiresAtMs: number } | null = null;

  async function getJwt(cfg: ApnsConfig): Promise<string> {
    // Apple wants a fresh provider token at least every 60 minutes, and not more than every 20.
    if (jwt && jwt.expiresAtMs > Date.now()) return jwt.value;
    const key = await importPKCS8(cfg.keyPem, 'ES256');
    const value = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: cfg.keyId })
      .setIssuer(cfg.teamId)
      .setIssuedAt()
      .sign(key);
    jwt = { value, expiresAtMs: Date.now() + 40 * 60_000 };
    return value;
  }

  function session(host: string): http2.ClientHttp2Session {
    const existing = sessions.get(host);
    if (existing && !existing.closed && !existing.destroyed) return existing;
    const s = http2.connect(host);
    s.on('error', () => sessions.delete(host));
    s.on('close', () => sessions.delete(host));
    s.unref();
    sessions.set(host, s);
    return s;
  }

  function post(
    host: string,
    cfg: ApnsConfig,
    bearer: string,
    msg: ApnsMessageInput,
  ): Promise<{ status: number; reason?: string }> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        aps: {
          alert: { title: msg.title, body: msg.body },
          sound: msg.sound,
        },
        // expo-notifications exposes `body` as notification.request.content.data on iOS.
        body: msg.data ?? {},
      });
      const req = session(host).request({
        ':method': 'POST',
        ':path': `/3/device/${msg.token}`,
        authorization: `bearer ${bearer}`,
        'apns-topic': cfg.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': msg.priority === 'normal' ? '5' : '10',
        'apns-expiration': String(
          Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(msg.ttlSeconds)),
        ),
      });
      req.setTimeout(10_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
      let status = 0;
      let text = '';
      req.on('response', (h) => {
        status = Number(h[':status'] ?? 0);
      });
      req.setEncoding('utf8');
      req.on('data', (c: string) => {
        text += c;
      });
      req.on('end', () => {
        let reason: string | undefined;
        try {
          reason = (JSON.parse(text) as { reason?: string }).reason;
        } catch {
          // empty body on success
        }
        resolve({ status, ...(reason ? { reason } : {}) });
      });
      req.on('error', reject);
      req.end(payload);
    });
  }

  async function sendOne(
    cfg: ApnsConfig,
    bearer: string,
    msg: ApnsMessageInput,
  ): Promise<ApnsSendResult> {
    const primary = cfg.production ? HOST_PROD : HOST_SANDBOX;
    const alternate = cfg.production ? HOST_SANDBOX : HOST_PROD;
    try {
      let res = await post(primary, cfg, bearer, msg);
      // A dev-build token sent to production (or the reverse) is BadDeviceToken: try the other gateway.
      if (res.status === 400 && res.reason === 'BadDeviceToken') {
        res = await post(alternate, cfg, bearer, msg);
      }
      if (res.status === 200) return { status: 'ok' };
      if (res.status === 410 || res.reason === 'BadDeviceToken' || res.reason === 'Unregistered') {
        return { status: 'unregistered' };
      }
      return { status: 'error', reason: res.reason ?? `HTTP_${res.status}` };
    } catch (err) {
      logger.warn({ err: String(err) }, 'apns push request error');
      sessions.get(primary)?.destroy();
      return { status: 'error', reason: 'TRANSPORT_ERROR' };
    }
  }

  return async (messages) => {
    if (messages.length === 0) return [];
    const cfg = explicit !== undefined ? explicit : loadApnsConfig();
    if (!cfg) {
      logger.warn('apns not configured');
      return messages.map(() => ({ status: 'error' as const, reason: 'APNS_NOT_CONFIGURED' }));
    }
    const bearer = await getJwt(cfg);
    return Promise.all(messages.map((m) => sendOne(cfg, bearer, m)));
  };
}

export const sendToApns: ApnsPushSender = createApnsSender();
