import { Buffer } from 'node:buffer';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { ExpoPushService } from '../src/modules/dispatch/application/expoPush.service.js';
import { RideRealtimeNotifier } from '../src/modules/dispatch/application/rideRealtimeNotifier.js';
import { DriverOfferEligibility } from '../src/modules/dispatch/application/useCases/driverOfferEligibility.js';
import { FindCandidateDriversUseCase } from '../src/modules/dispatch/application/useCases/findCandidateDrivers.usecase.js';
import { DEFAULT_DISPATCH_CONFIG } from '../src/modules/dispatch/application/dispatch.types.js';
import { buildDispatchContainer } from '../src/modules/dispatch/dispatch.container.js';
import { MemoryPresenceRepository } from '../src/modules/dispatch/infrastructure/memoryPresence.repository.js';
import { MemoryPushReceiptRepository } from '../src/modules/dispatch/infrastructure/pushReceipt.repository.js';
import { MemoryPushTokenRepository } from '../src/modules/dispatch/infrastructure/pushToken.repository.js';
import { GetHealthUseCase } from '../src/modules/health/application/useCases/getHealth.usecase.js';
import { assertRealtimeReadyForEnv } from '../src/modules/health/health.public.js';
import { QueueHealthProbe } from '../src/modules/health/infrastructure/queueHealthProbe.adapter.js';
import { MemoryWalletRepository } from '../src/modules/ledger/index.js';
import { MemoryRideRepository, type RideEntity } from '../src/modules/rides/index.js';
import { errorHandler } from '../src/shared/http/error-handler.js';
import {
  configureAlertingForTests,
  emitOperationalAlert,
  reportMobileCrash,
  reportWalletReconciliationDiscrepancies,
  type DispatchedOperationalAlert,
} from '../src/shared/monitoring/alerting.js';
import {
  buildBackupManifest,
  decryptBackupBuffer,
  encryptBackupBuffer,
} from '../../../scripts/ops/backup-mongo.mjs';
import {
  assertIsolatedRestoreTarget,
  verifyRestoredDataInvariants,
} from '../../../scripts/ops/restore-mongo-drill.mjs';
import {
  buildRollbackPlan,
  evaluateSmokeHealth,
} from '../../../scripts/ops/deploy-smoke-and-rollback.mjs';

const VALID_HEX_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function sampleRide(overrides: Partial<RideEntity> = {}): RideEntity {
  const now = new Date();
  return {
    id: '018f0a00-0000-7000-8000-000000000999',
    bookerRiderId: 'rider-1',
    passenger: { riderId: 'rider-1', name: 'Asha', phoneE164: '+919800000001' },
    driverId: 'driver-1',
    vehicleId: 'vehicle-1',
    status: 'DRIVER_ASSIGNED',
    vehicleCategory: 'CAB',
    pickup: { lat: 26.71, lng: 88.42, address: 'Sevoke Road' },
    drop: { lat: 26.75, lng: 88.45, address: 'Junction' },
    routeSnapshot: {
      provider: 'haversine',
      distanceM: 5000,
      durationSeconds: 600,
      polyline: '',
      calculatedAt: now,
    },
    zoneSnapshot: { classification: 'INNER_CITY', cityZoneId: 'zone-1' },
    suggestedFarePaise: 15_000,
    proposedFarePaise: 15_000,
    agreedFarePaise: 15_000,
    pricingSnapshot: {
      configId: 'cfg-1',
      configVersion: 1,
      baseFarePaise: 5000,
      ratePerKmPaise: 1500,
      minimumFarePaise: 8000,
      bufferSurchargePaise: 0,
      commissionPercent: 8,
      negotiationFloorPaise: 12_000,
      negotiationCeilingPaise: 22_500,
    },
    pickupOtpHmac: 'hmac',
    pickupOtpPlain: '4921',
    pickupOtpAttempts: 0,
    pickupOtpExpiresAt: new Date(now.getTime() + 600_000),
    cancellationReason: null,
    offeringExpiresAt: new Date(now.getTime() + 90_000),
    acceptedAt: now,
    arrivedAt: null,
    startedAt: null,
    completedAt: null,
    settledAt: null,
    cancelledAt: null,
    version: 2,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as RideEntity;
}

afterEach(() => {
  configureAlertingForTests();
});

describe('C05: Shared push-token router and rider background push delivery', () => {
  it('registers/unregisters rider tokens on /v1/push-token and sends ride-updates push without leaking pickupOtp', async () => {
    const pushTokens = new MemoryPushTokenRepository();
    const pushReceipts = new MemoryPushReceiptRepository();
    const sentBatches: Array<Array<Record<string, unknown>>> = [];

    const connectedUsers = new Set<string>();
    const published: Array<{ userId: string; event: string; data: unknown }> = [];
    const publisher = {
      publishToUser(userId: string, event: string, data: unknown) {
        published.push({ userId, event, data });
      },
      async isConnected(userId: string) {
        return connectedUsers.has(userId);
      },
    };

    const rideRepo = new MemoryRideRepository();
    const walletRepo = new MemoryWalletRepository();
    const presence = new MemoryPresenceRepository();
    const lookups = {
      async getDriverEligibility() {
        return null;
      },
      async getUserIdForDriver(driverId: string) {
        return driverId === 'driver-1' ? 'driver-user-1' : null;
      },
      async getUserIdForRider(riderId: string) {
        return riderId === 'rider-1' ? 'rider-user-1' : null;
      },
    };

    const dispatch = buildDispatchContainer({
      presence,
      publisher,
      rideRepo,
      walletRepo,
      lookups,
      pushTokens,
      pushReceipts,
    });

    const app = express();
    app.use(express.json());
    app.use(
      '/api/v1',
      dispatch.buildPushTokenRouter({
        authenticate: (req, _res, next) => {
          req.auth = { userId: 'rider-user-1', sessionId: 'sess-1', role: 'RIDER' };
          next();
        },
      }),
    );
    app.use(errorHandler);

    const reg = await request(app).post('/api/v1/push-token').send({
      installationId: 'rider-phone-1',
      token: 'ExponentPushToken[rider-token-abc]',
    });
    expect(reg.status).toBe(200);
    expect(await pushTokens.list(['rider-user-1'])).toEqual([
      'ExponentPushToken[rider-token-abc]',
    ]);

    const push = new ExpoPushService(pushTokens, pushReceipts, async (batch) => {
      sentBatches.push(batch);
      return batch.map((_, idx) => ({ status: 'ok', id: `ticket-${idx}` }));
    });
    const findCandidates = new FindCandidateDriversUseCase(
      presence,
      new DriverOfferEligibility(walletRepo, rideRepo),
      DEFAULT_DISPATCH_CONFIG,
    );
    const notifier = new RideRealtimeNotifier(publisher, findCandidates, lookups, rideRepo, push);

    // Connected rider gets WebSocket event (with pickupOtp), NO push notification
    connectedUsers.add('rider-user-1');
    await notifier.rideUpdated(sampleRide(), 'ride.driver.assigned', { pickupOtp: '4921' });
    await new Promise((r) => setTimeout(r, 15));
    expect(sentBatches).toHaveLength(0);

    // Disconnected rider gets push on 'ride-updates' channel WITHOUT pickupOtp
    connectedUsers.delete('rider-user-1');
    await notifier.rideUpdated(sampleRide(), 'ride.driver.assigned', { pickupOtp: '4921' });
    await new Promise((r) => setTimeout(r, 15));
    expect(sentBatches).toHaveLength(1);
    expect(sentBatches[0]?.[0]).toMatchObject({
      to: 'ExponentPushToken[rider-token-abc]',
      channelId: 'ride-updates',
      title: 'Driver assigned',
    });
    expect(JSON.stringify(sentBatches)).not.toContain('4921');

    const unreg = await request(app)
      .delete('/api/v1/push-token')
      .send({ installationId: 'rider-phone-1' });
    expect(unreg.status).toBe(200);
    expect(await pushTokens.list(['rider-user-1'])).toEqual([]);
    expect(published.length).toBeGreaterThanOrEqual(2);
  });
});

describe('C06 & C07: Encrypted backup/restore guards, realtime readiness, and redacted alerting', () => {
  it('delivers redacted webhook alerts on injected API 500, queue lag, wallet discrepancy, and mobile crash', async () => {
    const delivered: DispatchedOperationalAlert[] = [];
    configureAlertingForTests({
      webhookUrl: 'https://alerts.cabzone.example/webhook',
      cooldownMs: 0,
      transport: async (_url, payload) => {
        delivered.push(payload);
      },
    });

    // 1. Injected API 500 with query token
    const app = express();
    app.get('/api/v1/boom', () => {
      throw new Error('Unhandled crash for +919876543210 with Bearer secret-jwt-123');
    });
    app.use(errorHandler);
    const res = await request(app).get('/api/v1/boom?sig=secret-query-sig-777');
    expect(res.status).toBe(500);

    // 2. BullMQ failed job probe
    const queueProbe = new QueueHealthProbe(async () => ({
      waiting: 300,
      active: 2,
      failed: 3,
      delayed: 0,
    }));
    const health = await new GetHealthUseCase([queueProbe], () => 42, true).execute();
    expect(health.status).toBe('healthy');

    // 3. Wallet reconciliation & mobile crash helpers + direct secret redaction check
    await reportWalletReconciliationDiscrepancies({
      checkedWallets: 12,
      issueCount: 1,
      issueCodes: ['WALLET_BALANCE_DRIFT'],
    });
    await reportMobileCrash({
      app: 'driver-mobile',
      platform: 'android',
      appVersion: '1.0.0',
      screen: '/active-ride',
      errorName: 'TypeError',
      errorMessage: 'Crash with ExponentPushToken[secret-push-tok] and +919876543210',
    });
    await emitOperationalAlert({
      category: 'DATASTORE_HEALTH',
      severity: 'critical',
      summary: 'Test redaction check',
      metadata: {
        phoneE164: '+919876543210',
        otp: '654321',
        apiKey: 'cloudinary-secret',
        storageKey: 'driver-kyc/private.pdf',
      },
    });

    const categories = delivered.map((d) => d.category);
    expect(categories).toEqual(
      expect.arrayContaining([
        'API_5XX',
        'QUEUE_HEALTH',
        'WALLET_RECONCILIATION',
        'MOBILE_CRASH',
        'DATASTORE_HEALTH',
      ]),
    );

    const dump = JSON.stringify(delivered);
    expect(dump).not.toContain('9876543210');
    expect(dump).not.toContain('654321');
    expect(dump).not.toContain('cloudinary-secret');
    expect(dump).not.toContain('driver-kyc/private.pdf');
    expect(dump).not.toContain('secret-push-tok');
    expect(dump).not.toContain('secret-query-sig-777');

    // 4. Realtime prod-like readiness refuses silent local-only fallback unless explicitly allowed
    await expect(
      assertRealtimeReadyForEnv(false, { prodLike: true, allowLocalFallback: false }),
    ).rejects.toThrow(/Redis shared realtime delivery is required/);
    await expect(
      assertRealtimeReadyForEnv(false, { prodLike: true, allowLocalFallback: true }),
    ).resolves.toBeUndefined();
  });

  it('encrypts/decrypts backups with AES-256-GCM, blocks non-drill restore targets, and checks post-restore invariants', () => {
    const sampleArchive = Buffer.from('mock-gzip-mongodump-payload-cabzone-v1', 'utf8');
    const encrypted = encryptBackupBuffer(sampleArchive, VALID_HEX_KEY);
    expect(encrypted.includes(sampleArchive)).toBe(false);

    const manifest = buildBackupManifest({
      filename: 'cabzone.archive.gz.enc',
      encryptedBuffer: encrypted,
      plainByteLength: sampleArchive.byteLength,
      sourceDbName: 'cabzone_stage',
    });
    expect(manifest.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(decryptBackupBuffer(encrypted, VALID_HEX_KEY).equals(sampleArchive)).toBe(true);

    // Tampered ciphertext must fail GCM authentication
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptBackupBuffer(tampered, VALID_HEX_KEY)).toThrow();

    // Restore safety guard never allows active/prod/non-drill DB overwrite
    expect(() =>
      assertIsolatedRestoreTarget('cabzone_prod', 'mongodb://localhost:27017/cabzone_prod'),
    ).toThrow(/protected database/);
    expect(() =>
      assertIsolatedRestoreTarget('cabzone_stage_copy', 'mongodb://localhost:27017/cabzone_stage'),
    ).toThrow(/_restore_drill/);
    expect(() =>
      assertIsolatedRestoreTarget(
        'cabzone_stage_restore_drill',
        'mongodb://localhost:27017/cabzone_stage_restore_drill',
      ),
    ).toThrow(/matches active MONGO_URI/);
    expect(
      assertIsolatedRestoreTarget(
        'cabzone_stage_restore_drill',
        'mongodb://localhost:27017/cabzone_stage',
      ),
    ).toBe('cabzone_stage_restore_drill');

    // Post-restore balance & ride/payment invariant checks
    const cleanCheck = verifyRestoredDataInvariants({
      wallets: [{ id: 'w1', balancePaise: 4200, earningsBalancePaise: 15_000 }],
      walletTransactions: [
        {
          id: 'tx1',
          walletId: 'w1',
          bucket: 'COMMISSION',
          type: 'CREDIT',
          amountPaise: 5000,
          balanceBeforePaise: 0,
          balanceAfterPaise: 5000,
          createdAt: '2026-10-28T10:00:00Z',
        },
        {
          id: 'tx2',
          walletId: 'w1',
          bucket: 'COMMISSION',
          type: 'DEBIT',
          amountPaise: 800,
          balanceBeforePaise: 5000,
          balanceAfterPaise: 4200,
          createdAt: '2026-10-28T10:05:00Z',
        },
        {
          id: 'tx3',
          walletId: 'w1',
          bucket: 'EARNINGS',
          type: 'CREDIT',
          amountPaise: 15_000,
          balanceBeforePaise: 0,
          balanceAfterPaise: 15_000,
          createdAt: '2026-10-28T10:05:00Z',
        },
      ],
      rides: [{ id: 'r1', status: 'SETTLED', agreedFarePaise: 15_000 }],
      payments: [{ id: 'p1', rideId: 'r1', status: 'CONFIRMED' }],
    });
    expect(cleanCheck.ok).toBe(true);

    const driftedCheck = verifyRestoredDataInvariants({
      wallets: [{ id: 'w1', balancePaise: 9999, earningsBalancePaise: 0 }],
      walletTransactions: [
        {
          id: 'tx1',
          walletId: 'w1',
          bucket: 'COMMISSION',
          type: 'CREDIT',
          amountPaise: 5000,
          balanceBeforePaise: 0,
          balanceAfterPaise: 5000,
          createdAt: '2026-10-28T10:00:00Z',
        },
      ],
      rides: [],
      payments: [{ id: 'p-orphan', rideId: 'missing-ride', status: 'CONFIRMED' }],
    });
    expect(driftedCheck.ok).toBe(false);
    expect(driftedCheck.issues).toHaveLength(2);

    // Smoke & rollback helper verification
    expect(
      evaluateSmokeHealth(200, {
        data: {
          status: 'healthy',
          dependencies: [
            { name: 'mongodb', status: 'up' },
            { name: 'redis', status: 'up' },
            { name: 'bullmq', status: 'up' },
          ],
        },
      }).ok,
    ).toBe(true);
    expect(
      evaluateSmokeHealth(503, {
        data: {
          status: 'degraded',
          dependencies: [
            { name: 'mongodb', status: 'up' },
            { name: 'redis', status: 'down' },
          ],
        },
      }).ok,
    ).toBe(false);
    expect(buildRollbackPlan({ previousTag: 'sha-8a3bb63' }).commands[0]).toContain(
      'IMAGE_TAG=sha-8a3bb63',
    );
  });
});
