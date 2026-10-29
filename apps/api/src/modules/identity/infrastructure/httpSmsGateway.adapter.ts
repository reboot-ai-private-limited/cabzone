import { Buffer } from 'node:buffer';
import { env, type Env } from '@/config/env.js';
import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/logging/logger.js';
import { emitOperationalAlert } from '@/shared/monitoring/alerting.js';
import type { SmsGatewayPort } from '../domain/otp.port.js';
import { ConsoleSmsGatewayAdapter } from './consoleSmsGateway.adapter.js';

export type HttpSmsProvider = 'msg91' | 'twilio' | 'webhook';

export interface HttpSmsGatewayConfig {
  provider: HttpSmsProvider;
  timeoutMs?: number;
  maxRetries?: number;
  senderId?: string | undefined;
  dltTemplateId?: string | undefined;
  msg91AuthKey?: string | undefined;
  twilioAccountSid?: string | undefined;
  twilioAuthToken?: string | undefined;
  twilioFrom?: string | undefined;
  webhookUrl?: string | undefined;
  webhookAuthToken?: string | undefined;
  fetchImpl?: typeof fetch;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Production transactional SMS gateway adapter (Step 16 / C03).
 * Uses bounded timeouts and retries; never logs OTP values, phone numbers, or provider secrets.
 */
export class HttpSmsGatewayAdapter implements SmsGatewayPort {
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly config: HttpSmsGatewayConfig) {
    this.timeoutMs = config.timeoutMs ?? 8_000;
    this.maxRetries = config.maxRetries ?? 2;
    this.fetchFn = config.fetchImpl ?? fetch;
    this.validateConfig();
  }

  private validateConfig(): void {
    if (this.config.provider === 'msg91') {
      if (!this.config.msg91AuthKey || !this.config.senderId || !this.config.dltTemplateId) {
        throw new Error(
          'HttpSmsGatewayAdapter(msg91) requires msg91AuthKey, senderId, and dltTemplateId.',
        );
      }
    } else if (this.config.provider === 'twilio') {
      if (
        !this.config.twilioAccountSid ||
        !this.config.twilioAuthToken ||
        !this.config.twilioFrom
      ) {
        throw new Error(
          'HttpSmsGatewayAdapter(twilio) requires twilioAccountSid, twilioAuthToken, and twilioFrom.',
        );
      }
    } else if (this.config.provider === 'webhook') {
      if (!this.config.webhookUrl) {
        throw new Error('HttpSmsGatewayAdapter(webhook) requires webhookUrl.');
      }
    }
  }

  private buildRequest(phoneE164: string, otp: string): { url: string; init: RequestInit } {
    if (this.config.provider === 'msg91') {
      return {
        url: 'https://control.msg91.com/api/v5/otp',
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            authkey: this.config.msg91AuthKey!,
          },
          body: JSON.stringify({
            template_id: this.config.dltTemplateId!,
            mobile: phoneE164.replace(/^\+/, ''),
            otp,
            sender: this.config.senderId!,
          }),
        },
      };
    }

    if (this.config.provider === 'twilio') {
      const sid = this.config.twilioAccountSid!;
      const basic = Buffer.from(`${sid}:${this.config.twilioAuthToken!}`).toString('base64');
      const form = new URLSearchParams({
        To: phoneE164,
        From: this.config.twilioFrom!,
        Body: `Your Cabzone verification code is ${otp}. Valid for 5 minutes. Do not share this code.`,
      });
      return {
        url: `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
        init: {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: form.toString(),
        },
      };
    }

    return {
      url: this.config.webhookUrl!,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.config.webhookAuthToken
            ? { Authorization: `Bearer ${this.config.webhookAuthToken}` }
            : {}),
        },
        body: JSON.stringify({
          to: phoneE164,
          otp,
          senderId: this.config.senderId ?? null,
          templateId: this.config.dltTemplateId ?? null,
          channel: 'transactional_otp',
        }),
      },
    };
  }

  async sendOtp(phoneE164: string, otp: string): Promise<void> {
    const { url, init } = this.buildRequest(phoneE164, otp);
    let lastStatus: number | null = null;
    let lastReason = 'network_or_timeout';

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchFn(url, {
          ...init,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        lastStatus = res.status;

        if (res.ok) {
          if (this.config.provider === 'msg91') {
            const payload = (await res.json().catch(() => ({}))) as { type?: unknown };
            if (payload.type === 'error') {
              lastReason = 'provider_payload_error';
              break;
            }
          }
          return;
        }

        lastReason = `http_${res.status}`;
        if (!isRetryableStatus(res.status) || attempt === this.maxRetries) {
          break;
        }
      } catch (err) {
        lastReason = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network';
        if (attempt === this.maxRetries) {
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
    }

    logger.error(
      {
        smsProvider: this.config.provider,
        attempts: this.maxRetries + 1,
        statusCode: lastStatus,
        reason: lastReason,
      },
      'sms otp delivery failed',
    );
    void emitOperationalAlert({
      category: 'SMS_DELIVERY',
      severity: 'critical',
      dedupeKey: `SMS_DELIVERY:${this.config.provider}:${lastReason}`,
      summary: `Transactional SMS OTP delivery failed via ${this.config.provider} (${lastReason}).`,
      metadata: {
        smsProvider: this.config.provider,
        statusCode: lastStatus,
        reason: lastReason,
        attempts: this.maxRetries + 1,
      },
    });

    throw new AppError({
      statusCode: 503,
      code: 'INTERNAL',
      message: 'Unable to send verification code right now. Please try again shortly.',
    });
  }
}

export function createSmsGatewayFromEnv(
  source: Pick<
    Env,
    | 'SMS_PROVIDER'
    | 'SMS_TIMEOUT_MS'
    | 'SMS_MAX_RETRIES'
    | 'SMS_SENDER_ID'
    | 'SMS_DLT_TEMPLATE_ID'
    | 'SMS_MSG91_AUTH_KEY'
    | 'SMS_TWILIO_ACCOUNT_SID'
    | 'SMS_TWILIO_AUTH_TOKEN'
    | 'SMS_TWILIO_FROM'
    | 'SMS_WEBHOOK_URL'
    | 'SMS_WEBHOOK_AUTH_TOKEN'
  > = env,
): SmsGatewayPort {
  if (source.SMS_PROVIDER === 'console') {
    return new ConsoleSmsGatewayAdapter();
  }
  return new HttpSmsGatewayAdapter({
    provider: source.SMS_PROVIDER,
    timeoutMs: source.SMS_TIMEOUT_MS,
    maxRetries: source.SMS_MAX_RETRIES,
    senderId: source.SMS_SENDER_ID,
    dltTemplateId: source.SMS_DLT_TEMPLATE_ID,
    msg91AuthKey: source.SMS_MSG91_AUTH_KEY,
    twilioAccountSid: source.SMS_TWILIO_ACCOUNT_SID,
    twilioAuthToken: source.SMS_TWILIO_AUTH_TOKEN,
    twilioFrom: source.SMS_TWILIO_FROM,
    webhookUrl: source.SMS_WEBHOOK_URL,
    webhookAuthToken: source.SMS_WEBHOOK_AUTH_TOKEN,
  });
}
