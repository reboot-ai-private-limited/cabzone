import { validateGeometry, type GeoJsonPolygon } from '@cabzone/geo';
import { env } from '../config/env.js';
import {
  AdminUserModel,
  DriverApplicationModel,
  DriverDocumentModel,
  DriverModel,
  RiderModel,
  UserModel,
  VehicleModel,
} from '../modules/identity/infrastructure/persistence/index.js';
import { WalletModel } from '../modules/ledger/infrastructure/persistence/wallet.model.js';
import { WalletTransactionModel } from '../modules/ledger/infrastructure/persistence/walletTransaction.model.js';
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
      DriverDocumentModel.deleteMany({}),
      VehicleModel.deleteMany({}),
      ZoneModel.deleteMany({}),
      WalletModel.deleteMany({}),
      WalletTransactionModel.deleteMany({}),
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

  // Dev Driver wallet matching screenshot: owes ₹275 (-27,500 paise balance)
  await WalletModel.findOneAndUpdate(
    { driver_id: driverProfileId },
    {
      $setOnInsert: { _id: driverWalletId },
      $set: {
        driver_id: driverProfileId,
        balance_paise: -27_500,
        owed_paise: 27_500,
        status: 'ACTIVE',
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  // Seed 6 realistic ledger transactions for Dev Driver (Total credits = ₹1,150, last entry 03 Oct 2026)
  const devDriverTx = [
    {
      id: '01900000-0000-7000-8000-000000000051',
      type: 'CREDIT' as const,
      amountPaise: 50_000, // ₹500 initial float
      refType: 'WALLET_RECHARGE' as const,
      before: 0,
      after: 50_000,
      note: 'Initial float deposit',
      date: new Date('2026-09-28T09:00:00Z'),
    },
    {
      id: '01900000-0000-7000-8000-000000000052',
      type: 'CREDIT' as const,
      amountPaise: 35_000, // ₹350 ride fare credit
      refType: 'WALLET_RECHARGE' as const,
      before: 50_000,
      after: 85_000,
      note: 'Trip fare credit #RIDE-8101',
      date: new Date('2026-09-29T14:30:00Z'),
    },
    {
      id: '01900000-0000-7000-8000-000000000053',
      type: 'DEBIT' as const,
      amountPaise: 4_000, // ₹40 platform commission
      refType: 'RIDE_COMMISSION' as const,
      before: 85_000,
      after: 81_000,
      note: 'Platform commission 8% #RIDE-8101',
      date: new Date('2026-09-29T14:31:00Z'),
    },
    {
      id: '01900000-0000-7000-8000-000000000054',
      type: 'CREDIT' as const,
      amountPaise: 30_000, // ₹300 ride fare credit
      refType: 'WALLET_RECHARGE' as const,
      before: 81_000,
      after: 111_000,
      note: 'Trip fare credit #RIDE-8102',
      date: new Date('2026-10-01T11:15:00Z'),
    },
    {
      id: '01900000-0000-7000-8000-000000000055',
      type: 'DEBIT' as const,
      amountPaise: 3_500, // ₹35 platform commission
      refType: 'RIDE_COMMISSION' as const,
      before: 111_000,
      after: 107_500,
      note: 'Platform commission 8% #RIDE-8102',
      date: new Date('2026-10-01T11:16:00Z'),
    },
    {
      id: '01900000-0000-7000-8000-000000000056',
      type: 'DEBIT' as const,
      amountPaise: 135_000, // ₹1,350 platform arrears levy
      refType: 'ADMIN_ADJUSTMENT' as const,
      before: 107_500,
      after: -27_500,
      note: 'Platform equipment & monthly terminal maintenance charge',
      date: new Date('2026-10-03T10:00:00Z'),
    },
  ];

  for (const tx of devDriverTx) {
    await WalletTransactionModel.findOneAndUpdate(
      { _id: tx.id },
      {
        $setOnInsert: { _id: tx.id },
        $set: {
          wallet_id: driverWalletId,
          owner_type: 'DRIVER',
          driver_id: driverProfileId,
          rider_id: null,
          type: tx.type,
          amount_paise: tx.amountPaise,
          reference_type: tx.refType,
          reference_id: `REF_${tx.id.slice(-6)}`,
          idempotency_key: `seed_${tx.id}`,
          balance_before_paise: tx.before,
          balance_after_paise: tx.after,
          created_by: adminId,
          note: tx.note,
          created_at: tx.date,
          updated_at: tx.date,
        },
      },
      { upsert: true, new: true },
    );
  }

  await DriverModel.findOneAndUpdate(
    { user_id: driverUserId },
    {
      $setOnInsert: { _id: driverProfileId },
      $set: {
        user_id: driverUserId,
        name: 'Dev Driver',
        alternate_phone: '+919000000020',
        gender: 'MALE',
        date_of_birth: '1998-07-12',
        experience: '5 years',
        emergency_contact: '+919830011223',
        address: 'Siliguri Junction',
        dl_number: 'WB7420190045123',
        dl_expiry: '2039-08-14',
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

  // Driver 2: Subrata Ghosh (+919000000012) - owes ₹145 (-14,500 paise)
  const d2UserId = '01900000-0000-7000-8000-000000000012';
  const d2ProfileId = '01900000-0000-7000-8000-000000000022';
  const d2WalletId = '01900000-0000-7000-8000-000000000032';
  const d2VehicleId = '01900000-0000-7000-8000-000000000042';

  await UserModel.findOneAndUpdate(
    { phone_e164: '+919000000012' },
    {
      $setOnInsert: { _id: d2UserId },
      $set: { phone_e164: '+919000000012', phone_verified_at: now, status: 'ACTIVE', version: 1 },
    },
    { upsert: true, new: true },
  );

  await WalletModel.findOneAndUpdate(
    { driver_id: d2ProfileId },
    {
      $setOnInsert: { _id: d2WalletId },
      $set: {
        driver_id: d2ProfileId,
        balance_paise: -14_500,
        owed_paise: 14_500,
        status: 'ACTIVE',
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  await WalletTransactionModel.findOneAndUpdate(
    { _id: '01900000-0000-7000-8000-000000000061' },
    {
      $setOnInsert: { _id: '01900000-0000-7000-8000-000000000061' },
      $set: {
        wallet_id: d2WalletId,
        owner_type: 'DRIVER',
        driver_id: d2ProfileId,
        rider_id: null,
        type: 'CREDIT',
        amount_paise: 30_000,
        reference_type: 'WALLET_RECHARGE',
        reference_id: 'REF_D2_01',
        idempotency_key: 'seed_d2_01',
        balance_before_paise: 0,
        balance_after_paise: 30_000,
        created_by: adminId,
        note: 'Trip credit',
        created_at: new Date('2026-10-02T09:00:00Z'),
        updated_at: new Date('2026-10-02T09:00:00Z'),
      },
    },
    { upsert: true, new: true },
  );

  await WalletTransactionModel.findOneAndUpdate(
    { _id: '01900000-0000-7000-8000-000000000062' },
    {
      $setOnInsert: { _id: '01900000-0000-7000-8000-000000000062' },
      $set: {
        wallet_id: d2WalletId,
        owner_type: 'DRIVER',
        driver_id: d2ProfileId,
        rider_id: null,
        type: 'DEBIT',
        amount_paise: 44_500,
        reference_type: 'ADMIN_ADJUSTMENT',
        reference_id: 'REF_D2_02',
        idempotency_key: 'seed_d2_02',
        balance_before_paise: 30_000,
        balance_after_paise: -14_500,
        created_by: adminId,
        note: 'Arrears debit',
        created_at: new Date('2026-10-02T09:05:00Z'),
        updated_at: new Date('2026-10-02T09:05:00Z'),
      },
    },
    { upsert: true, new: true },
  );

  await DriverModel.findOneAndUpdate(
    { user_id: d2UserId },
    {
      $setOnInsert: { _id: d2ProfileId },
      $set: {
        user_id: d2UserId,
        status: 'ACTIVE',
        kyc_status: 'VERIFIED',
        operational_status: 'OFFLINE',
        rating_average: 4.6,
        rating_count: 18,
        trust_score: 90,
        current_vehicle_id: d2VehicleId,
        wallet_id: d2WalletId,
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  await VehicleModel.findOneAndUpdate(
    { registration_number: 'WB74A5678' },
    {
      $setOnInsert: { _id: d2VehicleId },
      $set: {
        driver_id: d2ProfileId,
        vehicle_type: 'CAB',
        make: 'Hyundai',
        model: 'Aura',
        registration_number: 'WB74A5678',
        manufacture_year: 2023,
        verification_status: 'APPROVED',
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  // Driver 3: Rajesh Barman (+919000000013) - owes ₹100 (-10,000 paise)
  // Total owed: 275 + 145 + 100 = ₹520 across 3 drivers
  const d3UserId = '01900000-0000-7000-8000-000000000013';
  const d3ProfileId = '01900000-0000-7000-8000-000000000023';
  const d3WalletId = '01900000-0000-7000-8000-000000000033';
  const d3VehicleId = '01900000-0000-7000-8000-000000000043';

  await UserModel.findOneAndUpdate(
    { phone_e164: '+919000000013' },
    {
      $setOnInsert: { _id: d3UserId },
      $set: { phone_e164: '+919000000013', phone_verified_at: now, status: 'ACTIVE', version: 1 },
    },
    { upsert: true, new: true },
  );

  await WalletModel.findOneAndUpdate(
    { driver_id: d3ProfileId },
    {
      $setOnInsert: { _id: d3WalletId },
      $set: {
        driver_id: d3ProfileId,
        balance_paise: -10_000,
        owed_paise: 10_000,
        status: 'ACTIVE',
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  await WalletTransactionModel.findOneAndUpdate(
    { _id: '01900000-0000-7000-8000-000000000071' },
    {
      $setOnInsert: { _id: '01900000-0000-7000-8000-000000000071' },
      $set: {
        wallet_id: d3WalletId,
        owner_type: 'DRIVER',
        driver_id: d3ProfileId,
        rider_id: null,
        type: 'CREDIT',
        amount_paise: 20_000,
        reference_type: 'WALLET_RECHARGE',
        reference_id: 'REF_D3_01',
        idempotency_key: 'seed_d3_01',
        balance_before_paise: 0,
        balance_after_paise: 20_000,
        created_by: adminId,
        note: 'Trip credit',
        created_at: new Date('2026-10-01T08:00:00Z'),
        updated_at: new Date('2026-10-01T08:00:00Z'),
      },
    },
    { upsert: true, new: true },
  );

  await WalletTransactionModel.findOneAndUpdate(
    { _id: '01900000-0000-7000-8000-000000000072' },
    {
      $setOnInsert: { _id: '01900000-0000-7000-8000-000000000072' },
      $set: {
        wallet_id: d3WalletId,
        owner_type: 'DRIVER',
        driver_id: d3ProfileId,
        rider_id: null,
        type: 'DEBIT',
        amount_paise: 30_000,
        reference_type: 'ADMIN_ADJUSTMENT',
        reference_id: 'REF_D3_02',
        idempotency_key: 'seed_d3_02',
        balance_before_paise: 20_000,
        balance_after_paise: -10_000,
        created_by: adminId,
        note: 'Arrears debit',
        created_at: new Date('2026-10-01T08:05:00Z'),
        updated_at: new Date('2026-10-01T08:05:00Z'),
      },
    },
    { upsert: true, new: true },
  );

  await DriverModel.findOneAndUpdate(
    { user_id: d3UserId },
    {
      $setOnInsert: { _id: d3ProfileId },
      $set: {
        user_id: d3UserId,
        status: 'ACTIVE',
        kyc_status: 'VERIFIED',
        operational_status: 'OFFLINE',
        rating_average: 4.7,
        rating_count: 12,
        trust_score: 92,
        current_vehicle_id: d3VehicleId,
        wallet_id: d3WalletId,
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  await VehicleModel.findOneAndUpdate(
    { registration_number: 'WB74A9012' },
    {
      $setOnInsert: { _id: d3VehicleId },
      $set: {
        driver_id: d3ProfileId,
        vehicle_type: 'CAB',
        make: 'Tata',
        model: 'Tigor',
        registration_number: 'WB74A9012',
        manufacture_year: 2023,
        verification_status: 'APPROVED',
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  // Driver 2 Application
  await DriverApplicationModel.findOneAndUpdate(
    { driver_id: d2ProfileId },
    {
      $setOnInsert: { _id: '01900000-0000-7000-8000-000000000052' },
      $set: {
        driver_id: d2ProfileId,
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

  // Driver 3 Application
  await DriverApplicationModel.findOneAndUpdate(
    { driver_id: d3ProfileId },
    {
      $setOnInsert: { _id: '01900000-0000-7000-8000-000000000053' },
      $set: {
        driver_id: d3ProfileId,
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

  // Driver 4: Manik Saha (+918695501644) - matching screenshot uploaded_media_1791207132664.png
  const d4UserId = '01900000-0000-7000-8000-000000000014';
  const d4ProfileId = '6ab96e995d7d1a4a18ba071c';
  const d4WalletId = '01900000-0000-7000-8000-000000000034';
  const d4VehicleId = '01900000-0000-7000-8000-000000000044';
  const d4AppId = '6ab96e995d7d1a4a18ba071c';

  await UserModel.findOneAndUpdate(
    { phone_e164: '+918695501644' },
    {
      $setOnInsert: { _id: d4UserId },
      $set: { phone_e164: '+918695501644', phone_verified_at: now, status: 'ACTIVE', version: 1 },
    },
    { upsert: true, new: true },
  );

  await WalletModel.findOneAndUpdate(
    { driver_id: d4ProfileId },
    {
      $setOnInsert: { _id: d4WalletId },
      $set: {
        driver_id: d4ProfileId,
        balance_paise: 25_000,
        owed_paise: 0,
        status: 'ACTIVE',
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  await DriverModel.findOneAndUpdate(
    { user_id: d4UserId },
    {
      $setOnInsert: { _id: d4ProfileId },
      $set: {
        user_id: d4UserId,
        name: 'Manik Saha',
        alternate_phone: '+918918194829',
        gender: 'MALE',
        date_of_birth: '2001-05-04',
        experience: '3 years',
        emergency_contact: null,
        address: 'Dabgram',
        dl_number: 'WB7320230015028',
        dl_expiry: '2041-05-03',
        status: 'ACTIVE',
        kyc_status: 'VERIFIED',
        operational_status: 'ONLINE',
        rating_average: 4.9,
        rating_count: 22,
        trust_score: 98,
        current_vehicle_id: d4VehicleId,
        wallet_id: d4WalletId,
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  await DriverApplicationModel.findOneAndUpdate(
    { _id: d4AppId },
    {
      $setOnInsert: { _id: d4AppId },
      $set: {
        driver_id: d4ProfileId,
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
    { registration_number: 'WB73A5521' },
    {
      $setOnInsert: { _id: d4VehicleId },
      $set: {
        driver_id: d4ProfileId,
        vehicle_type: 'CAB',
        make: 'Maruti Suzuki',
        model: 'WagonR',
        registration_number: 'WB73A5521',
        manufacture_year: 2023,
        verification_status: 'APPROVED',
        version: 1,
      },
    },
    { upsert: true, new: true },
  );

  await WalletTransactionModel.findOneAndUpdate(
    { _id: '01900000-0000-7000-8000-000000000081' },
    {
      $setOnInsert: { _id: '01900000-0000-7000-8000-000000000081' },
      $set: {
        wallet_id: d4WalletId,
        owner_type: 'DRIVER',
        driver_id: d4ProfileId,
        rider_id: null,
        type: 'CREDIT',
        amount_paise: 45_000,
        reference_type: 'RIDE_COMMISSION',
        reference_id: 'REF_MS_01',
        idempotency_key: 'seed_ms_01',
        balance_before_paise: 0,
        balance_after_paise: 45_000,
        created_by: adminId,
        note: 'Trip payout - Dabgram to Junction',
        created_at: new Date('2026-10-04T10:00:00Z'),
        updated_at: new Date('2026-10-04T10:00:00Z'),
      },
    },
    { upsert: true, new: true },
  );

  await WalletTransactionModel.findOneAndUpdate(
    { _id: '01900000-0000-7000-8000-000000000082' },
    {
      $setOnInsert: { _id: '01900000-0000-7000-8000-000000000082' },
      $set: {
        wallet_id: d4WalletId,
        owner_type: 'DRIVER',
        driver_id: d4ProfileId,
        rider_id: null,
        type: 'DEBIT',
        amount_paise: 20_000,
        reference_type: 'ADMIN_ADJUSTMENT',
        reference_id: 'REF_MS_02',
        idempotency_key: 'seed_ms_02',
        balance_before_paise: 45_000,
        balance_after_paise: 25_000,
        created_by: adminId,
        note: 'Platform fee deduction',
        created_at: new Date('2026-10-04T11:30:00Z'),
        updated_at: new Date('2026-10-04T11:30:00Z'),
      },
    },
    { upsert: true, new: true },
  );

  await DriverDocumentModel.findOneAndUpdate(
    { _id: '01900000-0000-7000-8000-000000000091' },
    {
      $setOnInsert: { _id: '01900000-0000-7000-8000-000000000091' },
      $set: {
        driver_id: d4ProfileId,
        application_id: d4AppId,
        type: 'DRIVING_LICENSE',
        storage_key: 'driver-docs/manik/dl.pdf',
        document_hash: 'sha256-mock-hash-dl',
        document_number_masked: 'WB7320230015028',
        issued_at: new Date('2021-05-04'),
        expires_at: new Date('2041-05-03'),
        verification_status: 'VERIFIED',
        verified_at: now,
      },
    },
    { upsert: true, new: true },
  );

  await DriverDocumentModel.findOneAndUpdate(
    { _id: '01900000-0000-7000-8000-000000000092' },
    {
      $setOnInsert: { _id: '01900000-0000-7000-8000-000000000092' },
      $set: {
        driver_id: d4ProfileId,
        application_id: d4AppId,
        type: 'VEHICLE_RC',
        storage_key: 'driver-docs/manik/rc.pdf',
        document_hash: 'sha256-mock-hash-rc',
        document_number_masked: 'WB73A5521',
        issued_at: new Date('2023-01-15'),
        expires_at: new Date('2038-01-14'),
        verification_status: 'VERIFIED',
        verified_at: now,
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
      spendableCreditPaise: 0,
      owedAmountPaise: 0,
    },
    // Inspiration Screenshot Reference: Unnamed customer with ₹100 owed fee
    {
      userId: '01900000-0000-7000-8000-000000000011',
      phone: '+918509299342',
      name: null,
      email: null,
      preferredLanguage: 'English',
      emergencyContact: null,
      ratingAverage: null,
      ratingCount: 0,
      status: 'ACTIVE' as const,
      spendableCreditPaise: 0,
      owedAmountPaise: 10000, // ₹100 unpaid cancellation fee
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

    const riderDoc = await RiderModel.findOneAndUpdate(
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
