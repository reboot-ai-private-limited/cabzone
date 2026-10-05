import { describe, expect, it, vi } from 'vitest';
import {
  GoogleGeocodingProvider,
  NullDestinationStateResolver,
} from '../src/modules/routing/infrastructure/googleGeocoding.provider.js';

describe('GoogleGeocodingProvider Unit Tests', () => {
  const dummyApiKey = 'AIzaSyFakeGoogleApiKey1234567890';

  it('parses full location details from Google Geocoding API response', async () => {
    const mockApiResponse = {
      status: 'OK',
      results: [
        {
          formatted_address: 'Sevoke Road, Siliguri, West Bengal 734001, India',
          address_components: [
            { long_name: 'Siliguri', short_name: 'Siliguri', types: ['locality', 'political'] },
            { long_name: 'Darjeeling', short_name: 'Darjeeling', types: ['administrative_area_level_2', 'political'] },
            { long_name: 'West Bengal', short_name: 'WB', types: ['administrative_area_level_1', 'political'] },
            { long_name: 'India', short_name: 'IN', types: ['country', 'political'] },
            { long_name: '734001', short_name: '734001', types: ['postal_code'] },
          ],
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockApiResponse,
    } as unknown as Response);

    const provider = new GoogleGeocodingProvider({
      apiKey: dummyApiKey,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const details = await provider.resolveLocation({ lat: 26.7141, lng: 88.4334 });

    expect(details.country).toBe('India');
    expect(details.countryCode).toBe('IN');
    expect(details.state).toBe('West Bengal');
    expect(details.stateCode).toBe('WB');
    expect(details.city).toBe('Siliguri');
    expect(details.district).toBe('Darjeeling');
    expect(details.postalCode).toBe('734001');
    expect(details.formattedAddress).toBe('Sevoke Road, Siliguri, West Bengal 734001, India');

    // Backward-compatible resolve()
    const stateCode = await provider.resolve({ lat: 26.7141, lng: 88.4334 });
    expect(stateCode).toBe('WB');

    // Verify cache was used (mockFetch called only once)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('parses interstate drop location in Bihar', async () => {
    const mockApiResponse = {
      status: 'OK',
      results: [
        {
          formatted_address: 'Kishanganj, Bihar 855107, India',
          address_components: [
            { long_name: 'Kishanganj', short_name: 'Kishanganj', types: ['locality', 'political'] },
            { long_name: 'Bihar', short_name: 'BR', types: ['administrative_area_level_1', 'political'] },
            { long_name: 'India', short_name: 'IN', types: ['country', 'political'] },
            { long_name: '855107', short_name: '855107', types: ['postal_code'] },
          ],
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockApiResponse,
    } as unknown as Response);

    const provider = new GoogleGeocodingProvider({
      apiKey: dummyApiKey,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const details = await provider.resolveLocation({ lat: 26.0984, lng: 87.9482 });

    expect(details.countryCode).toBe('IN');
    expect(details.stateCode).toBe('BR');
    expect(details.state).toBe('Bihar');
    expect(details.city).toBe('Kishanganj');
  });

  it('handles API errors / billing failure gracefully with offline resolution fallback', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Billing not enabled / network offline'));

    const provider = new GoogleGeocodingProvider({
      apiKey: dummyApiKey,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const details = await provider.resolveLocation({ lat: 26.7141, lng: 88.4334 });

    expect(details.country).toBe('India');
    expect(details.countryCode).toBe('IN');
    expect(details.stateCode).toBe('WB');
    expect(details.city).toBe('Siliguri');
  });

  it('NullDestinationStateResolver resolves Indian locations offline without external dependencies', async () => {
    const nullResolver = new NullDestinationStateResolver();
    const siliguri = await nullResolver.resolveLocation({ lat: 26.7271, lng: 88.3953 });

    expect(siliguri.countryCode).toBe('IN');
    expect(siliguri.stateCode).toBe('WB');
    expect(siliguri.city).toBe('Siliguri');

    const kishanganj = await nullResolver.resolveLocation({ lat: 26.0984, lng: 87.9482 });
    expect(kishanganj.countryCode).toBe('IN');
    expect(kishanganj.stateCode).toBe('BR');
    expect(kishanganj.state).toBe('Bihar');
    expect(kishanganj.city).toBe('Kishanganj');

    const state = await nullResolver.resolve({ lat: 26.0984, lng: 87.9482 });
    expect(state).toBe('BR');
  });

  it('resolves unknown / out of bounds points safely', async () => {
    const nullResolver = new NullDestinationStateResolver();
    const details = await nullResolver.resolveLocation({ lat: 0, lng: 0 });

    expect(details.country).toBe('Outside India');
    expect(details.countryCode).toBe('XX');
    expect(details.stateCode).toBeNull();
    expect(details.city).toBeNull();
  });
});

