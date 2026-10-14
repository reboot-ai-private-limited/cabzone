import assert from 'node:assert/strict';
import { test } from 'node:test';
import { personalInfoPayload, toBackendDate, toDisplayDate } from '../src/services/profile.ts';

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
