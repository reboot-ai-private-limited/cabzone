import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateKycReviewState,
  isValidRegistrationNumber,
  mapSubmissionError,
  normalizeRegistrationNumber,
  personalInfoPayload,
  toBackendDate,
  toDisplayDate,
  validateDob,
  validateFutureExpiryDate,
  validateManufactureYear,
} from '../src/services/profile.ts';
import { INITIAL_DRAFT } from '../src/components/kyc/types.ts';

test('personal details use backend field names and ISO birth date', () => {
  assert.deepEqual(
    personalInfoPayload({
      firstName: ' Priya ',
      lastName: ' Sharma ',
      dateOfBirth: '15/05/1995',
      gender: 'FEMALE',
      profilePhotoDataUrl: 'photo',
    }),
    {
      name: 'Priya Sharma',
      dateOfBirth: '1995-05-15',
      gender: 'FEMALE',
      profilePhotoDataUrl: 'photo',
    },
  );
  assert.equal(toDisplayDate('1995-05-15'), '15/05/1995');
  assert.equal(toBackendDate('1995-05-15'), '1995-05-15');
  assert.throws(() => toBackendDate('31/02/1995'));
  assert.throws(() => toBackendDate('15/13/1995'));
  assert.throws(() =>
    personalInfoPayload({
      firstName: 'Priya',
      lastName: '',
      dateOfBirth: '15/05/1995',
      gender: '',
    }),
  );
  assert.equal(
    Object.hasOwn(
      personalInfoPayload({
        firstName: 'Priya',
        lastName: '',
        dateOfBirth: '15/05/1995',
        gender: 'FEMALE',
      }),
      'profilePhotoDataUrl',
    ),
    false,
  );
});

test('validateDob enforces 1950 minimum, 18+ age, and strict leap-year calendar dates', () => {
  const now = new Date('2026-10-14T12:00:00.000Z');
  assert.equal(validateDob('15/05/1995', now).valid, true);
  assert.equal(validateDob('01/01/1950', now).valid, true);
  assert.equal(validateDob('31/12/1949', now).valid, false);
  assert.equal(validateDob('15/10/2008', now).valid, false); // 17 years old
  assert.equal(validateDob('14/10/2008', now).valid, true); // turns 18 today
  assert.equal(validateDob('29/02/2000', now).valid, true); // leap year
  assert.equal(validateDob('29/02/2001', now).valid, false); // non-leap year
});

test('validateFutureExpiryDate rejects past, today, and impossible dates', () => {
  const now = new Date('2026-10-14T12:00:00.000Z');
  assert.equal(validateFutureExpiryDate('14/10/2026', now).valid, false);
  assert.equal(validateFutureExpiryDate('13/10/2026', now).valid, false);
  assert.equal(validateFutureExpiryDate('31/04/2028', now).valid, false);
  const future = validateFutureExpiryDate('15/10/2026', now);
  assert.equal(future.valid, true);
  assert.equal(future.isoDate, '2026-10-15');
  assert.equal(future.isoTimestamp, '2026-10-15T23:59:59.999Z');
});

test('registration number normalization and validation supports 10 and 11 character plates', () => {
  assert.equal(normalizeRegistrationNumber('wb-74-abc-1234'), 'WB74ABC1234');
  assert.equal(isValidRegistrationNumber('WB74AB1234'), true); // 10 chars
  assert.equal(isValidRegistrationNumber('WB74ABC1234'), true); // 11 chars
  assert.equal(isValidRegistrationNumber('DL1C1234'), true); // 1-digit RTO + 1-letter series
  assert.equal(isValidRegistrationNumber('INVALID'), false);
});

test('validateManufactureYear allows empty/null or 4-digit year within bounds', () => {
  const now = new Date('2026-10-14T12:00:00.000Z');
  assert.deepEqual(validateManufactureYear('', now), { valid: true, year: null });
  assert.deepEqual(validateManufactureYear(null, now), { valid: true, year: null });
  assert.deepEqual(validateManufactureYear('2023', now), { valid: true, year: 2023 });
  assert.equal(validateManufactureYear('1999', now).valid, false);
  assert.equal(validateManufactureYear('2028', now).valid, false);
});

test('evaluateKycReviewState never fabricates fallback values and requires server documents', () => {
  const now = new Date('2026-10-14T12:00:00.000Z');
  const emptyReview = evaluateKycReviewState({
    driver: null,
    vehicle: null,
    documents: [],
    draft: INITIAL_DRAFT,
    now,
  });

  assert.equal(emptyReview.dobDisplay, null);
  assert.equal(emptyReview.registrationNumber, null);
  assert.equal(emptyReview.canSubmit, false);
  assert.ok(emptyReview.documentItems.every((item) => item.status === 'MISSING'));

  const completeReview = evaluateKycReviewState({
    driver: {
      id: 'drv_1',
      userId: 'usr_1',
      name: 'Rohan Das',
      gender: 'MALE',
      dateOfBirth: '1994-06-20',
      address: 'Siliguri',
      dlNumber: 'WB7420220012345',
      dlExpiry: '2030-05-01',
      profilePhotoUrl: 'https://cdn.cabzone.in/photo.jpg',
      status: 'ONBOARDING',
      currentVehicleId: 'veh_1',
      isAvailable: false,
    },
    vehicle: {
      id: 'veh_1',
      driverId: 'drv_1',
      vehicleType: 'CAB',
      make: 'Maruti Suzuki',
      model: 'Maruti Dzire Tour',
      registrationNumber: 'WB74ABC1234',
      color: 'White',
      manufactureYear: null,
      status: 'PENDING',
    },
    documents: [
      {
        id: 'd1',
        applicationId: 'app_1',
        type: 'DRIVING_LICENSE',
        storageKey: 'driver-documents/dl.jpg',
        status: 'UPLOADED',
        expiresAt: '2030-05-01T23:59:59.999Z',
      },
      {
        id: 'd2',
        applicationId: 'app_1',
        type: 'GOVERNMENT_ID',
        storageKey: 'driver-documents/id.jpg',
        status: 'UPLOADED',
      },
      {
        id: 'd3',
        applicationId: 'app_1',
        type: 'REGISTRATION_CERTIFICATE',
        storageKey: 'driver-documents/rc.jpg',
        status: 'UPLOADED',
        expiresAt: '2032-01-01T23:59:59.999Z',
      },
      {
        id: 'd4',
        applicationId: 'app_1',
        type: 'INSURANCE',
        storageKey: 'driver-documents/ins.jpg',
        status: 'UPLOADED',
        expiresAt: '2027-06-01T23:59:59.999Z',
      },
      {
        id: 'd5',
        applicationId: 'app_1',
        type: 'PERMIT',
        storageKey: 'driver-documents/permit.jpg',
        status: 'UPLOADED',
        expiresAt: '2028-06-01T23:59:59.999Z',
      },
    ],
    draft: INITIAL_DRAFT,
    now,
  });

  assert.equal(completeReview.canSubmit, true);
  assert.equal(completeReview.registrationNumber, 'WB74ABC1234');
  assert.equal(completeReview.manufactureYear, null);
});

test('mapSubmissionError maps backend document errors to repair steps', () => {
  const dlErr = mapSubmissionError(
    new Error('DOCUMENTS_REQUIRED: Upload a current DRIVING_LICENSE before submitting.'),
  );
  assert.equal(dlErr.targetStep, 4);

  const rcErr = mapSubmissionError(
    new Error('DOCUMENTS_REQUIRED: Upload a current REGISTRATION_CERTIFICATE before submitting.'),
  );
  assert.equal(rcErr.targetStep, 5);
});
