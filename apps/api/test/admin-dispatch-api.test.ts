import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AuthRole } from '@cabzone/contracts';
import { createApp } from '../src/app.js';
import { JoseTokenAdapter } from '../src/modules/identity/infrastructure/index.js';
import type { SessionEntity, SessionRepositoryPort } from '../src/modules/identity/domain/index.js';
import type { IdentityContainer } from '../src/modules/identity/identity.container.js';
import {
  makeAuthenticate,
  makeRequireZoneAccess,
  requireRole,
} from '../src/modules/identity/interface/middlewares/index.js';
import { MemoryWalletRepository } from '../src/modules/ledger/index.js';
import { MemoryRideRepository } from '../src/modules/rides/index.js';
import { MemoryPresenceRepository } from '../src/modules/dispatch/infrastructure/memoryPresence.repository.js';
import { buildDispatchContainer } from '../src/modules/dispatch/dispatch.container.js';

const JWT_SECRET = 'this-is-a-super-secret-key-that-is-at-least-32-chars-long!';
const ADMIN_USER = '018f0a00-0000-7000-8000-0000000000c1';
const RIDER_USER = '018f0a00-0000-7000-8000-0000000000a1';

class FakeSessionRepo implements SessionRepositoryPort {
  private readonly sessions = new Map<string, SessionEntity>();
  async create(s: SessionEntity): Promise<SessionEntity> {
    this.sessions.set(s.id, s);
    return s;
  }
  async findById(id: string): Promise<SessionEntity | null> {
    return this.sessions.get(id) ?? null;
  }
  async revoke(): Promise<void> {}
  async revokeAllForUser(): Promise<void> {}
}

async function buildTestEnv() {
  const sessionRepo = new FakeSessionRepo();
  const tokens = new JoseTokenAdapter({
    accessSecret: JWT_SECRET,
    refreshSecret: JWT_SECRET,
    accessExpiresIn: '1h',
    refreshExpiresIn: '30d',
  });

  const makeToken = async (userId: string, role: AuthRole) => {
    const session: SessionEntity = {
      id: `sess-${userId}`,
      userId,
      deviceId: 'test-device',
      refreshTokenHash: 'hash',
      expiresAt: new Date(Date.now() + 3600_000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    };
    await sessionRepo.create(session);
    return tokens.signAccessToken({ sub: userId, sessionId: session.id, role });
  };

  const authenticate = makeAuthenticate({ tokenVerifier: tokens, sessionRepo });
  const identity = {
    buildAuthRouter: () => Router(),
    buildDriverRouter: () => Router(),
    buildAdminDriverRouter: () => Router(),
    authenticate,
    requireRole,
    requireAdminScope: () => requireRole('SUPER_ADMIN'),
    requireZoneAccess: makeRequireZoneAccess({ adminRepo: { findByUserId: async () => null } }),
  };

  const rideRepo = new MemoryRideRepository();
  const walletRepo = new MemoryWalletRepository();
  const presence = new MemoryPresenceRepository();

  const mockPublisher = {
    publish: () => {},
    sendToDriver: () => {},
    sendToRider: () => {},
    sendToRide: () => {},
  };

  const dispatch = buildDispatchContainer({
    presence,
    publisher: mockPublisher,
    rideRepo,
    walletRepo,
    lookups: {
      getDriverProfileByUserId: async () => null,
      getUserIdForRider: async () => null,
      getUserIdForDriver: async () => null,
      getDriverInfo: async (driverId) => {
        if (driverId === 'sim-driver-1') {
          return {
            name: 'Rahul Sharma',
            phoneE164: '+919800111222',
            registrationNumber: 'WB 74 AK 1024',
          };
        }
        return null;
      },
    },
  });

  const emptyRouter = () => Router();
  const app = createApp({
    health: { buildRouter: emptyRouter },
    identity: identity as unknown as IdentityContainer,
    zone: { buildAdminZoneRouter: emptyRouter, buildZoneRouter: emptyRouter } as any,
    routing: { buildAdminRoutingRouter: emptyRouter, buildRoutingRouter: emptyRouter } as any,
    pricing: { buildAdminPricingRouter: emptyRouter, buildPricingRouter: emptyRouter } as any,
    ledger: { buildAdminWalletRouter: emptyRouter, buildDriverWalletRouter: emptyRouter, walletRepo } as any,
    rides: { buildRidesRouter: emptyRouter } as any,
    dispatch,
  });

  return { app, makeToken, presence, rideRepo, simulateFleet: dispatch.simulateFleetUseCase };
}

describe('Admin Dispatch & Fleet Radar API', () => {
  it('protects /v1/admin/dispatch/fleet against unauthenticated and rider calls', async () => {
    const { app, makeToken } = await buildTestEnv();

    const noAuth = await request(app).get('/api/v1/admin/dispatch/fleet');
    expect(noAuth.status).toBe(401);

    const riderToken = await makeToken(RIDER_USER, 'RIDER');
    const riderRes = await request(app)
      .get('/api/v1/admin/dispatch/fleet')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(riderRes.status).toBe(403);
  });

  it('allows admins to simulate fleet in Siliguri and inspect live fleet radar', async () => {
    const { app, makeToken, rideRepo, simulateFleet } = await buildTestEnv();
    const adminToken = await makeToken(ADMIN_USER, 'SUPER_ADMIN');

    // 1. Initial fleet is empty
    const resEmpty = await request(app)
      .get('/api/v1/admin/dispatch/fleet')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resEmpty.status).toBe(200);
    expect(resEmpty.body.data).toEqual([]);

    // 2. Simulate fleet in Siliguri
    const simRes = await request(app)
      .post('/api/v1/admin/dispatch/simulate-fleet')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true });
    expect(simRes.status).toBe(404);
    const simulated = await simulateFleet.execute({ enabled: true });
    expect(simulated.simulated).toBe(true);
    expect(simulated.count).toBe(6);

    // 3. Inspect fleet
    const fleetRes = await request(app)
      .get('/api/v1/admin/dispatch/fleet')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(fleetRes.status).toBe(200);
    expect(fleetRes.body.data.length).toBe(6);

    const rahul = fleetRes.body.data.find((d: any) => d.driverId === 'sim-driver-1');
    expect(rahul).toBeDefined();
    expect(rahul.driverName).toBe('Rahul Sharma');
    expect(rahul.vehicleCategory).toBe('CAB');
    expect(rahul.status).toBe('ONLINE');
    expect(rahul.activeRideId).toBeNull();
    expect(rahul.lat).toBeCloseTo(26.7271);
    expect(rahul.lng).toBeCloseTo(88.4230);

    // 4. Vehicle category filter
    const cabsRes = await request(app)
      .get('/api/v1/admin/dispatch/fleet?vehicleCategory=CAB')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(cabsRes.status).toBe(200);
    expect(cabsRes.body.data.every((d: any) => d.vehicleCategory === 'CAB')).toBe(true);

    // 5. Active ride busy reflection
    await rideRepo.save({
      id: 'ride-test-active-1',
      bookerRiderId: 'rider-1',
      passenger: { riderId: 'rider-1', name: 'Test Passenger', phoneE164: '+919999999999' },
      driverId: 'sim-driver-1',
      vehicleCategory: 'CAB',
      pickup: { lat: 26.72, lng: 88.42, address: 'Siliguri' },
      drop: { lat: 26.73, lng: 88.43, address: 'Junction' },
      routeSnapshot: { distanceM: 2000, durationSeconds: 300 },
      zoneSnapshot: { classification: 'INTRA_CITY' },
      suggestedFarePaise: 15000,
      proposedFarePaise: 15000,
      agreedFarePaise: 15000,
      status: 'DRIVER_EN_ROUTE',
      cancellationReason: null,
      acceptedAt: new Date(),
      arrivedAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const fleetAfterRide = await request(app)
      .get('/api/v1/admin/dispatch/fleet')
      .set('Authorization', `Bearer ${adminToken}`);
    const rahulBusy = fleetAfterRide.body.data.find((d: any) => d.driverId === 'sim-driver-1');
    expect(rahulBusy.status).toBe('BUSY');
    expect(rahulBusy.activeRideId).toBe('ride-test-active-1');

    // 6. Clear simulation
    const clearRes = await request(app)
      .post('/api/v1/admin/dispatch/simulate-fleet')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: false });
    expect(clearRes.status).toBe(404);
    const cleared = await simulateFleet.execute({ enabled: false });
    expect(cleared.simulated).toBe(false);

    const emptyAgain = await request(app)
      .get('/api/v1/admin/dispatch/fleet')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(emptyAgain.body.data).toEqual([]);
  });
});
