import { createHash } from 'node:crypto';
import { Router } from 'express';
import { decodeJwt } from 'jose';
import { WebhookReceiver } from 'livekit-server-sdk';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { AuthRole } from '@cabzone/contracts';
import { createApp } from '../src/app.js';
import { ExpoPushService } from '../src/modules/dispatch/application/expoPush.service.js';
import { MemoryPushReceiptRepository } from '../src/modules/dispatch/infrastructure/pushReceipt.repository.js';
import { MemoryPushTokenRepository } from '../src/modules/dispatch/infrastructure/pushToken.repository.js';
import {
  makeRegisterPushTokenController,
  makeUnregisterPushTokenController,
} from '../src/modules/dispatch/interface/dispatch.controller.js';
import { buildPushTokenRouter } from '../src/modules/dispatch/interface/dispatch.routes.js';
import type { SessionEntity, SessionRepositoryPort } from '../src/modules/identity/domain/index.js';
import type { IdentityContainer } from '../src/modules/identity/identity.container.js';
import { JoseTokenAdapter } from '../src/modules/identity/infrastructure/index.js';
import {
  makeAuthenticate,
  makeRequireZoneAccess,
  requireRole,
} from '../src/modules/identity/interface/middlewares/index.js';
import { MemoryWalletRepository } from '../src/modules/ledger/index.js';
import {
  CreateQuoteUseCase,
  MemoryPricingConfigRepository,
  type PricingConfigEntity,
} from '../src/modules/pricing/index.js';
import {
  MemoryRideCallRepository,
  MemoryRideEventRepository,
  MemoryRideRepository,
  type RideCallPushPort,
  type RideVoiceProviderPort,
} from '../src/modules/rides/index.js';
import { LiveKitVoiceGateway } from '../src/modules/rides/infrastructure/liveKitVoice.gateway.js';
import { buildRidesContainer } from '../src/modules/rides/rides.container.js';
import {
  MemoryZoneRepository,
  ResolveZonesUseCase,
  ServiceClassificationUseCase,
  type ZoneEntity,
} from '../src/modules/zone/index.js';
import { unitOfWork } from './helpers/unitOfWork.js';

const JWT_SECRET = 'this-is-a-super-secret-key-that-is-at-least-32-chars-long!';
const QUOTE_SECRET = 'test-token-secret-for-quote-signature-32';
const LK_API_KEY = 'APItestkey123456';
const LK_API_SECRET = 'test-livekit-secret-at-least-32-bytes-long-abc';

const CITY_ZONE_ID = '018f0a00-0000-7000-8000-000000000001';
const CONFIG_ID = '018f0a00-0000-7000-8000-000000000010';
const RIDER_USER = '018f0a00-0000-7000-8000-0000000000a1';
const OTHER_RIDER_USER = '018f0a00-0000-7000-8000-0000000000a2';
const DRIVER_USER = '018f0a00-0000-7000-8000-0000000000b1';
const OTHER_DRIVER_USER = '018f0a00-0000-7000-8000-0000000000b2';
const ADMIN_USER = '018f0a00-0000-7000-8000-0000000000c1';
const RIDER_ID = '018f0a00-0000-7000-8000-000000000201';
const OTHER_RIDER_ID = '018f0a00-0000-7000-8000-000000000202';
const DRIVER_ID = '018f0a00-0000-7000-8000-000000000101';
const OTHER_DRIVER_ID = '018f0a00-0000-7000-8000-000000000102';

const profileIds: Record<string, string> = {
  [RIDER_USER]: RIDER_ID,
  [OTHER_RIDER_USER]: OTHER_RIDER_ID,
  [DRIVER_USER]: DRIVER_ID,
  [OTHER_DRIVER_USER]: OTHER_DRIVER_ID,
};

const cityZone: ZoneEntity = {
  id: CITY_ZONE_ID,
  name: 'Siliguri City',
  zoneType: 'CITY',
  parentCityZoneId: null,
  stateCode: 'WB',
  boundary: {
    type: 'Polygon',
    coordinates: [[[88.4, 26.7], [88.5, 26.7], [88.5, 26.8], [88.4, 26.8], [88.4, 26.7]]],
  },
  bufferDistanceM: 25_000,
  status: 'ACTIVE',
  currentPricingConfigId: CONFIG_ID,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const pricingConfig: PricingConfigEntity = {
  id: CONFIG_ID,
  cityZoneId: CITY_ZONE_ID,
  version: 1,
  vehicleType: 'CAB',
  baseFarePaise: 5000,
  ratePerKmPaise: 1500,
  minimumFarePaise: 8000,
  outstationBaseFarePaise: 7500,
  outstationRatePerKmPaise: 2000,
  outstationMinimumFarePaise: 15000,
  bufferSurchargePaise: 2000,
  negotiationFloorPercent: 80,
  negotiationCeilingPercent: 150,
  negotiationWindowSeconds: 90,
  commissionPercent: 8,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
  status: 'ACTIVE',
  createdByAdminId: '018f0a00-0000-7000-8000-000000000099',
  createdAt: new Date(),
};

class MemorySessionRepository implements SessionRepositoryPort {
  private readonly sessions = new Map<string, SessionEntity>();
  async findById(id: string) { return this.sessions.get(id) ?? null; }
  async findByTokenHash() { return null; }
  async findByUserIdAndDeviceId() { return null; }
  async save(s: SessionEntity) { this.sessions.set(s.id, { ...s }); }
  async revoke() {}
  async revokeAllForUser() {}
}

async function signLiveKitWebhook(payload: Record<string, unknown>): Promise<{ body: string; auth: string }> {
  const body = JSON.stringify(payload);
  const sha256 = createHash('sha256').update(body).digest('base64');
  const tokenAdapter = new JoseTokenAdapter(LK_API_SECRET);
  void tokenAdapter;
  const { SignJWT } = await import('jose');
  const auth = await new SignJWT({ video: {}, sha256 })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(LK_API_KEY)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(LK_API_SECRET));
  return { body, auth };
}

async function setup(opts: {
  callsEnabled?: boolean;
  retryAfterSeconds?: number;
  requireRegisteredInstallation?: boolean;
  liveParticipantIds?: (roomName: string) => Promise<string[]>;
} = {}) {
  const inactiveUsers = new Set<string>();
  const sessionRepo = new MemorySessionRepository();
  const tokenAdapter = new JoseTokenAdapter(JWT_SECRET);
  const authenticate = makeAuthenticate({ tokenVerifier: tokenAdapter, sessionRepo });
  const identity: IdentityContainer = {
    requireAdminScope: () => requireRole('SUPER_ADMIN'),
    buildAuthRouter: () => Router(),
    buildDriverRouter: () => Router(),
    buildAdminDriverRouter: () => Router(),
    authenticate,
    requireRole,
    requireZoneAccess: makeRequireZoneAccess({ adminRepo: { findByUserId: async () => null } }),
  };

  const zoneRepo = new MemoryZoneRepository();
  zoneRepo.save(cityZone);
  const pricingConfigRepo = new MemoryPricingConfigRepository();
  pricingConfigRepo.save(pricingConfig);
  const quoteUseCase = new CreateQuoteUseCase({
    serviceClassificationUseCase: new ServiceClassificationUseCase({
      resolveZonesUseCase: new ResolveZonesUseCase({ zoneRepo }),
    }),
    pricingConfigRepo,
    tokenSecret: QUOTE_SECRET,
    quoteTtlSeconds: 300,
  });

  const rideRepo = new MemoryRideRepository();
  const callRecords = new MemoryRideCallRepository();
  const walletRepo = new MemoryWalletRepository();
  await walletRepo.save({
    id: '018f0a00-0000-7000-8000-000000000301',
    driverId: DRIVER_ID,
    balancePaise: 250_000,
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const pushTokens = new MemoryPushTokenRepository();
  const expoSent: Array<Record<string, unknown>> = [];
  const pushService = new ExpoPushService(
    pushTokens,
    new MemoryPushReceiptRepository(),
    async (messages) => {
      expoSent.push(...messages);
      return messages.map((_, idx) => ({ status: 'ok' as const, id: `ticket-${idx}` }));
    },
  );

  const realGateway = new LiveKitVoiceGateway('', LK_API_KEY, LK_API_SECRET);
  const revokeAndClose = vi.fn(async () => {});
  const voiceProvider: RideVoiceProviderPort = {
    issueToken: (input) => realGateway.issueToken(input),
    revokeAndClose,
    listParticipantIds: opts.liveParticipantIds ?? (async () => []),
    verifyWebhook: (body, auth) => new WebhookReceiver(LK_API_KEY, LK_API_SECRET)
      .receive(body, auth)
      .then((e) => ({
        id: e.id,
        event: e.event,
        roomName: e.room?.name ?? '',
        participantId: e.participant?.identity ?? null,
      })),
  };

  const notifications: Array<{
    userId: string;
    event: 'incoming' | 'changed';
    call: unknown;
    callerName?: string | undefined;
  }> = [];
  const rides = buildRidesContainer({
    callsEnabled: opts.callsEnabled ?? true,
    providerUrl: 'wss://voice.test.local',
    callRecords,
    voiceProvider,
    consumeCallRateLimit: async () => opts.retryAfterSeconds ?? 0,
    isInstallationRegistered: (u, inst) => pushService.hasInstallation(u, inst),
    requireRegisteredInstallation: opts.requireRegisteredInstallation ?? false,
    getCallerDisplayName: async (_ride, role) => (role === 'DRIVER' ? 'Subrata Ghosh' : 'Subir Roy'),
    notifyCall: async (userId, event, call, callerName) => {
      notifications.push({ userId, event, call, callerName });
    },
    isCommunicationAccountActive: async (userId: string) => !inactiveUsers.has(userId),
    getUserIdForRider: async (r) => (r === RIDER_ID ? RIDER_USER : r === OTHER_RIDER_ID ? OTHER_RIDER_USER : null),
    getUserIdForDriver: async (d) => (d === DRIVER_ID ? DRIVER_USER : d === OTHER_DRIVER_ID ? OTHER_DRIVER_USER : null),
    requireDriverEligibility: async () => 'test-vehicle',
    unitOfWork,
    rideRepo,
    rideEventRepo: new MemoryRideEventRepository(),
    walletRepo,
    pricingConfigRepo,
    tokenSecret: QUOTE_SECRET,
    pickupOtpSecret: QUOTE_SECRET,
    resolveRiderId: async (u) => (u === RIDER_USER || u === OTHER_RIDER_USER ? profileIds[u]! : null),
    resolveDriverId: async (u) => (u === DRIVER_USER || u === OTHER_DRIVER_USER ? profileIds[u]! : null),
    resolveAssignedDriver: async (driverId, vehicleId) => ({
      driverId,
      name: 'Subrata Ghosh',
      phoneE164: '+919000000012',
      profilePhotoUrl: null,
      vehicle: {
        vehicleId: vehicleId ?? '018f0a00-0000-7000-8000-000000000401',
        make: 'Maruti',
        model: 'Dzire',
        color: 'White',
        registrationNumber: 'WB74AB1234',
        vehicleCategory: 'CAB',
      },
    }),
  });

  const dispatchOverride = {
    buildPushTokenRouter: ({ authenticate: authMw }: { authenticate: typeof authenticate }) =>
      buildPushTokenRouter({
        authenticate: authMw,
        registerPushToken: makeRegisterPushTokenController(pushService),
        unregisterPushToken: makeUnregisterPushTokenController(pushService),
      }),
    buildDispatchRouter: () => Router(),
    buildAdminDispatchRouter: () => Router(),
  };

  const app = createApp({
    identity,
    rides,
    dispatch: dispatchOverride as never,
  });

  async function login(userId: string, role: AuthRole, deviceId = 'inst-default-01') {
    const sessionId = crypto.randomUUID();
    await sessionRepo.save({
      id: sessionId,
      userId,
      deviceId,
      refreshTokenHash: 'h',
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    });
    return `Bearer ${await tokenAdapter.signAccessToken({ sub: userId, role, sessionId })}`;
  }

  const riderAuth = await login(RIDER_USER, 'RIDER', 'rider-inst-0001');
  const otherRiderAuth = await login(OTHER_RIDER_USER, 'RIDER', 'other-rider-inst');
  const driverAuth = await login(DRIVER_USER, 'DRIVER', 'driver-inst-0001');
  const otherDriverAuth = await login(OTHER_DRIVER_USER, 'DRIVER', 'other-drv-inst');
  const adminAuth = await login(ADMIN_USER, 'SUPPORT_ADMIN', 'admin-inst-0001');

  async function createAssignedRide() {
    const quote = await quoteUseCase.execute({
      pickup: { lat: 26.71, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      vehicleCategory: 'CAB',
      distanceM: 6000,
      durationSeconds: 900,
    });
    const res = await request(app)
      .post('/api/v1/rides')
      .set('Authorization', riderAuth)
      .send({
        quoteToken: quote.quoteToken,
        proposedFarePaise: quote.suggestedFarePaise,
        passenger: { name: 'Subir Roy', phoneE164: '+919876543210' },
        vehicleCategory: 'CAB',
        pickup: { lat: 26.71, lng: 88.42, address: 'Sevoke Road' },
        drop: { lat: 26.75, lng: 88.45, address: 'Hill Cart Road' },
      });
    const rideId = res.body.data.id as string;
    await request(app).post(`/api/v1/rides/${rideId}/accept`).set('Authorization', driverAuth).send({});
    return rideId;
  }

  return {
    app,
    rides,
    rideRepo,
    callRecords,
    pushService,
    expoSent,
    notifications,
    revokeAndClose,
    inactiveUsers,
    login,
    riderAuth,
    otherRiderAuth,
    driverAuth,
    otherDriverAuth,
    adminAuth,
    createAssignedRide,
  };
}

describe('Private ride calls API, credentials, push transports, and teardown', () => {
  it('runs participant start -> answer -> restricted token -> webhook connect -> end without exposing phone numbers', async () => {
    const s = await setup();
    const rideId = await s.createAssignedRide();
    const reqId = `call-req-${crypto.randomUUID()}`;

    const started = await request(s.app)
      .post(`/api/v1/rides/${rideId}/calls`)
      .set('Authorization', s.riderAuth)
      .send({ clientRequestId: reqId });
    expect(started.status).toBe(201);
    const callId = started.body.data.id as string;
    expect(started.body.data).toMatchObject({
      rideId,
      state: 'RINGING',
      callerRole: 'RIDER',
      connectedAt: null,
    });
    expect(JSON.stringify(started.body)).not.toContain('+919876543210');
    expect(JSON.stringify(started.body)).not.toContain('+919000000012');
    expect(s.notifications[0]).toMatchObject({
      userId: DRIVER_USER,
      event: 'incoming',
      callerName: 'Subir Roy',
    });
    expect(JSON.stringify(s.notifications)).not.toContain('+91');

    // Retry with same clientRequestId is idempotent and does not double-notify
    const retried = await request(s.app)
      .post(`/api/v1/rides/${rideId}/calls`)
      .set('Authorization', s.riderAuth)
      .send({ clientRequestId: reqId });
    expect(retried.body.data.id).toBe(callId);
    expect(s.notifications).toHaveLength(1);

    // Neither caller nor callee can mint a media token while RINGING (no pre-answer room/mic)
    for (const auth of [s.riderAuth, s.driverAuth]) {
      expect(
        (
          await request(s.app)
            .post(`/api/v1/rides/${rideId}/calls/${callId}/token`)
            .set('Authorization', auth)
            .send({})
        ).status,
      ).toBe(409);
    }

    // Callee answers, binding their session installationId
    const answered = await request(s.app)
      .post(`/api/v1/rides/${rideId}/calls/${callId}/answer`)
      .set('Authorization', s.driverAuth)
      .send({});
    expect(answered.status).toBe(200);
    expect(answered.body.data.state).toBe('ACCEPTED');
    expect(answered.body.data.connectedAt).toBeNull();

    // Both participants now get restricted audio-only tokens with opaque room/identity
    const callerTokenRes = await request(s.app)
      .post(`/api/v1/rides/${rideId}/calls/${callId}/token`)
      .set('Authorization', s.riderAuth)
      .send({});
    expect(callerTokenRes.status).toBe(200);
    const claims = decodeJwt(callerTokenRes.body.data.token) as {
      sub: string;
      exp: number;
      video: { room: string } & Record<string, unknown>;
    };
    expect(claims.sub).toMatch(/^p_[0-9a-f]{24}$/);
    expect(claims.video.room).toMatch(/^rc_[0-9a-f]{32}$/);
    expect(claims.video).toMatchObject({
      roomJoin: true,
      roomCreate: false,
      roomAdmin: false,
      roomRecord: false,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });

    const calleeTokenRes = await request(s.app)
      .post(`/api/v1/rides/${rideId}/calls/${callId}/token`)
      .set('Authorization', s.driverAuth)
      .send({});
    expect(calleeTokenRes.status).toBe(200);
    const calleeClaims = decodeJwt(calleeTokenRes.body.data.token) as { sub: string };

    // Invalid webhook signature is rejected
    const badWh = await request(s.app)
      .post('/api/v1/rides/calls/webhook')
      .set('Content-Type', 'application/webhook+json')
      .set('Authorization', 'Bearer tampered')
      .send(JSON.stringify({ id: 'ev-bad', event: 'participant_joined' }));
    expect(badWh.status).toBe(400);

    // First participant_joined keeps state ACCEPTED; second promotes CONNECTED
    const roomName = claims.video.room;
    const wh1 = await signLiveKitWebhook({
      id: 'ev-join-1',
      event: 'participant_joined',
      createdAt: Math.floor(Date.now() / 1000),
      room: { name: roomName },
      participant: { identity: claims.sub },
    });
    expect(
      (
        await request(s.app)
          .post('/api/v1/rides/calls/webhook')
          .set('Content-Type', 'application/webhook+json')
          .set('Authorization', wh1.auth)
          .send(wh1.body)
      ).status,
    ).toBe(200);
    const afterOneJoin = await request(s.app)
      .get(`/api/v1/rides/${rideId}/calls/current`)
      .set('Authorization', s.riderAuth);
    expect(afterOneJoin.body.data.call.state).toBe('ACCEPTED');

    const wh2 = await signLiveKitWebhook({
      id: 'ev-join-2',
      event: 'participant_joined',
      createdAt: Math.floor(Date.now() / 1000),
      room: { name: roomName },
      participant: { identity: calleeClaims.sub },
    });
    await request(s.app)
      .post('/api/v1/rides/calls/webhook')
      .set('Content-Type', 'application/webhook+json')
      .set('Authorization', wh2.auth)
      .send(wh2.body);
    const afterTwoJoins = await request(s.app)
      .get(`/api/v1/rides/${rideId}/calls/current`)
      .set('Authorization', s.driverAuth);
    expect(afterTwoJoins.body.data.call.state).toBe('CONNECTED');
    expect(afterTwoJoins.body.data.call.connectedAt).toEqual(expect.any(String));

    // Participant ends call -> revokes room & clears current active call
    const ended = await request(s.app)
      .post(`/api/v1/rides/${rideId}/calls/${callId}/end`)
      .set('Authorization', s.driverAuth)
      .send({});
    expect(ended.status).toBe(200);
    expect(ended.body.data.state).toBe('ENDED');
    expect(s.revokeAndClose).toHaveBeenCalledTimes(1);

    const currentAfterEnd = await request(s.app)
      .get(`/api/v1/rides/${rideId}/calls/current`)
      .set('Authorization', s.riderAuth);
    expect(currentAfterEnd.body.data.call).toBeNull();
  });

  it('denies strangers, admins, guest passengers, mismatched installations, suspended accounts, rate-limited callers, and disabled kill switch', async () => {
    const s = await setup({ requireRegisteredInstallation: true });
    const rideId = await s.createAssignedRide();

    // Unregistered installation blocked when requireRegisteredInstallation=true
    const unregistered = await request(s.app)
      .post(`/api/v1/rides/${rideId}/calls`)
      .set('Authorization', s.riderAuth)
      .send({ clientRequestId: `call-req-${crypto.randomUUID()}` });
    expect(unregistered.status).toBe(403);
    expect(unregistered.body.message).toContain('CALL_INSTALLATION_REQUIRED');

    // Register rider (EXPO) and a legacy native FCM_CALL driver token (accepted but ignored): only EXPO is sent
    expect(
      (
        await request(s.app)
          .post('/api/v1/push-token')
          .set('Authorization', s.riderAuth)
          .send({
            token: 'ExponentPushToken[rider-expo-1]',
            installationId: 'rider-inst-0001',
            platform: 'android',
            transport: 'EXPO',
          })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(s.app)
          .post('/api/v1/push-token')
          .set('Authorization', s.driverAuth)
          .send({
            token: 'fcm-raw-device-token-driver-00001',
            installationId: 'driver-inst-0001',
            platform: 'android',
            transport: 'FCM_CALL',
          })
      ).status,
    ).toBe(200);
    await s.pushService.notify([RIDER_USER, DRIVER_USER], {
      title: 'Incoming call',
      body: 'Private ride call',
      channelId: 'ride-calls',
    });
    expect(s.expoSent.map((m) => m.to)).toEqual(['ExponentPushToken[rider-expo-1]']);

    // Mismatched installationId in request body vs session.deviceId -> 403
    const mismatch = await request(s.app)
      .post(`/api/v1/rides/${rideId}/calls`)
      .set('Authorization', s.riderAuth)
      .send({
        installationId: 'spoofed-other-inst',
        clientRequestId: `call-req-${crypto.randomUUID()}`,
      });
    expect(mismatch.status).toBe(403);
    expect(mismatch.body.message).toContain('CALL_INSTALLATION_MISMATCH');

    // Strangers and admins get 404 (no existence leak, no admin bypass)
    for (const auth of [s.otherRiderAuth, s.otherDriverAuth, s.adminAuth]) {
      expect(
        (
          await request(s.app)
            .post(`/api/v1/rides/${rideId}/calls`)
            .set('Authorization', auth)
            .send({ clientRequestId: `call-req-${crypto.randomUUID()}` })
        ).status,
      ).toBe(404);
      expect(
        (await request(s.app).get(`/api/v1/rides/${rideId}/calls/current`).set('Authorization', auth))
          .status,
      ).toBe(404);
    }

    // Suspended account gets 403
    s.inactiveUsers.add(RIDER_USER);
    expect(
      (
        await request(s.app)
          .post(`/api/v1/rides/${rideId}/calls`)
          .set('Authorization', s.riderAuth)
          .send({ clientRequestId: `call-req-${crypto.randomUUID()}` })
      ).status,
    ).toBe(403);
    s.inactiveUsers.clear();

    // Rate limited -> 429 with Retry-After
    const limited = await setup({ retryAfterSeconds: 22 });
    const limitedRide = await limited.createAssignedRide();
    const rateRes = await request(limited.app)
      .post(`/api/v1/rides/${limitedRide}/calls`)
      .set('Authorization', limited.riderAuth)
      .send({ clientRequestId: `call-req-${crypto.randomUUID()}` });
    expect(rateRes.status).toBe(429);
    expect(rateRes.headers['retry-after']).toBe('22');

    // Kill switch -> 503
    const disabled = await setup({ callsEnabled: false });
    const disabledRide = await disabled.createAssignedRide();
    expect(
      (
        await request(disabled.app)
          .get(`/api/v1/rides/${disabledRide}/calls/current`)
          .set('Authorization', disabled.riderAuth)
      ).status,
    ).toBe(503);
  });

  it('tears down active calls immediately on ride cancellation, completion, and logout endCurrent', async () => {
    const s = await setup();
    const rideId = await s.createAssignedRide();

    // Start call #1, then cancel ride -> call ended + media revoked
    const c1 = await request(s.app)
      .post(`/api/v1/rides/${rideId}/calls`)
      .set('Authorization', s.driverAuth)
      .send({ clientRequestId: `call-req-${crypto.randomUUID()}` });
    expect(c1.status).toBe(201);

    const cancelled = await request(s.app)
      .post(`/api/v1/rides/${rideId}/cancel`)
      .set('Authorization', s.riderAuth)
      .send({ reason: 'RIDER_CHANGED_MIND' });
    expect(cancelled.status).toBe(200);
    expect(s.revokeAndClose).toHaveBeenCalledTimes(1);
    expect((await s.callRecords.findById(c1.body.data.id))?.endReason).toBe('ride_cancelled');

    // Closed ride rejects further call attempts with 409
    expect(
      (
        await request(s.app)
          .post(`/api/v1/rides/${rideId}/calls`)
          .set('Authorization', s.riderAuth)
          .send({ clientRequestId: `call-req-${crypto.randomUUID()}` })
      ).status,
    ).toBe(409);

    // Start call #2 on a second ride, test endCurrent (logout teardown) and ride completion teardown
    const ride2 = await s.createAssignedRide();
    const c2 = await request(s.app)
      .post(`/api/v1/rides/${ride2}/calls`)
      .set('Authorization', s.riderAuth)
      .send({ clientRequestId: `call-req-${crypto.randomUUID()}` });
    expect(c2.status).toBe(201);

    const endedByLogout = await request(s.app)
      .post('/api/v1/rides/calls/current/end')
      .set('Authorization', s.riderAuth)
      .send({});
    expect(endedByLogout.status).toBe(200);
    expect(endedByLogout.body.data.ended).toBe(true);
    expect(s.revokeAndClose).toHaveBeenCalledTimes(2);

    // Start call #3 on ride2 in TRIP_STARTED and complete ride -> tears down call
    const stored = (await s.rideRepo.findById(ride2))!;
    await s.rideRepo.save({
      ...stored,
      status: 'DRIVER_ARRIVED',
      passenger: {
        ...stored.passenger,
        pickupOtpHash: createHash('sha256').update('4321').digest('hex'),
      },
    });
    await request(s.app)
      .post(`/api/v1/rides/${ride2}/start`)
      .set('Authorization', s.driverAuth)
      .send({ otp: '4321' });
    const c3 = await request(s.app)
      .post(`/api/v1/rides/${ride2}/calls`)
      .set('Authorization', s.driverAuth)
      .send({ clientRequestId: `call-req-${crypto.randomUUID()}` });
    expect(c3.status).toBe(201);

    const completed = await request(s.app)
      .post(`/api/v1/rides/${ride2}/complete`)
      .set('Authorization', s.driverAuth)
      .send({});
    expect(completed.status).toBe(200);
    expect(s.revokeAndClose).toHaveBeenCalledTimes(3);
    expect((await s.callRecords.findById(c3.body.data.id))?.endReason).toBe('ride_completed');
  });
});
