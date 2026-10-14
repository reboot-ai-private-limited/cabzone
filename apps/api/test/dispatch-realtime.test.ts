import type { AddressInfo } from 'node:net';
import { Router } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { AuthRole, VehicleCategory } from '@cabzone/contracts';
import { createApp } from '../src/app.js';
import { buildDispatchContainer } from '../src/modules/dispatch/dispatch.container.js';
import { MemoryPresenceRepository } from '../src/modules/dispatch/infrastructure/memoryPresence.repository.js';
import { JoseTokenAdapter } from '../src/modules/identity/infrastructure/index.js';
import type { SessionEntity, SessionRepositoryPort } from '../src/modules/identity/domain/index.js';
import type { IdentityContainer } from '../src/modules/identity/identity.container.js';
import {
  makeAuthenticate,
  makeRequireZoneAccess,
  makeTokenVerifier,
  requireRole,
} from '../src/modules/identity/interface/middlewares/index.js';
import { MemoryWalletRepository } from '../src/modules/ledger/index.js';
import { buildLedgerContainer } from '../src/modules/ledger/ledger.container.js';
import {
  CreateQuoteUseCase,
  MemoryPricingConfigRepository,
  type PricingConfigEntity,
} from '../src/modules/pricing/index.js';
import { MemoryRideEventRepository, MemoryRideRepository } from '../src/modules/rides/index.js';
import { buildRidesContainer } from '../src/modules/rides/rides.container.js';
import {
  MemoryZoneRepository,
  ResolveZonesUseCase,
  ServiceClassificationUseCase,
  type ZoneEntity,
} from '../src/modules/zone/index.js';
import { RealtimeHub } from '../src/shared/realtime/index.js';

const JWT_SECRET = 'this-is-a-super-secret-key-that-is-at-least-32-chars-long!';
const QUOTE_SECRET = 'test-token-secret-for-quote-signature-32';
const CITY_ZONE_ID = '018f0a00-0000-7000-8000-000000000001';
const CONFIG_ID = '018f0a00-0000-7000-8000-000000000010';

const id = (n: number) => `018f0a00-0000-7000-8000-${String(n).padStart(12, '0')}`;

interface DriverFixture {
  userId: string;
  driverId: string;
  category: VehicleCategory;
  balancePaise: number;
  lat: number;
  lng: number;
  eligible?: boolean;
}

const RIDER_USER = id(0xa1);
const RIDER_ID = id(0x201);
const drivers: Record<string, DriverFixture> = {
  near: { userId: id(0xb1), driverId: id(0x101), category: 'CAB', balancePaise: 250_000, lat: 26.712, lng: 88.421 },
  broke: { userId: id(0xb2), driverId: id(0x102), category: 'CAB', balancePaise: 0, lat: 26.713, lng: 88.421 },
  far: { userId: id(0xb3), driverId: id(0x103), category: 'CAB', balancePaise: 250_000, lat: 27.5, lng: 88.4 },
  rickshaw: { userId: id(0xb4), driverId: id(0x104), category: 'E_RICKSHAW', balancePaise: 250_000, lat: 26.712, lng: 88.422 },
  pending: { userId: id(0xb5), driverId: id(0x105), category: 'CAB', balancePaise: 250_000, lat: 26.712, lng: 88.42, eligible: false },
};

const cityZone: ZoneEntity = {
  id: CITY_ZONE_ID,
  name: 'Siliguri City',
  zoneType: 'CITY',
  parentCityZoneId: null,
  stateCode: 'WB',
  boundary: {
    type: 'Polygon',
    coordinates: [
      [
        [88.4, 26.7],
        [88.5, 26.7],
        [88.5, 26.8],
        [88.4, 26.8],
        [88.4, 26.7],
      ],
    ],
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
  createdByAdminId: id(0x99),
  createdAt: new Date(),
};

class MemorySessionRepository implements SessionRepositoryPort {
  private readonly sessions = new Map<string, SessionEntity>();
  async findById(sessionId: string) {
    return this.sessions.get(sessionId) ?? null;
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
  async revoke() {}
  async revokeAllForUser() {}
}

const pickup = { lat: 26.71, lng: 88.42 };
const drop = { lat: 26.75, lng: 88.45 };

/** Collects every frame a socket receives and lets a test await a specific event. */
class WsProbe {
  readonly messages: Array<{ event: string; data: Record<string, unknown> }> = [];
  private constructor(readonly ws: WebSocket) {
    ws.on('message', (raw) => this.messages.push(JSON.parse(raw.toString())));
  }

  static async connect(url: string, token: string): Promise<WsProbe> {
    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } });
    const probe = new WsProbe(ws);
    await probe.waitFor('connection.ready');
    return probe;
  }

  async waitFor(event: string, timeoutMs = 1500): Promise<Record<string, unknown>> {
    const started = Date.now();
    for (;;) {
      const hit = this.messages.find((m) => m.event === event);
      if (hit) return hit.data;
      if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${event}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  /** Give the server a moment, then assert the event never arrived. */
  async expectNone(event: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 150));
    expect(this.messages.map((m) => m.event)).not.toContain(event);
  }

  count(event: string): number {
    return this.messages.filter((m) => m.event === event).length;
  }
}

const openSockets: WebSocket[] = [];
const openServers: Array<{ close: () => void }> = [];
afterEach(() => {
  openSockets.splice(0).forEach((s) => s.terminate());
  openServers.splice(0).forEach((s) => s.close());
});

async function setup() {
  const sessionRepo = new MemorySessionRepository();
  const tokenAdapter = new JoseTokenAdapter(JWT_SECRET);
  const verifyToken = makeTokenVerifier({ tokenVerifier: tokenAdapter, sessionRepo });
  const identity: IdentityContainer = {
    requireAdminScope: () => requireRole('SUPER_ADMIN'),
    buildAuthRouter: () => Router(),
    buildDriverRouter: () => Router(),
    buildAdminDriverRouter: () => Router(),
    authenticate: makeAuthenticate({ tokenVerifier: tokenAdapter, sessionRepo }),
    verifyToken,
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
  const walletRepo = new MemoryWalletRepository();
  for (const d of Object.values(drivers)) {
    await walletRepo.save({
      id: id(0x300 + Number(d.driverId.slice(-3))),
      driverId: d.driverId,
      balancePaise: d.balancePaise,
      status: 'ACTIVE',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const byUser = new Map(Object.values(drivers).map((d) => [d.userId, d]));
  const byDriver = new Map(Object.values(drivers).map((d) => [d.driverId, d]));
  const hub = new RealtimeHub();
  const dispatch = buildDispatchContainer({
    presence: new MemoryPresenceRepository(),
    publisher: hub,
    rideRepo,
    walletRepo,
    lookups: {
      getDriverProfileByUserId: async (userId) => {
        const d = byUser.get(userId);
        if (!d) return null;
        return {
          driverId: d.driverId,
          userId: d.userId,
          eligibleToGoOnline: d.eligible !== false,
          ineligibleReason: d.eligible === false ? 'Driver account is PENDING' : undefined,
          vehicleCategory: d.category,
        };
      },
      getUserIdForRider: async (riderId) => (riderId === RIDER_ID ? RIDER_USER : null),
      getUserIdForDriver: async (driverId) => byDriver.get(driverId)?.userId ?? null,
    },
  });
  const rides = buildRidesContainer({
    requireDriverEligibility: async () => 'test-vehicle',
    unitOfWork,
    rideRepo,
    rideEventRepo: new MemoryRideEventRepository(),
    walletRepo,
    pricingConfigRepo,
    tokenSecret: QUOTE_SECRET,
    resolveRiderId: async (u) => (u === RIDER_USER ? RIDER_ID : null),
    resolveDriverId: async (u) => byUser.get(u)?.driverId ?? null,
    notifier: dispatch.notifier,
    pickupOtpSecret: 'otp-secret-for-tests',
  });
  const ledger = buildLedgerContainer({
    unitOfWork,
    walletRepo,
    resolveDriverId: async (u) => byUser.get(u)?.driverId ?? null,
  });

  const app = createApp({ identity, rides, dispatch, ledger });
  const server = app.listen(0);
  hub.attach(server, verifyToken);
  openServers.push({
    close: () => {
      hub.close();
      server.close();
    },
  });
  const wsUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;

  async function login(userId: string, role: AuthRole) {
    const sessionId = crypto.randomUUID();
    await sessionRepo.save({
      id: sessionId,
      userId,
      deviceId: 'dev',
      refreshTokenHash: 'h',
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    });
    return tokenAdapter.signAccessToken({ sub: userId, role, sessionId });
  }

  async function listen(token: string) {
    const probe = await WsProbe.connect(wsUrl, token);
    openSockets.push(probe.ws);
    return probe;
  }

  const bearer = (t: string) => `Bearer ${t}`;
  const riderToken = await login(RIDER_USER, 'RIDER');
  const tokens: Record<string, string> = {};
  for (const [name, d] of Object.entries(drivers)) tokens[name] = await login(d.userId, 'DRIVER');

  async function goOnline(name: string) {
    const d = drivers[name]!;
    return request(app)
      .post('/api/v1/driver/status')
      .set('Authorization', bearer(tokens[name]!))
      .send({ status: 'ONLINE', lat: d.lat, lng: d.lng });
  }

  async function requestRide() {
    const quote = await quoteUseCase.execute({
      pickup,
      drop,
      vehicleCategory: 'CAB',
      distanceM: 6000,
      durationSeconds: 900,
    });
    return request(app)
      .post('/api/v1/rides')
      .set('Authorization', bearer(riderToken))
      .send({
        quoteToken: quote.quoteToken,
        proposedFarePaise: quote.suggestedFarePaise,
        passenger: { name: 'Subir Roy', phoneE164: '+919876543210' },
        vehicleCategory: 'CAB',
        pickup,
        drop,
      });
  }

  return {
    app,
    wsUrl,
    rideRepo,
    rides,
    tokens,
    riderToken,
    bearer,
    listen,
    goOnline,
    requestRide,
  };
}

describe('Realtime gateway', () => {
  it('rejects unauthenticated WebSocket upgrades', async () => {
    const s = await setup();
    const outcome = await new Promise<string>((resolve) => {
      const ws = new WebSocket(s.wsUrl);
      ws.on('open', () => resolve('open'));
      ws.on('unexpected-response', (_req, res) => resolve(`http-${res.statusCode}`));
      ws.on('error', () => resolve('error'));
    });
    expect(['http-401', 'error']).toContain(outcome);
  });

  it('accepts a token via query string and answers ping', async () => {
    const s = await setup();
    const ws = new WebSocket(`${s.wsUrl}?access_token=${s.riderToken}`);
    openSockets.push(ws);
    const frames: string[] = [];
    ws.on('message', (raw) => frames.push(JSON.parse(raw.toString()).event));
    await new Promise((r) => ws.on('open', r));
    ws.send(JSON.stringify({ event: 'ping' }));
    await new Promise((r) => setTimeout(r, 100));
    expect(frames).toEqual(['connection.ready', 'pong']);
  });
});

describe('Driver presence', () => {
  it('needs a location to go online, and refuses ineligible drivers', async () => {
    const s = await setup();
    const noLoc = await request(s.app)
      .post('/api/v1/driver/status')
      .set('Authorization', s.bearer(s.tokens['near']!))
      .send({ status: 'ONLINE' });
    expect(noLoc.status).toBe(400);

    expect((await s.goOnline('pending')).status).toBe(403);
    expect((await s.goOnline('near')).status).toBe(200);
  });

  it('rejects location pings while offline', async () => {
    const s = await setup();
    const res = await request(s.app)
      .post('/api/v1/driver/location')
      .set('Authorization', s.bearer(s.tokens['near']!))
      .send({ lat: 26.7, lng: 88.4 });
    expect(res.status).toBe(409);
  });
});

describe('Dispatch: offers', () => {
  it('pushes the offer only to nearby, eligible, matching-category drivers', async () => {
    const s = await setup();
    for (const name of ['near', 'broke', 'far', 'rickshaw']) await s.goOnline(name);
    const probes = {
      near: await s.listen(s.tokens['near']!),
      broke: await s.listen(s.tokens['broke']!),
      far: await s.listen(s.tokens['far']!),
      rickshaw: await s.listen(s.tokens['rickshaw']!),
    };

    const created = await s.requestRide();
    expect(created.status).toBe(201);

    const offer = await probes.near.waitFor('ride.offer.created');
    expect(offer).toMatchObject({
      rideId: created.body.data.id,
      vehicleCategory: 'CAB',
      proposedFarePaise: created.body.data.proposedFarePaise,
    });
    expect(offer['distanceToPickupM']).toBeLessThan(1000);

    await probes.broke.expectNone('ride.offer.created'); // zero wallet
    await probes.far.expectNone('ride.offer.created'); // out of radius
    await probes.rickshaw.expectNone('ride.offer.created'); // wrong category
  });

  it('lists open offers by distance for resync, and hides them once claimed', async () => {
    const s = await setup();
    await s.goOnline('near');
    const empty = await request(s.app)
      .get('/api/v1/driver/offers')
      .set('Authorization', s.bearer(s.tokens['near']!));
    expect(empty.body.data).toEqual([]);

    const rideId = (await s.requestRide()).body.data.id as string;
    const listed = await request(s.app)
      .get('/api/v1/driver/offers')
      .set('Authorization', s.bearer(s.tokens['near']!));
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].rideId).toBe(rideId);

    await request(s.app)
      .post(`/api/v1/rides/${rideId}/accept`)
      .set('Authorization', s.bearer(s.tokens['near']!));
    const after = await request(s.app)
      .get('/api/v1/driver/offers')
      .set('Authorization', s.bearer(s.tokens['near']!));
    expect(after.body.data).toEqual([]);
  });

  it('offline drivers get no offers', async () => {
    const s = await setup();
    await s.goOnline('near');
    await request(s.app)
      .post('/api/v1/driver/status')
      .set('Authorization', s.bearer(s.tokens['near']!))
      .send({ status: 'OFFLINE' });
    await s.requestRide();
    const res = await request(s.app)
      .get('/api/v1/driver/offers')
      .set('Authorization', s.bearer(s.tokens['near']!));
    expect(res.body.data).toEqual([]);
  });
});

describe('Dispatch: full trip with realtime', () => {
  it('assigns, delivers the OTP to the rider only, and completes using that OTP', async () => {
    const s = await setup();
    await s.goOnline('near');
    const driverWs = await s.listen(s.tokens['near']!);
    const riderWs = await s.listen(s.riderToken);

    const rideId = (await s.requestRide()).body.data.id as string;
    await driverWs.waitFor('ride.offer.created');

    const accept = await request(s.app)
      .post(`/api/v1/rides/${rideId}/accept`)
      .set('Authorization', s.bearer(s.tokens['near']!));
    expect(accept.status).toBe(200);

    const toRider = await riderWs.waitFor('ride.driver.assigned');
    const toDriver = await driverWs.waitFor('ride.driver.assigned');
    expect(toRider).toMatchObject({ rideId, status: 'DRIVER_ASSIGNED', driverId: drivers['near']!.driverId });
    expect(toRider['pickupOtp']).toMatch(/^\d{4}$/);
    expect(toDriver).not.toHaveProperty('pickupOtp');
    expect(JSON.stringify(accept.body)).not.toContain(String(toRider['pickupOtp']));

    // The rider can also fetch the OTP after a reconnect; a driver never can.
    const riderView = await request(s.app)
      .get(`/api/v1/rides/${rideId}`)
      .set('Authorization', s.bearer(s.riderToken));
    expect(riderView.body.data.pickupOtp).toBe(toRider['pickupOtp']);
    const driverView = await request(s.app)
      .get(`/api/v1/rides/${rideId}`)
      .set('Authorization', s.bearer(s.tokens['near']!));
    expect(driverView.body.data).not.toHaveProperty('pickupOtp');

    const drive = (path: string, body: object = {}) =>
      request(s.app)
        .post(`/api/v1/rides/${rideId}/${path}`)
        .set('Authorization', s.bearer(s.tokens['near']!))
        .send(body);

    await drive('en-route');
    expect((await riderWs.waitFor('ride.driver.en_route'))['status']).toBe('DRIVER_EN_ROUTE');
    await drive('arrived');
    await riderWs.waitFor('ride.driver.arrived');

    // Driver location streams to the rider during the ride.
    const ping = await request(s.app)
      .post('/api/v1/driver/location')
      .set('Authorization', s.bearer(s.tokens['near']!))
      .send({ lat: 26.7105, lng: 88.4202, heading: 90, speedMps: 5 });
    expect(ping.status).toBe(200);
    expect(await riderWs.waitFor('driver.location.updated')).toMatchObject({
      rideId,
      lat: 26.7105,
      heading: 90,
    });

    // Wrong OTP fails, the real one starts the trip.
    expect((await drive('start', { otp: '0000' })).status).toBe(400);
    const started = await drive('start', { otp: String(toRider['pickupOtp']) });
    expect(started.status).toBe(200);
    await riderWs.waitFor('ride.started');

    const done = await drive('complete');
    expect(done.status).toBe(200);
    const completed = await riderWs.waitFor('ride.completed');
    expect(completed['farePaise']).toBeGreaterThan(0);
    expect(Number(completed['rideVersion'])).toBeGreaterThan(Number(toRider['rideVersion']));
  });

  it('a busy driver stops receiving new offers', async () => {
    const s = await setup();
    await s.goOnline('near');
    const first = (await s.requestRide()).body.data.id as string;
    await request(s.app)
      .post(`/api/v1/rides/${first}/accept`)
      .set('Authorization', s.bearer(s.tokens['near']!));

    const probe = await s.listen(s.tokens['near']!);
    await s.requestRide();
    await probe.expectNone('ride.offer.created');
  });

  it('cancelling notifies the other party', async () => {
    const s = await setup();
    await s.goOnline('near');
    const riderWs = await s.listen(s.riderToken);
    const driverWs = await s.listen(s.tokens['near']!);
    const rideId = (await s.requestRide()).body.data.id as string;
    await request(s.app)
      .post(`/api/v1/rides/${rideId}/accept`)
      .set('Authorization', s.bearer(s.tokens['near']!));

    await request(s.app)
      .post(`/api/v1/rides/${rideId}/cancel`)
      .set('Authorization', s.bearer(s.riderToken))
      .send({ reason: 'RIDER_CHANGED_MIND' });

    expect((await driverWs.waitFor('ride.cancelled'))['status']).toBe('CANCELLED');
    expect((await riderWs.waitFor('ride.cancelled'))['rideId']).toBe(rideId);
  });
});

describe('Dispatch: offer expiry', () => {
  it('expires stale offers, tells the rider, and blocks late acceptance', async () => {
    const s = await setup();
    await s.goOnline('near');
    const riderWs = await s.listen(s.riderToken);
    const rideId = (await s.requestRide()).body.data.id as string;

    const stored = (await s.rideRepo.findById(rideId))!;
    await s.rideRepo.save({ ...stored, offeringExpiresAt: new Date(Date.now() - 1000) });

    // Even before the sweep runs, an expired offer cannot be accepted.
    const late = await request(s.app)
      .post(`/api/v1/rides/${rideId}/accept`)
      .set('Authorization', s.bearer(s.tokens['near']!));
    expect(late.status).toBe(409);
    expect(late.body.message ?? JSON.stringify(late.body)).toContain('OFFER_EXPIRED');

    const expired = await s.rides.expireOffersUseCase.execute();
    expect(expired.map((r) => r.id)).toEqual([rideId]);
    expect((await riderWs.waitFor('ride.offer.expired'))['status']).toBe('EXPIRED');
    expect((await s.rideRepo.findById(rideId))!.status).toBe('EXPIRED');

    // Idempotent: nothing left to expire.
    expect(await s.rides.expireOffersUseCase.execute()).toEqual([]);
  });

  it('does not expire a ride that was claimed in time', async () => {
    const s = await setup();
    await s.goOnline('near');
    const rideId = (await s.requestRide()).body.data.id as string;
    await request(s.app)
      .post(`/api/v1/rides/${rideId}/accept`)
      .set('Authorization', s.bearer(s.tokens['near']!));
    const stored = (await s.rideRepo.findById(rideId))!;
    await s.rideRepo.save({ ...stored, offeringExpiresAt: new Date(Date.now() - 1000) });

    expect(await s.rides.expireOffersUseCase.execute()).toEqual([]);
    expect((await s.rideRepo.findById(rideId))!.status).toBe('DRIVER_ASSIGNED');
  });
});

import { unitOfWork } from './helpers/unitOfWork.js';
