import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    environment: 'node',
    // Never let a developer's real Razorpay credentials from .env leak into the test run.
    env: {
      MONGO_URI: 'mongodb://localhost:27017/cabzone-test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'test-only-access-secret-not-for-any-real-use',
      JWT_REFRESH_SECRET: 'test-only-refresh-secret-not-for-any-real-use',
      OTP_PEPPER: 'test-only-otp-pepper-not-for-any-real-use-x',
      PAYMENT_WEBHOOK_SECRET: 'test-only-webhook-secret-not-for-any-real-use',
      CLOUDINARY_CLOUD_NAME: 'test-cloud',
      CLOUDINARY_API_KEY: 'test-key',
      CLOUDINARY_API_SECRET: 'test-secret',
      RAZORPAY_MODE: 'test',
      RAZORPAY_KEY_ID: 'rzp_test_vitestplaceholder',
      RAZORPAY_KEY_SECRET: 'vitest-placeholder-secret',
    },
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
