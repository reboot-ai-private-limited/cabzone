import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateLoadedEnv, type Env } from '../src/config/env.js';
import {
  RequestOtpUseCase,
  VerifyOtpUseCase,
} from '../src/modules/identity/application/useCases/index.js';
import type {
  RiderEntity,
  RiderRepositoryPort,
  SessionEntity,
  SessionRepositoryPort,
  UserEntity,
  UserRepositoryPort,
} from '../src/modules/identity/domain/index.js';
import {
  HttpSmsGatewayAdapter,
  JoseTokenAdapter,
  MemoryOtpStoreAdapter,
  createSmsGatewayFromEnv,
} from '../src/modules/identity/infrastructure/index.js';
import { logger, REDACTED_PATHS } from '../src/shared/logging/logger.js';
import {
  configureAlertingForTests,
  type DispatchedOperationalAlert,
} from '../src/shared/monitoring/alerting.js';

const PEPPER = 'test-otp-pepper-that-is-at-least-32-characters-long!';
const JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long!';

function baseProdEnv(): Env {
  return {
    NODE_ENV: 'production',
    PORT: 4000,
    RAZORPAY_MODE: 'test',
    MONGO_URI: 'mongodb://mongo:27017/cabzone_prod?replicaSet=rs0',
    REDIS_URL: 'redis://redis:6379',
    CORS_ORIGINS: ['https://admin.cabzone.in'],
    LOG_LEVEL: 'info',
    JWT_ACCESS_SECRET: JWT_SECRET,
    JWT_REFRESH_SECRET: 'refresh-secret-that-is-at-least-32-chars-long!',
    OTP_PEPPER: PEPPER,
    PAYMENT_WEBHOOK_SECRET: 'webhook-secret-that-is-at-least-32-chars-long!',
    CLOUDINARY_CLOUD_NAME: 'prod-cloud',
    CLOUDINARY_API_KEY: 'prod-key',
    CLOUDINARY_API_SECRET: 'prod-secret',
    STAGING_UNSAFE: false,
    DEV_FIXED_OTP: undefined,
    SMS_PROVIDER: 'msg91',
    SMS_SENDER_ID: 'CABZON',
    SMS_DLT_TEMPLATE_ID: '1407160000000001',
    SMS_MSG91_AUTH_KEY: 'msg91-super-secret-auth-key',
    SMS_TWILIO_ACCOUNT_SID: undefined,
    SMS_TWILIO_AUTH_TOKEN: undefined,
    SMS_TWILIO_FROM: undefined,
    SMS_WEBHOOK_URL: undefined,
    SMS_WEBHOOK_AUTH_TOKEN: undefined,
    SMS_TIMEOUT_MS: 8000,
    SMS_MAX_RETRIES: 2,
    EXPO_ACCESS_TOKEN: undefined,
    ALERT_WEBHOOK_URL: undefined,
    ALERT_OWNER: 'platform-ops',
    API_LATENCY_ALERT_MS: 2500,
    ALLOW_LOCAL_REALTIME_FALLBACK: false,
    ROUTING_PROVIDER: 'google',
    GOOGLE_ROUTES_API_KEY: 'google-routes-key',
    ROUTING_TIMEOUT_MS: 4000,
    ROUTING_CACHE_TTL_S: 600,
    ROUTING_TRAFFIC_AWARE: false,
  };
}

class MemoryUserRepo implements UserRepositoryPort {
  private readonly byId = new Map<string, UserEntity>();
  async findById(id: string) {
    return this.byId.get(id) ?? null;
  }
  async findByPhone(phoneE164: string) {
    for (const u of this.byId.values()) if (u.phoneE164 === phoneE164) return { ...u };
    return null;
  }
  async create(u: UserEntity) {
    this.byId.set(u.id, { ...u });
    return { ...u };
  }
  async update(u: UserEntity) {
    this.byId.set(u.id, { ...u });
    return { ...u };
  }
}

class MemoryRiderRepo implements RiderRepositoryPort {
  private readonly byId = new Map<string, RiderEntity>();
  async findById(id: string) {
    return this.byId.get(id) ?? null;
  }
  async findByUserId(userId: string) {
    for (const r of this.byId.values()) if (r.userId === userId) return { ...r };
    return null;
  }
  async list() {
    return { items: [...this.byId.values()], total: this.byId.size };
  }
  async create(r: RiderEntity) {
    this.byId.set(r.id, { ...r });
    return { ...r };
  }
  async update(r: RiderEntity) {
    this.byId.set(r.id, { ...r });
    return { ...r };
  }
}

class MemorySessionRepo implements SessionRepositoryPort {
  private readonly sessions = new Map<string, SessionEntity>();
  async findById(id: string) {
    return this.sessions.get(id) ?? null;
  }
  async findByTokenHash() {
    return null;
  }
  async findByUserIdAndDeviceId() {
    return null;
  }
  async save(s: SessionEntity) {
    this.sessions.set(s.id, { ...s });
  }
  async revoke(id: string) {
    const s = this.sessions.get(id);
    if (s) this.sessions.set(id, { ...s, revokedAt: new Date() });
  }
  async revokeAllForUser(userId: string) {
    for (const [id, s] of this.sessions.entries()) {
      if (s.userId === userId) this.sessions.set(id, { ...s, revokedAt: new Date() });
    }
  }
}

afterEach(() => {
  configureAlertingForTests();
  vi.restoreAllMocks();
});

describe('C03: SMS gateway & live OTP auth hardening', () => {
  it('refuses DEV_FIXED_OTP, console SMS provider, and missing SMS credentials in production', () => {
    expect(() => validateLoadedEnv(baseProdEnv())).not.toThrow();

    expect(() =>
      validateLoadedEnv({ ...baseProdEnv(), DEV_FIXED_OTP: '123456' }),
    ).toThrow(/DEV_FIXED_OTP/);

    expect(() =>
      validateLoadedEnv({ ...baseProdEnv(), SMS_PROVIDER: 'console' }),
    ).toThrow(/SMS_PROVIDER/);

    expect(() =>
      validateLoadedEnv({ ...baseProdEnv(), SMS_PROVIDER: 'msg91', SMS_MSG91_AUTH_KEY: undefined }),
    ).toThrow(/SMS_MSG91_AUTH_KEY/);

    expect(() =>
      validateLoadedEnv({ ...baseProdEnv(), SMS_PROVIDER: 'twilio' }),
    ).toThrow(/SMS_TWILIO_ACCOUNT_SID/);

    expect(() =>
      createSmsGatewayFromEnv({
        ...baseProdEnv(),
        SMS_PROVIDER: 'webhook',
        SMS_WEBHOOK_URL: undefined,
      }),
    ).toThrow(/webhookUrl/);
  });

  it('delivers OTP via MSG91 and Twilio with bounded retries and never retries 4xx', async () => {
    const msg91Fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ type: 'success' }) });

    const msg91 = new HttpSmsGatewayAdapter({
      provider: 'msg91',
      senderId: 'CABZON',
      dltTemplateId: '14071600000001',
      msg91AuthKey: 'secret-auth-key',
      maxRetries: 2,
      timeoutMs: 2_000,
      fetchImpl: msg91Fetch as unknown as typeof fetch,
    });

    await msg91.sendOtp('+919876543210', '482910');
    expect(msg91Fetch).toHaveBeenCalledTimes(2);
    const [calledUrl, calledInit] = msg91Fetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://control.msg91.com/api/v5/otp');
    expect((calledInit.headers as Record<string, string>).authkey).toBe('secret-auth-key');
    expect(JSON.parse(String(calledInit.body))).toEqual({
      template_id: '14071600000001',
      mobile: '919876543210',
      otp: '482910',
      sender: 'CABZON',
    });

    const twilioFetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 400 });
    const twilio = new HttpSmsGatewayAdapter({
      provider: 'twilio',
      twilioAccountSid: 'AC123',
      twilioAuthToken: 'tw-secret',
      twilioFrom: '+15005550006',
      maxRetries: 2,
      fetchImpl: twilioFetch as unknown as typeof fetch,
    });
    await expect(twilio.sendOtp('+919876543210', '482910')).rejects.toThrow();
    expect(twilioFetch).toHaveBeenCalledTimes(1);
  });

  it('redacts phone numbers, OTPs, and provider keys from logs and alerts on SMS failure, and rolls back OTP reservation', async () => {
    const alerts: DispatchedOperationalAlert[] = [];
    configureAlertingForTests({
      webhookUrl: 'https://alerts.example/hook',
      cooldownMs: 0,
      transport: async (_url, payload) => {
        alerts.push(payload);
      },
    });
    const errorSpy = vi.spyOn(logger, 'error');

    const failingFetch = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    const smsGateway = new HttpSmsGatewayAdapter({
      provider: 'msg91',
      senderId: 'CABZON',
      dltTemplateId: '14071600000001',
      msg91AuthKey: 'top-secret-msg91-key',
      maxRetries: 1,
      fetchImpl: failingFetch as unknown as typeof fetch,
    });

    const otpStore = new MemoryOtpStoreAdapter();
    const requestOtp = new RequestOtpUseCase({
      otpStore,
      smsGateway,
      otpPepper: PEPPER,
    });

    await expect(requestOtp.execute('+919988776655')).rejects.toThrow();
    expect(await otpStore.get('+919988776655')).toBeNull();

    const serializedLogs = JSON.stringify(errorSpy.mock.calls);
    const serializedAlerts = JSON.stringify(alerts);
    expect(serializedLogs).not.toContain('9988776655');
    expect(serializedLogs).not.toContain('top-secret-msg91-key');
    expect(serializedAlerts).not.toContain('9988776655');
    expect(serializedAlerts).not.toContain('top-secret-msg91-key');
    expect(alerts[0]?.category).toBe('SMS_DELIVERY');
    expect(REDACTED_PATHS).toContain('phoneE164');
    expect(REDACTED_PATHS).toContain('*.otp');
  });

  it('rejects wrong, expired, replayed, and concurrent duplicate OTP verifications', async () => {
    let capturedOtp = '';
    const otpStore = new MemoryOtpStoreAdapter();
    const userRepo = new MemoryUserRepo();
    const riderRepo = new MemoryRiderRepo();
    const sessionRepo = new MemorySessionRepo();
    const tokenSigner = new JoseTokenAdapter(JWT_SECRET);

    const requestOtp = new RequestOtpUseCase({
      otpStore,
      smsGateway: {
        async sendOtp(_phone, otp) {
          capturedOtp = otp;
        },
      },
      otpPepper: PEPPER,
      cooldownSeconds: 0,
    });

    const verifyOtp = new VerifyOtpUseCase({
      otpStore,
      userRepo,
      riderRepo,
      sessionRepo,
      tokenSigner,
      otpPepper: PEPPER,
      maxAttempts: 3,
    });

    const phone = '+919811223344';

    // 1. Wrong OTP x3 locks out further attempts
    await requestOtp.execute(phone);
    const wrongOtp = capturedOtp === '111111' ? '222222' : '111111';
    await expect(verifyOtp.execute({ phoneE164: phone, otp: wrongOtp, deviceId: 'dev-1' })).rejects.toThrow(/Invalid OTP/);
    await expect(verifyOtp.execute({ phoneE164: phone, otp: wrongOtp, deviceId: 'dev-1' })).rejects.toThrow(/Invalid OTP/);
    await expect(verifyOtp.execute({ phoneE164: phone, otp: wrongOtp, deviceId: 'dev-1' })).rejects.toThrow(/Invalid OTP/);
    await expect(verifyOtp.execute({ phoneE164: phone, otp: capturedOtp, deviceId: 'dev-1' })).rejects.toThrow(/Maximum OTP verification attempts/);

    // 2. Expired OTP rejected
    const expiredStore = new MemoryOtpStoreAdapter();
    const expiredReq = new RequestOtpUseCase({
      otpStore: expiredStore,
      smsGateway: { async sendOtp(_p, otp) { capturedOtp = otp; } },
      otpPepper: PEPPER,
      ttlSeconds: -1,
      cooldownSeconds: 0,
    });
    const expiredVerify = new VerifyOtpUseCase({
      otpStore: expiredStore,
      userRepo,
      riderRepo,
      sessionRepo,
      tokenSigner,
      otpPepper: PEPPER,
    });
    await expiredReq.execute(phone);
    await expect(
      expiredVerify.execute({ phoneE164: phone, otp: capturedOtp, deviceId: 'dev-1' }),
    ).rejects.toThrow(/OTP expired/);

    // 3. Concurrent verification & replay: exactly one succeeds, concurrent duplicate and subsequent replay fail
    await otpStore.delete(phone);
    await requestOtp.execute(phone);
    const results = await Promise.allSettled([
      verifyOtp.execute({ phoneE164: phone, otp: capturedOtp, deviceId: 'dev-a' }),
      verifyOtp.execute({ phoneE164: phone, otp: capturedOtp, deviceId: 'dev-b' }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    await expect(
      verifyOtp.execute({ phoneE164: phone, otp: capturedOtp, deviceId: 'dev-a' }),
    ).rejects.toThrow(/OTP expired or not found/);
  });
});

describe('Play-review demo accounts (REVIEW_DEMO_PHONES)', () => {
  const DEMO = '+919999900001';

  it('gives listed numbers the fixed OTP without sending SMS, and everyone else a real OTP via SMS', async () => {
    const sendOtp = vi.fn().mockResolvedValue(undefined);
    const otpStore = new MemoryOtpStoreAdapter();
    const requestOtp = new RequestOtpUseCase({
      otpStore,
      smsGateway: { sendOtp },
      otpPepper: PEPPER,
      reviewDemo: { phones: [DEMO], otp: '424242' },
    });

    await requestOtp.execute(DEMO);
    expect(sendOtp).not.toHaveBeenCalled();

    await requestOtp.execute('+919999900002');
    expect(sendOtp).toHaveBeenCalledTimes(1);
    expect(sendOtp.mock.calls[0]?.[1]).not.toBe('424242');
  });

  it('is allowed in production only when phones and OTP are set together, as E.164, max 3', () => {
    const prod = { ...baseProdEnv() };
    expect(() =>
      validateLoadedEnv({ ...prod, REVIEW_DEMO_PHONES: [DEMO], REVIEW_DEMO_OTP: '424242' } as Env),
    ).not.toThrow();
    expect(() =>
      validateLoadedEnv({ ...prod, REVIEW_DEMO_PHONES: [DEMO] } as Env),
    ).toThrow(/set together/);
    expect(() =>
      validateLoadedEnv({ ...prod, REVIEW_DEMO_PHONES: ['9999900001'], REVIEW_DEMO_OTP: '424242' } as Env),
    ).toThrow(/E\.164/);
    expect(() =>
      validateLoadedEnv({
        ...prod,
        REVIEW_DEMO_PHONES: ['+911234567890', '+911234567891', '+911234567892', '+911234567893'],
        REVIEW_DEMO_OTP: '424242',
      } as Env),
    ).toThrow(/up to 3/);
  });
});

describe('MOCK_OTP', () => {
  it('uses 000000 for every number and never sends SMS', async () => {
    const sendOtp = vi.fn().mockResolvedValue(undefined);
    const otpStore = new MemoryOtpStoreAdapter();
    const requestOtp = new RequestOtpUseCase({
      otpStore,
      smsGateway: { sendOtp },
      otpPepper: PEPPER,
      mockOtp: true,
    });
    await requestOtp.execute('+919876543210');
    await requestOtp.execute('+919123456780');
    expect(sendOtp).not.toHaveBeenCalled();
    const stored = await otpStore.get('+919876543210');
    const { createHmac } = await import('node:crypto');
    expect(stored?.otpHmac).toBe(createHmac('sha256', PEPPER).update('000000').digest('hex'));
  });

  it('lets production run with the console SMS provider only when MOCK_OTP is on', () => {
    const prod = { ...baseProdEnv(), SMS_PROVIDER: 'console' as const };
    expect(() => validateLoadedEnv({ ...prod, MOCK_OTP: false } as Env)).toThrow(/SMS_PROVIDER/);
    expect(() => validateLoadedEnv({ ...prod, MOCK_OTP: true } as Env)).not.toThrow();
  });
});
