import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

export type OperationalAlertCategory =
  | 'API_5XX'
  | 'API_LATENCY'
  | 'DATASTORE_HEALTH'
  | 'QUEUE_HEALTH'
  | 'SMS_DELIVERY'
  | 'PUSH_DELIVERY'
  | 'WALLET_RECONCILIATION'
  | 'PAYMENT_RECONCILIATION'
  | 'MOBILE_CRASH';

export type OperationalAlertSeverity = 'warning' | 'critical';

export interface OperationalAlertEvent {
  category: OperationalAlertCategory;
  severity: OperationalAlertSeverity;
  summary: string;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
}

export interface DispatchedOperationalAlert {
  category: OperationalAlertCategory;
  severity: OperationalAlertSeverity;
  owner: string;
  environment: string;
  summary: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export type AlertTransport = (
  webhookUrl: string,
  payload: DispatchedOperationalAlert,
) => Promise<void>;

const SENSITIVE_KEY_PATTERN =
  /otp|phone|token|secret|password|apikey|apisecret|authkey|authtoken|authorization|cookie|sig|signature|dataurl|storagekey/i;
const E164_INLINE_PATTERN = /\+\d{7,15}/g;
const EXPO_TOKEN_INLINE_PATTERN = /Expo(?:nent)?PushToken\[[^\]]+\]/g;
const BEARER_INLINE_PATTERN = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const QUERY_SECRET_INLINE_PATTERN = /([?&](?:sig|token|otp|authkey|api_key)=)[^&\s]+/gi;

const lastSentByKey = new Map<string, number>();

export function sanitizeAlertText(value: string): string {
  return value
    .replace(BEARER_INLINE_PATTERN, 'Bearer [redacted]')
    .replace(EXPO_TOKEN_INLINE_PATTERN, 'ExponentPushToken[[redacted]]')
    .replace(QUERY_SECRET_INLINE_PATTERN, '$1[redacted]')
    .replace(E164_INLINE_PATTERN, '+[redacted]');
}

export function redactAlertMetadata(
  input: Record<string, unknown> | undefined,
  depth = 0,
): Record<string, unknown> {
  if (!input || depth > 4) return {};
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    if (typeof raw === 'string') {
      out[key] = sanitizeAlertText(raw);
    } else if (typeof raw === 'number' || typeof raw === 'boolean' || raw === null) {
      out[key] = raw;
    } else if (Array.isArray(raw)) {
      out[key] = raw.slice(0, 20).map((item) =>
        typeof item === 'string'
          ? sanitizeAlertText(item)
          : item && typeof item === 'object'
            ? redactAlertMetadata(item as Record<string, unknown>, depth + 1)
            : item,
      );
    } else if (typeof raw === 'object') {
      out[key] = redactAlertMetadata(raw as Record<string, unknown>, depth + 1);
    }
  }
  return out;
}

const defaultAlertTransport: AlertTransport = async (webhookUrl, payload) => {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) {
    throw new Error(`Alert webhook rejected with HTTP ${res.status}`);
  }
};

let activeTransport: AlertTransport = defaultAlertTransport;
let activeWebhookOverride: string | null | undefined;
let cooldownMs = 60_000;

export function configureAlertingForTests(opts?: {
  transport?: AlertTransport;
  webhookUrl?: string | null;
  cooldownMs?: number;
}): void {
  activeTransport = opts?.transport ?? defaultAlertTransport;
  activeWebhookOverride = opts?.webhookUrl;
  cooldownMs = opts?.cooldownMs ?? 60_000;
  lastSentByKey.clear();
}

export async function emitOperationalAlert(
  event: OperationalAlertEvent,
): Promise<DispatchedOperationalAlert | null> {
  const dedupeKey = event.dedupeKey ?? `${event.category}:${event.summary}`;
  const nowMs = Date.now();
  const prevMs = lastSentByKey.get(dedupeKey);
  if (prevMs !== undefined && cooldownMs > 0 && nowMs - prevMs < cooldownMs) {
    return null;
  }
  lastSentByKey.set(dedupeKey, nowMs);

  const payload: DispatchedOperationalAlert = {
    category: event.category,
    severity: event.severity,
    owner: env.ALERT_OWNER,
    environment: env.NODE_ENV,
    summary: sanitizeAlertText(event.summary),
    occurredAt: new Date(nowMs).toISOString(),
    metadata: redactAlertMetadata(event.metadata),
  };

  logger[event.severity === 'critical' ? 'error' : 'warn'](
    {
      alertCategory: payload.category,
      alertOwner: payload.owner,
      alertSeverity: payload.severity,
      metadata: payload.metadata,
    },
    `operational alert: ${payload.summary}`,
  );

  const webhookUrl =
    activeWebhookOverride !== undefined ? activeWebhookOverride : env.ALERT_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await activeTransport(webhookUrl, payload);
    } catch (err) {
      logger.error(
        { alertCategory: payload.category, err: sanitizeAlertText(String(err)) },
        'operational alert webhook delivery failed',
      );
    }
  }

  return payload;
}

export async function reportWalletReconciliationDiscrepancies(input: {
  checkedWallets: number;
  issueCount: number;
  issueCodes: string[];
}): Promise<DispatchedOperationalAlert | null> {
  if (input.issueCount <= 0) return null;
  return emitOperationalAlert({
    category: 'WALLET_RECONCILIATION',
    severity: 'critical',
    dedupeKey: `WALLET_RECONCILIATION:${input.issueCodes.slice(0, 5).sort().join(',')}`,
    summary: `Wallet reconciliation detected ${input.issueCount} discrepancy(ies) across ${input.checkedWallets} wallet(s).`,
    metadata: {
      checkedWallets: input.checkedWallets,
      issueCount: input.issueCount,
      issueCodes: input.issueCodes,
    },
  });
}

export async function reportMobileCrash(input: {
  app: 'rider-mobile' | 'driver-mobile';
  platform: 'android' | 'ios' | 'web';
  appVersion: string;
  screen?: string;
  errorName: string;
  errorMessage: string;
}): Promise<DispatchedOperationalAlert | null> {
  return emitOperationalAlert({
    category: 'MOBILE_CRASH',
    severity: 'critical',
    dedupeKey: `MOBILE_CRASH:${input.app}:${input.errorName}:${input.screen ?? 'unknown'}`,
    summary: `Mobile crash reported in ${input.app} (${input.platform} v${input.appVersion}): ${input.errorName}`,
    metadata: {
      app: input.app,
      platform: input.platform,
      appVersion: input.appVersion,
      screen: input.screen ?? null,
      errorName: input.errorName,
      errorMessage: input.errorMessage,
    },
  });
}
