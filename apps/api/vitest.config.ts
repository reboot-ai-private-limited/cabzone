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
      RAZORPAY_MODE: 'test',
      RAZORPAY_KEY_ID: 'rzp_test_vitestplaceholder',
      RAZORPAY_KEY_SECRET: 'vitest-placeholder-secret',
    },
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
