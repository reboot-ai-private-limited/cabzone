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
import { hashPassword } from '../shared/auth/password.util.js';
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
        name: 'Super Admin',
        email: 'admin@cabzone.internal',
        password_hash: hashPassword('admin123'),
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

  // 1c. Seed Diverse Realistic Customer Profiles
  logger.info('Seeding customer accounts...');
  const customersToSeed = [
    {
      userId: '01900000-0000-7000-8000-000000000003',
      phone: '+919000000003',
      name: 'Priya Mukherjee',
      email: 'priya.mukherjee@example.com',
      preferredLanguage: 'Bengali',
      emergencyContact: { name: 'Amit Mukherjee', phone_e164: '+919830987654' },
      ratingAverage: 4.9,
      ratingCount: 28,
      status: 'ACTIVE' as const,
    },
    {
      userId: '01900000-0000-7000-8000-000000000004',
      phone: '+919000000004',
      name: 'Rahul Sharma',
      email: 'rahul.sharma@example.com',
      preferredLanguage: 'Hindi',
      emergencyContact: { name: 'Neha Sharma', phone_e164: '+919874561231' },
      ratingAverage: 4.8,
      ratingCount: 19,
      status: 'ACTIVE' as const,
    },
    {
      userId: '01900000-0000-7000-8000-000000000005',
      phone: '+919000000005',
      name: 'Ananya Sen',
      email: 'ananya.sen@example.com',
      preferredLanguage: 'English',
      emergencyContact: { name: 'Subhash Sen', phone_e164: '+919800112234' },
      ratingAverage: 5.0,
      ratingCount: 14,
      status: 'ACTIVE' as const,
    },
    {
      userId: '01900000-0000-7000-8000-000000000006',
      phone: '+919000000006',
      name: 'Vikram Roy',
      email: 'vikram.roy@example.com',
      preferredLanguage: 'English',
      emergencyContact: { name: 'Rupa Roy', phone_e164: '+919434055668' },
      ratingAverage: 4.3,
      ratingCount: 42,
      status: 'ACTIVE' as const,
    },
    {
      userId: '01900000-0000-7000-8000-000000000007',
      phone: '+919000000007',
      name: 'Sneha Patel',
      email: 'sneha.patel@example.com',
      preferredLanguage: 'Hindi',
      emergencyContact: { name: 'Rajesh Patel', phone_e164: '+919733099882' },
      ratingAverage: 4.7,
      ratingCount: 9,
      status: 'ACTIVE' as const,
    },
    {
      userId: '01900000-0000-7000-8000-000000000008',
      phone: '+919000000008',
      name: 'Amit Das',
      email: 'amit.das@example.com',
      preferredLanguage: 'Bengali',
      emergencyContact: { name: 'Priya Das', phone_e164: '+919832044557' },
      ratingAverage: 3.6,
      ratingCount: 22,
      status: 'SUSPENDED' as const,
    },
    {
      userId: '01900000-0000-7000-8000-000000000009',
      phone: '+919000000009',
      name: 'Neha Agarwal',
      email: 'neha.agarwal@example.com',
      preferredLanguage: 'English',
      emergencyContact: { name: 'Vivek Agarwal', phone_e164: '+919641077890' },
      ratingAverage: 4.9,
      ratingCount: 31,
      status: 'ACTIVE' as const,
    },
    {
      userId: '01900000-0000-7000-8000-000000000010',
      phone: '+919000000010',
      name: 'Debashis Paul',
      email: 'debashis.paul@example.com',
      preferredLanguage: 'Bengali',
      emergencyContact: null,
      ratingAverage: null,
      ratingCount: 0,
      status: 'ACTIVE' as const,
    },
  ];

  for (const c of customersToSeed) {
    await UserModel.findOneAndUpdate(
      { phone_e164: c.phone },
      {
        $setOnInsert: { _id: c.userId },
        $set: {
          phone_e164: c.phone,
          phone_verified_at: now,
          status: c.status,
          version: 1,
        },
      },
      { upsert: true, new: true },
    );

    await RiderModel.findOneAndUpdate(
      { user_id: c.userId },
      {
        $setOnInsert: { _id: newUuid() },
        $set: {
          user_id: c.userId,
          name: c.name,
          email: c.email,
          preferred_language: c.preferredLanguage,
          emergency_contact: c.emergencyContact,
          rating_average: c.ratingAverage,
          rating_count: c.ratingCount,
          version: 1,
        },
      },
      { upsert: true, new: true },
    );
  }

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

  const zonesToSeed = [
    { name: 'Siliguri City', code: 'SILIGURI', type: 'CITY' as const, poly: siliguriPolygon, parent: null, buffer: 20_000 },
    { name: 'Darjeeling Hill Territory', code: 'HILL_DARJ', type: 'CITY' as const, poly: darjeelingPolygon, parent: null, buffer: 15_000 },
    { name: 'Kalimpong Hill Territory', code: 'HILL_KALIM', type: 'CITY' as const, poly: kalimpongPolygon, parent: null, buffer: 15_000 },
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

  // 3. Seed Pricing Configurations (Global, State-level WB & SK, and City-level Siliguri)
  logger.info('Seeding Global, State, and City pricing configs...');

  // 3a. Global Default Pricing
  await PricingConfigModel.findOneAndUpdate(
    { level: 'GLOBAL', vehicle_type: 'CAB' },
    {
      $setOnInsert: { _id: newUuid() },
      $set: {
        level: 'GLOBAL',
        city_zone_id: null,
        state_code: null,
        state_name: null,
        version: 1,
        vehicle_type: 'CAB',
        base_fare_paise: 4000, // ₹40
        rate_per_km_paise: 1400, // ₹14 / km
        minimum_fare_paise: 6000, // ₹60 min
        outstation_base_fare_paise: 6000, // ₹60
        outstation_rate_per_km_paise: 1800, // ₹18 / km
        outstation_minimum_fare_paise: 12000, // ₹120 min
        buffer_surcharge_paise: 2000,
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

  // 3b. State-level Pricing: West Bengal (WB)
  await PricingConfigModel.findOneAndUpdate(
    { level: 'STATE', state_code: 'WB', vehicle_type: 'CAB' },
    {
      $setOnInsert: { _id: newUuid() },
      $set: {
        level: 'STATE',
        city_zone_id: null,
        state_code: 'WB',
        state_name: 'West Bengal',
        version: 1,
        vehicle_type: 'CAB',
        base_fare_paise: 4500, // ₹45
        rate_per_km_paise: 1500, // ₹15 / km
        minimum_fare_paise: 7000, // ₹70 min
        outstation_base_fare_paise: 7000, // ₹70
        outstation_rate_per_km_paise: 1900, // ₹19 / km
        outstation_minimum_fare_paise: 14000, // ₹140 min
        buffer_surcharge_paise: 2000,
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

  // 3c. State-level Pricing: Sikkim (SK) - Mountain Terrain Rates
  await PricingConfigModel.findOneAndUpdate(
    { level: 'STATE', state_code: 'SK', vehicle_type: 'CAB' },
    {
      $setOnInsert: { _id: newUuid() },
      $set: {
        level: 'STATE',
        city_zone_id: null,
        state_code: 'SK',
        state_name: 'Sikkim',
        version: 1,
        vehicle_type: 'CAB',
        base_fare_paise: 8000, // ₹80
        rate_per_km_paise: 2500, // ₹25 / km
        minimum_fare_paise: 12000, // ₹120 min
        outstation_base_fare_paise: 10000, // ₹100
        outstation_rate_per_km_paise: 2800, // ₹28 / km
        outstation_minimum_fare_paise: 20000, // ₹200 min
        buffer_surcharge_paise: 3000,
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

  // 3d. City-level Pricing: Siliguri City Zone
  await PricingConfigModel.findOneAndUpdate(
    { city_zone_id: siliguriCityId, vehicle_type: 'CAB' },
    {
      $setOnInsert: { _id: newUuid() },
      $set: {
        level: 'CITY',
        city_zone_id: siliguriCityId,
        state_code: 'WB',
        state_name: 'West Bengal',
        version: 1,
        vehicle_type: 'CAB',
        base_fare_paise: 5000, // ₹50
        rate_per_km_paise: 1500, // ₹15 / km
        minimum_fare_paise: 8000, // ₹80 min
        outstation_base_fare_paise: 7500, // ₹75
        outstation_rate_per_km_paise: 2000, // ₹20 / km
        outstation_minimum_fare_paise: 15000, // ₹150 min
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
