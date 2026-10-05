import type { GeoPoint } from './zones.js';

export interface ResolvedLocationDetails {
  point: GeoPoint;
  country: string | null;
  countryCode: string | null;
  state: string | null;
  stateCode: string | null;
  city: string | null;
  district?: string | null | undefined;
  postalCode?: string | null | undefined;
  formattedAddress?: string | null | undefined;
}

export interface ReverseGeocodeQuery {
  lat: number;
  lng: number;
}
