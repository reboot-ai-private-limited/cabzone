/**
 * Google Places Autocomplete and Details service for Cabzone Rider Mobile.
 * Provides live location search with India bias, Siliguri center, and fallback to local presets.
 */

export interface PlaceSuggestion {
  id: string;
  name: string;
  subtitle: string;
  isPreset?: boolean;
  lat?: number;
  lng?: number;
}

export interface AutocompleteOptions {
  apiKey?: string;
  sessionToken?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  countryCode?: string;
}

export interface PlaceCoordinates {
  lat: number;
  lng: number;
  address: string;
}

const DEFAULT_CENTER_LAT = 26.7271; // Siliguri center
const DEFAULT_CENTER_LNG = 88.4334;
const DEFAULT_RADIUS_METERS = 50000; // 50 km coverage around Siliguri & North Bengal

export function createPlacesSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Fetch autocomplete predictions from Google Places API.
 * Returns empty array if query is too short or if network/API fails.
 */
export async function fetchPlacePredictions(
  query: string,
  options?: AutocompleteOptions,
): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const apiKey =
    options?.apiKey ||
    (typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY : undefined);

  if (!apiKey) {
    return [];
  }

  const lat = options?.latitude ?? DEFAULT_CENTER_LAT;
  const lng = options?.longitude ?? DEFAULT_CENTER_LNG;
  const radius = options?.radiusMeters ?? DEFAULT_RADIUS_METERS;
  const country = options?.countryCode ?? 'in';

  const params = new URLSearchParams({
    input: trimmed,
    key: apiKey,
    components: `country:${country}`,
    language: 'en',
  });
  // radiusMeters: 0 means "search the whole country" (city-to-city destinations).
  if (radius > 0) {
    params.set('location', `${lat},${lng}`);
    params.set('radius', String(radius));
  }

  if (options?.sessionToken) {
    params.set('sessiontoken', options.sessionToken);
  }

  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;

  try {
    const response = await fetch(url, {
      signal: controller?.signal,
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      status: string;
      predictions?: Array<{
        place_id: string;
        description: string;
        structured_formatting?: {
          main_text?: string;
          secondary_text?: string;
        };
      }>;
    };

    if (data.status !== 'OK' || !Array.isArray(data.predictions)) {
      return [];
    }

    return data.predictions.map((p) => {
      const name = p.structured_formatting?.main_text || p.description.split(',')[0]?.trim() || '';
      const subtitle =
        p.structured_formatting?.secondary_text ||
        p.description.replace(`${name},`, '').trim() ||
        p.description;
      return {
        id: p.place_id,
        name,
        subtitle,
        isPreset: false,
      };
    });
  } catch {
    // Return empty on network timeout or parse failure
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fetch latitude, longitude, and formatted address for a Google Place ID.
 */
export async function fetchPlaceCoordinates(
  placeId: string,
  options?: { apiKey?: string; sessionToken?: string },
): Promise<PlaceCoordinates | null> {
  if (!placeId) return null;

  const apiKey =
    options?.apiKey ||
    (typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY : undefined);

  if (!apiKey) {
    return null;
  }

  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'geometry,formatted_address,name',
    key: apiKey,
  });

  if (options?.sessionToken) {
    params.set('sessiontoken', options.sessionToken);
  }

  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;

  try {
    const response = await fetch(url, {
      signal: controller?.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      status: string;
      result?: {
        name?: string;
        formatted_address?: string;
        geometry?: {
          location?: {
            lat: number;
            lng: number;
          };
        };
      };
    };

    if (data.status !== 'OK' || !data.result?.geometry?.location) {
      return null;
    }

    const loc = data.result.geometry.location;
    const address = data.result.formatted_address || data.result.name || 'Selected location';

    return {
      lat: Number(loc.lat),
      lng: Number(loc.lng),
      address,
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
