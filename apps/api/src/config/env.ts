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

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  /** Allowed browser origins for the admin panel / web client */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),

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
      .parse({});

export type { Env };

export const isProduction = env.NODE_ENV === 'production';
export const isStaging = env.NODE_ENV === 'stage' || env.NODE_ENV === 'staging';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
export const isProdLike = isProduction || isStaging;

export const allowDevShortcuts = isDevelopment || (isStaging && env.STAGING_UNSAFE);

export function loadEnv(): Env {
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`Invalid environment:\n${issues}`);
    process.exit(1);
  }

  // Dual-lock: DEV_FIXED_OTP must NEVER run in live production
  if (parsed.data.NODE_ENV === 'production' && parsed.data.DEV_FIXED_OTP !== undefined) {
    console.error(
      'Invalid environment:\n  DEV_FIXED_OTP: must not be set when NODE_ENV=production. ' +
        'Fixed OTP is strictly forbidden in live production.',
    );
    process.exit(1);
  }

  // Google Routes API key validation when provider is google
  if (parsed.data.NODE_ENV === 'production' && parsed.data.ROUTING_PROVIDER === 'haversine') {
    console.error('Invalid environment: production requires a road-routing provider.');
    process.exit(1);
  }
  if (parsed.data.ROUTING_PROVIDER === 'google' && !parsed.data.GOOGLE_ROUTES_API_KEY) {
    console.error(
      'Invalid environment:\n  GOOGLE_ROUTES_API_KEY: is required when ROUTING_PROVIDER="google".',
    );
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
