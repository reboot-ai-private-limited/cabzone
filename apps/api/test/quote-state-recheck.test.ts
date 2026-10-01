import { describe, expect, it } from 'vitest';
import {
  CreateQuoteUseCase,
  MemoryPricingConfigRepository,
  type PricingConfigEntity,
} from '../src/modules/pricing/index.js';
import { CreateRideUseCase, MemoryRideRepository } from '../src/modules/rides/index.js';
import {
  AssertServiceableUseCase,
  ImportStateBoundariesUseCase,
  ManageStateUseCase,
  MemoryStateBoundaryRepository,
  ResolveStateForPointUseCase,
  VerifyQuoteStateUseCase,
} from '../src/modules/stateBoundary/index.js';
import {
  MemoryZoneRepository,
  ResolveZonesUseCase,
  ServiceClassificationUseCase,
  type ZoneEntity,
} from '../src/modules/zone/index.js';

const SECRET = 'super-secret-test-token-key-for-quotes-32-chars';

const cityZone: ZoneEntity = {
  id: '018f0a00-0000-7000-8000-000000000001',
  name: 'Siliguri City',
  zoneType: 'CITY',
  parentCityZoneId: null,
  stateCode: 'WB',
  boundary: {
    type: 'Polygon',
    coordinates: [[[88.4, 26.7], [88.5, 26.7], [88.5, 26.8], [88.4, 26.8], [88.4, 26.7]]],
  },
  bufferDistanceM: 1_000,
  status: 'ACTIVE',
  currentPricingConfigId: '018f0a00-0000-7000-8000-000000000010',
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const pricing: PricingConfigEntity = {
  id: '018f0a00-0000-7000-8000-000000000010',
  cityZoneId: cityZone.id,
  version: 1,
  vehicleType: 'CAB',
  baseFarePaise: 5000,
  ratePerKmPaise: 1500,
  minimumFarePaise: 8000,
  includedDistanceM: 2000,
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

const PICKUP = { lat: 26.72, lng: 88.42 };
const DROP = { lat: 27.2, lng: 88.9 }; // ~50 km out, still inside the WB square below

async function setup() {
  const stateRepo = new MemoryStateBoundaryRepository();
  await new ImportStateBoundariesUseCase(stateRepo).execute({
    source: 'TEST',
    sourceVersion: null,
    features: [
      {
        properties: { stateCode: 'WB', stateName: 'West Bengal' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[87, 25], [90, 25], [90, 28], [87, 28], [87, 25]]],
        },
      },
    ],
  });

  const zoneRepo = new MemoryZoneRepository();
  zoneRepo.save(cityZone);
  const pricingConfigRepo = new MemoryPricingConfigRepository();
  pricingConfigRepo.save(pricing);

  const guard = new AssertServiceableUseCase(new ResolveStateForPointUseCase(stateRepo));
  const quotes = new CreateQuoteUseCase({
    serviceClassificationUseCase: new ServiceClassificationUseCase({
      serviceabilityGuard: guard,
      resolveZonesUseCase: new ResolveZonesUseCase({ zoneRepo }),
    }),
    pricingConfigRepo,
    tokenSecret: SECRET,
  });
  const rides = new CreateRideUseCase({
    rideRepo: new MemoryRideRepository(),
    pricingConfigRepo,
    tokenSecret: SECRET,
    quoteStateVerifier: new VerifyQuoteStateUseCase(stateRepo),
  });

  const quote = await quotes.execute({ pickup: PICKUP, drop: DROP, vehicleCategory: 'CAB' });
  const book = () =>
    rides.execute({
      quoteToken: quote.quoteToken,
      proposedFarePaise: quote.suggestedFarePaise,
      riderId: '018f0a00-0000-7000-8000-000000000101',
      passengerName: 'Jane Rider',
      passengerPhoneE164: '+919876543210',
      pickup: PICKUP,
      drop: DROP,
      vehicleCategory: 'CAB',
    });

  return { stateRepo, manage: new ManageStateUseCase(stateRepo), quote, book };
}

describe('ride creation re-checks the quote state against current settings', () => {
  it('snapshots the state on the quote and accepts an unchanged state', async () => {
    const { quote, book } = await setup();
    expect(quote).toMatchObject({ routeScope: 'INTRA_STATE', destinationStateCode: 'WB' });
    await expect(book()).resolves.toMatchObject({
      zoneSnapshot: { routeScope: 'INTRA_STATE', destinationStateCode: 'WB' },
    });
  });

  it('rejects when the destination state was disabled after the quote', async () => {
    const { manage, book } = await setup();
    await manage.setStatus('WB', 1, 'INACTIVE');
    await expect(book()).rejects.toThrow(/DESTINATION_NOT_SERVICEABLE/);
  });

  it('rejects when the matching serviceability flag was switched off after the quote', async () => {
    const { manage, book } = await setup();
    await manage.update({ stateCode: 'WB', expectedVersion: 1, intrastateEnabled: false });
    await expect(book()).rejects.toThrow(/INTRASTATE_SERVICE_DISABLED/);
  });

  it('does not invalidate the quote for an unrelated edit', async () => {
    const { manage, book } = await setup();
    await manage.update({ stateCode: 'WB', expectedVersion: 1, stateName: 'West Bengal (WB)' });
    await expect(book()).resolves.toBeDefined();
  });

  it('a concurrent edit with a stale version is a conflict, not a lost update', async () => {
    const { manage } = await setup();
    const results = await Promise.allSettled([
      manage.update({ stateCode: 'WB', expectedVersion: 1, intrastateEnabled: false }),
      manage.update({ stateCode: 'WB', expectedVersion: 1, interstateDropOffEnabled: false }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});
