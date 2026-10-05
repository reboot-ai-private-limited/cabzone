import type { GeoPoint, QuoteDto, ResolvedLocationDetails, VehicleCategory } from '@cabzone/contracts';
import { isPointInIndia } from '@cabzone/geo';
import { request } from '../client.js';

export interface SimulateQuoteInput {
  pickup: GeoPoint;
  drop: GeoPoint;
  vehicleCategory: VehicleCategory;
}

export function validateCoordinates(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

export const quotesApi = {
  simulate: (body: SimulateQuoteInput, token?: string) => {
    if (!validateCoordinates(body.pickup)) {
      throw new Error(
        `Invalid pickup coordinates: [${body.pickup.lat}, ${body.pickup.lng}]. Lat must be -90..90 and Lng must be -180..180.`,
      );
    }
    const pickupCheck = isPointInIndia(body.pickup);
    if (!pickupCheck.inside) {
      throw new Error(`OUTSIDE_INDIA: ${pickupCheck.reason ?? 'Pickup must be within India.'}`);
    }

    if (!validateCoordinates(body.drop)) {
      throw new Error(
        `Invalid drop coordinates: [${body.drop.lat}, ${body.drop.lng}]. Lat must be -90..90 and Lng must be -180..180.`,
      );
    }
    const dropCheck = isPointInIndia(body.drop);
    if (!dropCheck.inside) {
      throw new Error(`OUTSIDE_INDIA: ${dropCheck.reason ?? 'Drop must be within India.'}`);
    }

    return request<QuoteDto>('/v1/pricing/quotes', {
      method: 'POST',
      body,
      ...(token !== undefined ? { token } : {}),
    });
  },

  reverseGeocode: (point: GeoPoint, token?: string) => {
    if (!validateCoordinates(point)) {
      throw new Error(
        `Invalid coordinates: [${point.lat}, ${point.lng}]. Lat must be -90..90 and Lng must be -180..180.`,
      );
    }
    return request<ResolvedLocationDetails>(
      `/v1/routing/reverse-geocode?lat=${point.lat}&lng=${point.lng}`,
      {
        method: 'GET',
        ...(token !== undefined ? { token } : {}),
      },
    );
  },
};
