import { validateGeometry, type GeoJsonPolygon } from '@cabzone/geo';
import { env } from '../config/env.js';
import {
  AdminUserModel,
  DriverApplicationModel,
  DriverModel,
  RiderModel,
  UserModel,
  VehicleModel,
} from '../modules/identity/infrastructure/persistence/index.js';
import { WalletModel } from '../modules/ledger/infrastructure/persistence/wallet.model.js';
import { PricingConfigModel } from '../modules/pricing/infrastructure/persistence/pricingConfig.model.js';
import { ZoneModel } from '../modules/zone/infrastructure/persistence/zone.model.js';
import { connectMongo, disconnectMongo } from '../shared/db/mongo.js';
import { newUuid } from '../shared/ids.js';
import { logger } from '../shared/logging/logger.js';

const isReset = process.argv.includes('--reset');

async function seed() {
  logger.info({ isReset, env: env.NODE_ENV }, 'Starting database seeding...');
  await connectMongo();

  if (isReset) {
    logger.info('Reset flag provided: clearing existing collections...');
    await Promise.all([
      UserModel.deleteMany({}),
      AdminUserModel.deleteMany({}),
      DriverModel.deleteMany({}),
      RiderModel.deleteMany({}),
      DriverApplicationModel.deleteMany({}),
      VehicleModel.deleteMany({}),
      ZoneModel.deleteMany({}),
      WalletModel.deleteMany({}),
      PricingConfigModel.deleteMany({}),
    ]);
    logger.info('Collections cleared successfully.');
  }

  const now = new Date();

  // 1. Seed Accounts
  logger.info('Seeding test accounts...');

  // 1a. Super Admin (+919000000001)
  const adminId = '01900000-0000-7000-8000-000000000001';
  await UserModel.findOneAndUpdate(
    { phone_e164: '+919000000001' },
    {
      $setOnInsert: { _id: adminId },
      $set: {
        phone_e164: '+919000000001',
        phone_verified_at: now,
        status: 'ACTIVE',
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  await AdminUserModel.findOneAndUpdate(
    { user_id: adminId },
    {
      $setOnInsert: { _id: newUuid() },
      $set: {
        user_id: adminId,
        role: 'SUPER_ADMIN',
        city_zone_ids: [],
        status: 'ACTIVE',
      },
    },
    { upsert: true, new: true },
  );

  // 1b. Verified Driver (+919000000002)
  const driverUserId = '01900000-0000-7000-8000-000000000002';
  await UserModel.findOneAndUpdate(
    { phone_e164: '+919000000002' },
    {
      $setOnInsert: { _id: driverUserId },
      $set: {
        phone_e164: '+919000000002',
        phone_verified_at: now,
        status: 'ACTIVE',
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  const driverProfileId = '01900000-0000-7000-8000-000000000020';
  const driverWalletId = '01900000-0000-7000-8000-000000000030';
  const driverVehicleId = '01900000-0000-7000-8000-000000000040';

  // Driver wallet pre-funded with 50,000 paise (₹500)
  await WalletModel.findOneAndUpdate(
    { driver_id: driverProfileId },
    {
      $setOnInsert: { _id: driverWalletId },
      $set: {
        driver_id: driverProfileId,
        balance_paise: 50_000,
        status: 'ACTIVE',
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  await DriverModel.findOneAndUpdate(
    { user_id: driverUserId },
    {
      $setOnInsert: { _id: driverProfileId },
      $set: {
        user_id: driverUserId,
        status: 'ACTIVE',
        kyc_status: 'VERIFIED',
        operational_status: 'OFFLINE',
        rating_average: 4.8,
        rating_count: 24,
        trust_score: 95,
        current_vehicle_id: driverVehicleId,
        wallet_id: driverWalletId,
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  await DriverApplicationModel.findOneAndUpdate(
    { driver_id: driverProfileId },
    {
      $setOnInsert: { _id: newUuid() },
      $set: {
        driver_id: driverProfileId,
        status: 'APPROVED',
        reapply_count: 0,
        submitted_at: now,
        reviewed_at: now,
        reviewer_admin_id: adminId,
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  await VehicleModel.findOneAndUpdate(
    { registration_number: 'WB74A1234' },
    {
      $setOnInsert: { _id: driverVehicleId },
      $set: {
        driver_id: driverProfileId,
        vehicle_type: 'CAB',
        make: 'Maruti Suzuki',
        model: 'Dzire',
        registration_number: 'WB74A1234',
        manufacture_year: 2022,
        verification_status: 'APPROVED',
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  // 1c. Complete Customer (+919000000003)
  const completeRiderUserId = '01900000-0000-7000-8000-000000000003';
  await UserModel.findOneAndUpdate(
    { phone_e164: '+919000000003' },
    {
      $setOnInsert: { _id: completeRiderUserId },
      $set: {
        phone_e164: '+919000000003',
        phone_verified_at: now,
        status: 'ACTIVE',
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  await RiderModel.findOneAndUpdate(
    { user_id: completeRiderUserId },
    {
      $setOnInsert: { _id: newUuid() },
      $set: {
        user_id: completeRiderUserId,
        name: 'Priya Mukherjee',
        rating_average: 4.9,
        rating_count: 12,
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  // 1d. Empty Customer (+919000000004 - phone only)
  const emptyRiderUserId = '01900000-0000-7000-8000-000000000004';
  await UserModel.findOneAndUpdate(
    { phone_e164: '+919000000004' },
    {
      $setOnInsert: { _id: emptyRiderUserId },
      $set: {
        phone_e164: '+919000000004',
        phone_verified_at: now,
        status: 'ACTIVE',
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  // 2. Seed Geographic Zones
  logger.info('Validating and seeding geographic zones...');

  // Siliguri City Boundary
  const siliguriPolygon: GeoJsonPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [88.39, 26.68],
        [88.47, 26.68],
        [88.47, 26.76],
        [88.39, 26.76],
        [88.39, 26.68],
      ],
    ],
  };

  // Darjeeling Hill Territory
  const darjeelingPolygon: GeoJsonPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [88.23, 27.01],
        [88.31, 27.01],
        [88.31, 27.08],
        [88.23, 27.08],
        [88.23, 27.01],
      ],
    ],
  };

  // Kalimpong Hill Territory
  const kalimpongPolygon: GeoJsonPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [88.44, 27.04],
        [88.52, 27.04],
        [88.52, 27.11],
        [88.44, 27.11],
        [88.44, 27.04],
      ],
    ],
  };

  // Siliguri Central (Free Pickup)
  const slgCentralPolygon: GeoJsonPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [88.41, 26.70],
        [88.45, 26.70],
        [88.45, 26.74],
        [88.41, 26.74],
        [88.41, 26.70],
      ],
    ],
  };

  // Siliguri North (Paid Pickup)
  const slgNorthPolygon: GeoJsonPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [88.41, 26.74],
        [88.46, 26.74],
        [88.46, 26.76],
        [88.41, 26.76],
        [88.41, 26.74],
      ],
    ],
  };

  // Sukna Military Restricted Area (Exclusion Veto)
  const suknaRestrictedPolygon: GeoJsonPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [88.36, 26.77],
        [88.40, 26.77],
        [88.40, 26.81],
        [88.36, 26.81],
        [88.36, 26.77],
      ],
    ],
  };

  const zonesToSeed = [
    { name: 'Siliguri City', code: 'SILIGURI', type: 'CITY' as const, poly: siliguriPolygon, parent: null, buffer: 20_000 },
    { name: 'Darjeeling Hill Territory', code: 'HILL_DARJ', type: 'CITY' as const, poly: darjeelingPolygon, parent: null, buffer: 15_000 },
    { name: 'Kalimpong Hill Territory', code: 'HILL_KALIM', type: 'CITY' as const, poly: kalimpongPolygon, parent: null, buffer: 15_000 },
    { name: 'Sukna Restricted Area', code: 'SUKNA_RESTRICTED', type: 'EXCLUSION' as const, poly: suknaRestrictedPolygon, parent: null, buffer: null },
  ];

  const cityMap = new Map<string, string>();

  for (const z of zonesToSeed) {
    const val = validateGeometry(z.poly);
    if (!val.valid) {
      throw new Error(`Seed polygon invalid for ${z.code}: ${val.violations[0]?.message}`);
    }

    const doc = await ZoneModel.findOneAndUpdate(
      { code: z.code },
      {
        $setOnInsert: { _id: newUuid() },
        $set: {
          name: z.name,
          code: z.code,
          zone_type: z.type,
          parent_city_zone_id: z.parent,
          state_code: 'WB',
          geometry: z.poly,
          boundary: z.poly,
          buffer_distance_m: z.buffer,
          status: 'ACTIVE',
          version: 1,
        },
      },
      { upsert: true, new: true },
    );
    cityMap.set(z.code, doc._id);
  }

  const siliguriCityId = cityMap.get('SILIGURI')!;

  const pickupZones = [
    { name: 'Siliguri Central Coverage', code: 'SLG_CENTRAL', poly: slgCentralPolygon, parent: siliguriCityId },
    { name: 'Siliguri North Coverage', code: 'SLG_NORTH', poly: slgNorthPolygon, parent: siliguriCityId },
  ];

  for (const p of pickupZones) {
    const val = validateGeometry(p.poly);
    if (!val.valid) {
      throw new Error(`Seed polygon invalid for ${p.code}: ${val.violations[0]?.message}`);
    }

    await ZoneModel.findOneAndUpdate(
      { code: p.code },
      {
        $setOnInsert: { _id: newUuid() },
        $set: {
          name: p.name,
          code: p.code,
          zone_type: 'PICKUP',
          parent_city_zone_id: p.parent,
          state_code: 'WB',
          geometry: p.poly,
          boundary: p.poly,
          buffer_distance_m: null,
          status: 'ACTIVE',
          version: 1,
        },
      },
      { upsert: true, new: true },
    );
  }

  // 3. Seed Pricing Configuration for Siliguri City
  logger.info('Seeding default city pricing config...');
  await PricingConfigModel.findOneAndUpdate(
    { city_zone_id: siliguriCityId, vehicle_type: 'CAB' },
    {
      $setOnInsert: { _id: newUuid() },
      $set: {
        city_zone_id: siliguriCityId,
        version: 1,
        vehicle_type: 'CAB',
        base_fare_paise: 5000, // ₹50
        rate_per_km_paise: 1500, // ₹15 / km
        minimum_fare_paise: 8000, // ₹80 min
        included_distance_m: 2000, // 2 km included
        buffer_surcharge_paise: 2000, // ₹20 buffer surcharge
        negotiation_floor_percent: 80,
        negotiation_ceiling_percent: 150,
        negotiation_window_seconds: 90,
        commission_percent: 8,
        status: 'ACTIVE',
        effective_from: new Date('2026-01-01'),
        effective_to: null,
        created_by_admin_id: adminId,
      },
    },
    { upsert: true, new: true },
  );

  logger.info('Database seeding completed successfully.');
  await disconnectMongo();
}

seed().catch(async (err) => {
  logger.error({ err }, 'Database seeding failed.');
  await disconnectMongo();
  process.exit(1);
});
