import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
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
        VEHICLE_CATEGORY_REGISTRY: {
          CAB: { displayName: 'Cab (4 Seats)' },
          E_RICKSHAW: { displayName: 'E-Rickshaw (Toto)' },
        },
      };
    }
    return {};
  },
});
const {
  clampProposedFarePaise,
  normalizeIndianPhoneE164,
  extractPendingDriverCounters,
  formatAssignedDriverSummary,
  isRideActive,
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

test('isRideActive covers every active and in-flight settlement status and excludes terminal statuses', () => {
  for (const status of [
    'REQUESTED',
    'OFFERING',
    'DRIVER_ASSIGNED',
    'DRIVER_EN_ROUTE',
    'DRIVER_ARRIVED',
    'TRIP_STARTED',
    'TRIP_COMPLETED',
    'PAYMENT_PENDING',
    'PAYMENT_CONFIRMED',
  ]) {
    assert.equal(isRideActive(status), true, `expected ${status} to be active`);
  }
  for (const terminal of ['SETTLED', 'PAYMENT_DISPUTED', 'CANCELLED', 'EXPIRED']) {
    assert.equal(isRideActive(terminal), false, `expected ${terminal} to be terminal`);
  }
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
      createdAt: at,
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

test('formatAssignedDriverSummary returns enriched driver and vehicle labels with clean fallbacks', () => {
  const enriched = formatAssignedDriverSummary({
    driverId: '0195f100-0000-7000-8000-000000000012',
    vehicleCategory: 'CAB',
    assignedDriver: {
      driverId: '0195f100-0000-7000-8000-000000000012',
      name: 'Rajesh Barman',
      phoneE164: '+919000000013',
      profilePhotoUrl: null,
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
  assert.equal(enriched.phoneE164, '+919000000013');
  assert.equal(enriched.vehicleLabel, 'Silver Hyundai Aura');
  assert.equal(enriched.registrationNumber, 'WB74CD5678');

  const fallback = formatAssignedDriverSummary({
    driverId: '0195f100-0000-7000-8000-000000000012',
    vehicleCategory: 'CAB',
    assignedDriver: null,
  });
  assert.equal(fallback.driverName, 'Driver #0195F1');
  assert.equal(fallback.vehicleLabel, 'Cab (4 Seats)');
  assert.equal(fallback.registrationNumber, null);
});
