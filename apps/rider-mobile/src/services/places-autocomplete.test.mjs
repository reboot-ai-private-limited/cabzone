import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchPlacePredictions,
  fetchPlaceCoordinates,
  createPlacesSessionToken,
} from './places-autocomplete.ts';

test('createPlacesSessionToken generates unique UUIDv4 tokens', () => {
  const token1 = createPlacesSessionToken();
  const token2 = createPlacesSessionToken();
  assert.ok(token1 && token2);
  assert.notEqual(token1, token2);
  assert.match(token1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('fetchPlacePredictions returns empty array for queries with length < 2', async () => {
  const resEmpty = await fetchPlacePredictions('');
  const resSingle = await fetchPlacePredictions('a');
  assert.deepEqual(resEmpty, []);
  assert.deepEqual(resSingle, []);
});

test('fetchPlacePredictions parses Google Places API predictions correctly', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.ok(String(url).includes('maps.googleapis.com/maps/api/place/autocomplete/json'));
      assert.ok(String(url).includes('input=Hong+Kong'));
      assert.ok(String(url).includes('components=country%3Ain'));
      return {
        ok: true,
        json: async () => ({
          status: 'OK',
          predictions: [
            {
              place_id: 'ChIJX123456',
              description: 'Hong Kong Market, Ward 11, Siliguri, West Bengal, India',
              structured_formatting: {
                main_text: 'Hong Kong Market',
                secondary_text: 'Ward 11, Siliguri, West Bengal, India',
              },
            },
          ],
        }),
      };
    };

    const results = await fetchPlacePredictions('Hong Kong', { apiKey: 'dummy-test-key' });
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'ChIJX123456');
    assert.equal(results[0].name, 'Hong Kong Market');
    assert.equal(results[0].subtitle, 'Ward 11, Siliguri, West Bengal, India');
    assert.equal(results[0].isPreset, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchPlaceCoordinates parses geometry location correctly', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.ok(String(url).includes('maps.googleapis.com/maps/api/place/details/json'));
      assert.ok(String(url).includes('place_id=ChIJX123456'));
      return {
        ok: true,
        json: async () => ({
          status: 'OK',
          result: {
            name: 'Hong Kong Market',
            formatted_address: 'Hong Kong Market, Ward 11, Siliguri, West Bengal 734001, India',
            geometry: {
              location: {
                lat: 26.715,
                lng: 88.428,
              },
            },
          },
        }),
      };
    };

    const details = await fetchPlaceCoordinates('ChIJX123456', { apiKey: 'dummy-test-key' });
    assert.ok(details);
    assert.equal(details.lat, 26.715);
    assert.equal(details.lng, 88.428);
    assert.equal(details.address, 'Hong Kong Market, Ward 11, Siliguri, West Bengal 734001, India');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchPlacePredictions and fetchPlaceCoordinates gracefully handle network errors', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new Error('Network timeout');
    };

    const predictions = await fetchPlacePredictions('Siliguri', { apiKey: 'dummy-test-key' });
    assert.deepEqual(predictions, []);

    const details = await fetchPlaceCoordinates('place-123', { apiKey: 'dummy-test-key' });
    assert.equal(details, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
