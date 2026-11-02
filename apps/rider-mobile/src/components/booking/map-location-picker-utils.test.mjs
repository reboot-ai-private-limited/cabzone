import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPickedPoint,
  isVagueAddress,
  labelForDetails,
  roundCoordinate,
  splitAddress,
  withLandmark,
} from './map-location-picker-utils.ts';

test('isVagueAddress flags unnamed roads, plus codes and empty labels', () => {
  assert.equal(isVagueAddress('Unnamed Road, Siliguri, West Bengal'), true);
  assert.equal(isVagueAddress('7MCW+Q2 Siliguri'), true);
  assert.equal(isVagueAddress(''), true);
  assert.equal(isVagueAddress(null), true);
  assert.equal(isVagueAddress('Hill Cart Road, Siliguri'), false);
});

test('classifyPickedPoint only rejects points outside India', () => {
  assert.equal(classifyPickedPoint({ countryCode: 'IN' }), 'ok');
  assert.equal(classifyPickedPoint({ countryCode: 'in' }), 'ok');
  assert.equal(classifyPickedPoint({ countryCode: 'NP' }), 'unserviceable');
  assert.equal(classifyPickedPoint({ countryCode: null }), 'ok');
  assert.equal(classifyPickedPoint(null), 'ok');
});

test('splitAddress gives a short title and area for the confirm card', () => {
  assert.deepEqual(splitAddress('Sevoke Road, Ward 12, Siliguri, West Bengal'), {
    title: 'Sevoke Road',
    area: 'Ward 12, Siliguri',
  });
  assert.deepEqual(splitAddress(''), { title: 'Selected location', area: '' });
});

test('labelForDetails never returns an empty label', () => {
  assert.equal(labelForDetails({ formattedAddress: ' Hill Cart Rd ' }), 'Hill Cart Rd');
  assert.equal(labelForDetails({ city: 'Siliguri', state: 'West Bengal' }), 'Siliguri, West Bengal');
  assert.equal(labelForDetails(null), 'Selected location');
});

test('withLandmark appends a trimmed note, or replaces a vague address', () => {
  assert.equal(
    withLandmark('Hill Cart Road, Siliguri', '  near the   blue gate '),
    'Hill Cart Road, Siliguri (near the blue gate)',
  );
  assert.equal(withLandmark('Unnamed Road, Siliguri', 'Opposite SBI'), 'Opposite SBI');
  assert.equal(withLandmark('Hill Cart Road', '   '), 'Hill Cart Road');
  assert.equal(withLandmark('A', 'x'.repeat(200)).length, 'A ()'.length + 80);
});

test('roundCoordinate keeps five decimals', () => {
  assert.equal(roundCoordinate(26.727123456), 26.72712);
});
