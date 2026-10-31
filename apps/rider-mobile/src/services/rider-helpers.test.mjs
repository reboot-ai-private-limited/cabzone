import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const contractsRidesCode = ts.transpileModule(
  readFileSync(new URL('../../../../packages/contracts/src/rides.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
const contractsRidesModule = { exports: {} };
vm.runInNewContext(contractsRidesCode, {
  exports: contractsRidesModule.exports,
  require: () => ({}),
});

const source = readFileSync(new URL('./rider-helpers.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(code, {
  exports: module.exports,
  require: (name) => {
    if (name === '@cabzone/contracts') {
      return {
        ...contractsRidesModule.exports,
        DEFAULT_CANCELLATION_FEE_PAISE: 5000,
        DEFAULT_RIDER_CANCELLATION_GRACE_SECONDS: 120,
        VEHICLE_CATEGORY_REGISTRY: {
          CAB: { displayName: 'Cab (4 Seats)' },
          E_RICKSHAW: { displayName: 'E-Rickshaw (Toto)' },
        },
        formatPublicRatingLabel: (ratingAverage, ratingCount, fallback = 'New') => {
          if (
            typeof ratingCount !== 'number' ||
            ratingCount < 5 ||
            typeof ratingAverage !== 'number' ||
            !Number.isFinite(ratingAverage)
          ) {
            return fallback;
          }
          return ratingAverage.toFixed(1);
        },
      };
    }
    return {};
  },
});
const {
  clampProposedFarePaise,
  createBookingIdempotencyKey,
  extractActiveRideConflictId,
  isRideActive,
  isRideWithinRatingWindow,
  normalizeIndianPhoneE164,
  extractPendingDriverCounters,
  formatAssignedDriverSummary,
  resolveRideCashAvailability,
  resolveRiderCancellationPreview,
} = module.exports;

test('clampProposedFarePaise respects floor and ceiling bounds', () => {
  assert.equal(clampProposedFarePaise(10000, 15000, 30000), 15000);
  assert.equal(clampProposedFarePaise(35000, 15000, 30000), 30000);
  assert.equal(clampProposedFarePaise(21200, 15000, 30000), 21000);
});

test('normalizeIndianPhoneE164 validates Indian mobile numbers', () => {
  assert.equal(normalizeIndianPhoneE164('9876543210'), '+919876543210');
  assert.equal(normalizeIndianPhoneE164('+91 98765-43210'), '+919876543210');
  assert.equal(normalizeIndianPhoneE164('12345'), null);
});

test('extractPendingDriverCounters filters out answered and malformed events and preserves driver info', () => {
  const events = [
    {
      eventType: 'FARE_COUNTER_PROPOSED',
      createdAt: '2026-10-22T10:00:00.000Z',
      metadata: { driverId: 'driver-1', proposedFarePaise: 18000 },
    },
    {
      eventType: 'FARE_COUNTER_PROPOSED',
      createdAt: '2026-10-22T10:00:05.000Z',
      metadata: {
        driverId: 'driver-2',
        proposedFarePaise: 19500,
        driverName: 'Subrata Ghosh',
        vehicleLabel: 'White Maruti Dzire · WB74AB1234',
      },
    },
    {
      eventType: 'FARE_COUNTER_REJECTED',
      createdAt: '2026-10-22T10:00:10.000Z',
      metadata: { driverId: 'driver-1', proposedFarePaise: 18000 },
    },
    {
      eventType: 'FARE_COUNTER_PROPOSED',
      createdAt: '2026-10-22T10:00:12.000Z',
      metadata: null,
    },
  ];
  const counters = extractPendingDriverCounters(events);
  assert.equal(counters.length, 1);
  assert.equal(counters[0].driverId, 'driver-2');
  assert.equal(counters[0].proposedFarePaise, 19500);
  assert.equal(counters[0].driverName, 'Subrata Ghosh');
  assert.equal(counters[0].vehicleLabel, 'White Maruti Dzire · WB74AB1234');
});

test('raising fare clears old and late stale-version counters', () => {
  const at = '2026-10-22T10:00:00.000Z';
  const events = [
    {
      eventType: 'FARE_COUNTER_PROPOSED',
      createdAt: at,
      metadata: { driverId: 'old', proposedFarePaise: 9000, rideVersion: 1 },
    },
    {
      eventType: 'FARE_PROPOSAL_RAISED',
      createdAt: '2026-10-22T10:00:01.000Z',
      metadata: { rideVersion: 2 },
    },
    {
      eventType: 'FARE_COUNTER_PROPOSED',
      createdAt: '2026-10-22T10:00:02.000Z',
      metadata: { driverId: 'late-old', proposedFarePaise: 9500, rideVersion: 1 },
    },
    {
      eventType: 'FARE_COUNTER_PROPOSED',
      createdAt: '2026-10-22T10:00:03.000Z',
      metadata: { driverId: 'new', proposedFarePaise: 10000, rideVersion: 2 },
    },
  ];
  const counters = extractPendingDriverCounters(events);
  assert.equal(counters.length, 1);
  assert.equal(counters[0].driverId, 'new');
});

test('formatAssignedDriverSummary returns enriched driver, vehicle, and >=5 rating threshold labels', () => {
  const enriched = formatAssignedDriverSummary({
    driverId: '0195f100-0000-7000-8000-000000000012',
    vehicleCategory: 'CAB',
    assignedDriver: {
      driverId: '0195f100-0000-7000-8000-000000000012',
      name: 'Rajesh Barman',
      profilePhotoUrl: null,
      ratingAverage: 4.82,
      ratingCount: 6,
      vehicle: {
        vehicleId: 'veh-13',
        make: 'Hyundai',
        model: 'Aura',
        color: 'Silver',
        registrationNumber: 'WB74CD5678',
        vehicleCategory: 'CAB',
      },
    },
  });
  assert.equal(enriched.driverName, 'Rajesh Barman');
  assert.equal('phoneE164' in enriched, false);
  assert.equal(enriched.vehicleLabel, 'Silver Hyundai Aura');
  assert.equal(enriched.registrationNumber, 'WB74CD5678');
  assert.equal(enriched.ratingLabel, '4.8');

  const belowSampleThreshold = formatAssignedDriverSummary({
    driverId: '0195f100-0000-7000-8000-000000000012',
    vehicleCategory: 'CAB',
    assignedDriver: {
      driverId: '0195f100-0000-7000-8000-000000000012',
      name: 'Rajesh Barman',
      profilePhotoUrl: null,
      ratingAverage: 5.0,
      ratingCount: 4,
      vehicle: null,
    },
  });
  assert.equal(belowSampleThreshold.ratingLabel, 'New');

  const fallback = formatAssignedDriverSummary({
    driverId: '0195f100-0000-7000-8000-000000000012',
    vehicleCategory: 'CAB',
    assignedDriver: null,
  });
  assert.equal(fallback.driverName, 'Driver #0195F1');
  assert.equal(fallback.vehicleLabel, 'Cab (4 Seats)');
  assert.equal(fallback.registrationNumber, null);
  assert.equal(fallback.ratingLabel, 'New');
});

test('isRideActive blocks the 9 active statuses plus PAYMENT_UNPAID, and unblocks PAYMENT_CASH_CLAIMED', () => {
  for (const blocking of [
    'REQUESTED',
    'OFFERING',
    'DRIVER_ASSIGNED',
    'DRIVER_EN_ROUTE',
    'DRIVER_ARRIVED',
    'TRIP_STARTED',
    'TRIP_COMPLETED',
    'PAYMENT_PENDING',
    'PAYMENT_CONFIRMED',
    'PAYMENT_UNPAID',
  ]) {
    assert.equal(isRideActive(blocking), true, `Expected ${blocking} to block new booking`);
  }
  for (const nonBlocking of [
    'PAYMENT_CASH_CLAIMED',
    'PAYMENT_DISPUTED',
    'SETTLED',
    'CANCELLED',
    'EXPIRED',
  ]) {
    assert.equal(isRideActive(nonBlocking), false, `Expected ${nonBlocking} to be non-blocking`);
  }
});

test('extractActiveRideConflictId and createBookingIdempotencyKey follow API contract', () => {
  assert.equal(
    extractActiveRideConflictId({
      status: 409,
      details: { code: 'ACTIVE_RIDE_EXISTS', rideId: 'ride-123' },
    }),
    'ride-123',
  );
  assert.equal(extractActiveRideConflictId({ status: 409, details: { code: 'OTHER' } }), null);
  assert.equal(extractActiveRideConflictId({ status: 400 }), null);

  const key = createBookingIdempotencyKey();
  assert.match(key, /^[a-zA-Z0-9:_-]{8,128}$/);
});

test('resolveRiderCancellationPreview reflects grace window and arrival fee from pricingSnapshot', () => {
  const acceptedAt = '2026-10-28T10:00:00.000Z';
  const baseRide = {
    driverId: 'driver-1',
    acceptedAt,
    updatedAt: acceptedAt,
    pricingSnapshot: {
      cancellationFeePaise: 4000,
      riderCancellationGraceSeconds: 90,
    },
  };

  const withinGrace = resolveRiderCancellationPreview(
    { ...baseRide, status: 'DRIVER_EN_ROUTE' },
    Date.parse('2026-10-28T10:01:00.000Z'),
  );
  assert.equal(withinGrace.isFree, true);
  assert.equal(withinGrace.feePaise, 0);
  assert.equal(withinGrace.graceRemainingSeconds, 30);

  const pastGrace = resolveRiderCancellationPreview(
    { ...baseRide, status: 'DRIVER_EN_ROUTE' },
    Date.parse('2026-10-28T10:02:00.000Z'),
  );
  assert.equal(pastGrace.isFree, false);
  assert.equal(pastGrace.feePaise, 4000);
  assert.match(pastGrace.summaryText, /₹40/);

  const arrived = resolveRiderCancellationPreview(
    { ...baseRide, status: 'DRIVER_ARRIVED' },
    Date.parse('2026-10-28T10:00:30.000Z'),
  );
  assert.equal(arrived.isFree, false);
  assert.equal(arrived.feePaise, 4000);
});

test('resolveRideCashAvailability always allows cash or UPI even when arrears apply', () => {
  const lowArrears = resolveRideCashAvailability({
    arrearsPaise: 2000,
    pricingSnapshot: { cancellationFeePaise: 5000 },
  });
  assert.equal(lowArrears.cashAllowed, true);
  assert.equal(lowArrears.reason, null);

  const highArrears = resolveRideCashAvailability({
    arrearsPaise: 5000,
    pricingSnapshot: { cancellationFeePaise: 5000 },
  });
  assert.equal(highArrears.cashAllowed, true);
  assert.equal(highArrears.arrearsPaise, 5000);
  assert.equal(highArrears.reason, null);
});

test('isRideWithinRatingWindow enforces the 7-day post-settlement window', () => {
  const settledAt = '2026-10-20T10:00:00.000Z';
  assert.equal(isRideWithinRatingWindow(settledAt, Date.parse('2026-10-25T10:00:00.000Z')), true);
  assert.equal(isRideWithinRatingWindow(settledAt, Date.parse('2026-10-28T10:00:00.000Z')), false);
});
