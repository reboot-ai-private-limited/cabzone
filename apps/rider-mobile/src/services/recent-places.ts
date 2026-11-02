export interface SavedPlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface RideWithPlaces {
  drop: { lat: number; lng: number; address: string | null };
  stops?: { lat: number; lng: number; address: string | null }[];
}

/** "Brinda Apartment, Pritilata Sarani, Ward 39" -> name "Brinda Apartment", address "Pritilata Sarani, Ward 39". */
export function splitPlaceLabel(label: string): { name: string; address: string } {
  const [name = '', ...rest] = label.split(',').map((part) => part.trim());
  return { name, address: rest.join(', ') };
}

export function placeKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/** Distinct places the rider went to recently, newest first. Rides are expected newest first. */
export function recentPlacesFromRides(rides: RideWithPlaces[], limit = 8): SavedPlace[] {
  const seen = new Set<string>();
  const places: SavedPlace[] = [];
  for (const ride of rides) {
    for (const stop of [ride.drop, ...(ride.stops ?? [])]) {
      if (!stop.address?.trim()) continue;
      const key = placeKey(stop.lat, stop.lng);
      if (seen.has(key)) continue;
      seen.add(key);
      places.push({ id: key, ...splitPlaceLabel(stop.address), lat: stop.lat, lng: stop.lng });
      if (places.length >= limit) return places;
    }
  }
  return places;
}
