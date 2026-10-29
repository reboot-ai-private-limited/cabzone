import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(currentDir, '../../../../.env');
const localEnvPath = path.resolve(currentDir, '../../../.env');

// Load monorepo root .env first as primary source of truth
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
// Load local apps/api/.env if present
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
// Also check standard process.cwd() fallback
dotenv.config();

const schema = z.object({
  /**
   * The three operational states: development, stage (staging), and production.
   * Also accepts 'test' for automated test suites.
   */
  NODE_ENV: z
    .enum(['development', 'test', 'stage', 'staging', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  RAZORPAY_MODE: z.enum(['test', 'live']).default('test'),
  RAZORPAY_KEY_ID: z
    .string()
    .regex(/^rzp_(test|live)_[a-zA-Z0-9]+$/)
    .optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(16).optional(),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  /** Allowed browser origins for the admin panel / web client */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /**
   * Token signing secrets (separate for access and refresh tokens, min 32 chars).
   */
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  OTP_PEPPER: z.string().min(32, 'OTP_PEPPER must be at least 32 characters'),
  PAYMENT_WEBHOOK_SECRET: z
    .string()
    .min(32, 'PAYMENT_WEBHOOK_SECRET must be at least 32 characters'),

  /** Cloudinary storage credentials */
  CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME is required'),
  CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY is required'),
  CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET is required'),

  /**
   * Staging escape hatch.
   * Only active when explicitly set to 'true'.
   * Allows test fixtures/fixed OTP in staging environment while preserving production-like builds.
   */
  STAGING_UNSAFE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  /**
   * Development fixed OTP (6 digits). Never allowed in live production.
   */
  DEV_FIXED_OTP: z
    .string()
    .regex(/^\d{6}$/, 'DEV_FIXED_OTP must be exactly 6 digits')
    .optional(),

  /** Transactional SMS gateway configuration (Step 16 / C03) */
  SMS_PROVIDER: z.enum(['console', 'msg91', 'twilio', 'webhook']).default('console'),
  SMS_SENDER_ID: z.string().min(1).optional(),
  SMS_DLT_TEMPLATE_ID: z.string().min(1).optional(),
  SMS_MSG91_AUTH_KEY: z.string().min(1).optional(),
  SMS_TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  SMS_TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  SMS_TWILIO_FROM: z.string().min(1).optional(),
  SMS_WEBHOOK_URL: z.string().url().optional(),
  SMS_WEBHOOK_AUTH_TOKEN: z.string().min(1).optional(),
  SMS_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
  SMS_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),

  /** Expo push access token for authenticated push delivery (Step 8 / C05) */
  EXPO_ACCESS_TOKEN: z.string().min(1).optional(),

  /** Operational alerting and realtime readiness (Step 16 / C07) */
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  ALERT_OWNER: z.string().min(1).default('platform-ops'),
  API_LATENCY_ALERT_MS: z.coerce.number().int().min(250).max(60000).default(2500),
  ALLOW_LOCAL_REALTIME_FALLBACK: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  /** Routing module configuration */
  ROUTING_PROVIDER: z
    .enum(['google', 'haversine'])
    .default(process.env.NODE_ENV === 'production' ? 'google' : 'haversine'),
  GOOGLE_ROUTES_API_KEY: z
    .string()
    .optional()
    .default(
      () =>
        process.env.GOOGLE_ROUTES_API_KEY ||
        process.env.GOOGLE_MAPS_API_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
        '',
    ),
  ROUTING_TIMEOUT_MS: z.coerce.number().int().positive().default(4000),
  ROUTING_CACHE_TTL_S: z.coerce.number().int().positive().default(600),
  ROUTING_TRAFFIC_AWARE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);

type Env = z.infer<typeof schema>;

export const env: Env = parsed.success
  ? parsed.data
  : schema
      .extend({
        MONGO_URI: z.string().default(''),
        REDIS_URL: z.string().default(''),
        JWT_ACCESS_SECRET: z.string().default('test-only-access-secret-not-for-any-real-use'),
        JWT_REFRESH_SECRET: z.string().default('test-only-refresh-secret-not-for-any-real-use'),
        OTP_PEPPER: z.string().default('test-only-otp-pepper-not-for-any-real-use-x'),
        PAYMENT_WEBHOOK_SECRET: z.string().default('test-only-webhook-secret-not-for-any-real-use'),
        CLOUDINARY_CLOUD_NAME: z.string().default('test-cloud'),
        CLOUDINARY_API_KEY: z.string().default('test-key'),
        CLOUDINARY_API_SECRET: z.string().default('test-secret'),
        ROUTING_PROVIDER: z.enum(['google', 'haversine']).default('haversine'),
        ROUTING_TIMEOUT_MS: z.coerce.number().default(4000),
        ROUTING_CACHE_TTL_S: z.coerce.number().default(600),
        ROUTING_TRAFFIC_AWARE: z.boolean().default(false),
      })
      .parse({ NODE_ENV: process.env.NODE_ENV });

export type { Env };

export const isProduction = env.NODE_ENV === 'production';
export const isStaging = env.NODE_ENV === 'stage' || env.NODE_ENV === 'staging';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
export const isProdLike = isProduction || isStaging;

export const allowDevShortcuts = isDevelopment || (isStaging && env.STAGING_UNSAFE);

export function validateLoadedEnv(data: Env): Env {
  // Dual-lock: DEV_FIXED_OTP must NEVER run in live production
  if (data.NODE_ENV === 'production' && data.DEV_FIXED_OTP !== undefined) {
    throw new Error(
      'Invalid environment:\n  DEV_FIXED_OTP: must not be set when NODE_ENV=production. ' +
        'Fixed OTP is strictly forbidden in live production.',
    );
  }

  const requiresRealSms =
    data.NODE_ENV === 'production' ||
    ((data.NODE_ENV === 'stage' || data.NODE_ENV === 'staging') && !data.STAGING_UNSAFE);
  if (requiresRealSms && data.SMS_PROVIDER === 'console') {
    throw new Error(
      'Invalid environment:\n  SMS_PROVIDER: must be msg91, twilio, or webhook when live authentication is active.',
    );
  }
  if (data.SMS_PROVIDER === 'msg91') {
    if (!data.SMS_MSG91_AUTH_KEY || !data.SMS_SENDER_ID || !data.SMS_DLT_TEMPLATE_ID) {
      throw new Error(
        'Invalid environment:\n  SMS_MSG91_AUTH_KEY, SMS_SENDER_ID, and SMS_DLT_TEMPLATE_ID are required when SMS_PROVIDER="msg91".',
      );
    }
  } else if (data.SMS_PROVIDER === 'twilio') {
    if (!data.SMS_TWILIO_ACCOUNT_SID || !data.SMS_TWILIO_AUTH_TOKEN || !data.SMS_TWILIO_FROM) {
      throw new Error(
        'Invalid environment:\n  SMS_TWILIO_ACCOUNT_SID, SMS_TWILIO_AUTH_TOKEN, and SMS_TWILIO_FROM are required when SMS_PROVIDER="twilio".',
      );
    }
  } else if (data.SMS_PROVIDER === 'webhook' && !data.SMS_WEBHOOK_URL) {
    throw new Error(
      'Invalid environment:\n  SMS_WEBHOOK_URL is required when SMS_PROVIDER="webhook".',
    );
  }

  // Google Routes API key validation when provider is google
  if (data.NODE_ENV === 'production' && data.ROUTING_PROVIDER === 'haversine') {
    throw new Error('Invalid environment: production requires a road-routing provider.');
  }
  if (data.ROUTING_PROVIDER === 'google' && !data.GOOGLE_ROUTES_API_KEY) {
    throw new Error(
      'Invalid environment:\n  GOOGLE_ROUTES_API_KEY: is required when ROUTING_PROVIDER="google".',
    );
  }

  return data;
}

export function loadEnv(): Env {
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`Invalid environment:\n${issues}`);
    process.exit(1);
  }

  try {
    validateLoadedEnv(parsed.data);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Warning banner for staging with unsafe flag enabled
  if (isStaging && parsed.data.STAGING_UNSAFE) {
    console.warn(
      [
        '',
        '  ┌─ STAGING_UNSAFE=true ─────────────────────────────────────────────────────┐',
        '  │ This staging deployment is running with test login shortcuts enabled.     │',
        '  │ Intended exclusively for automated QA / staging test suites.             │',
        '  │ NEVER enable on live production environments.                             │',
        '  └───────────────────────────────────────────────────────────────────────────┘',
        '',
      ].join('\n'),
    );
  }

  return parsed.data;
}
