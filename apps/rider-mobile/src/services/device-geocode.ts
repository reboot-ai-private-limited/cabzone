import * as Location from 'expo-location';

/** Street-level label from the device geocoder; null when it has nothing better than a city. */
export async function reverseGeocodeLabel(lat: number, lng: number): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!place) return null;
    // Android often returns a Plus Code or house number as `name`; neither helps a driver.
    const useless = /^\d+$|^[0-9A-Z]{4,8}\+[0-9A-Z]{2,3}$/i;
    const street = [place.name, place.street].find((part) => part && !useless.test(part));
    const parts = [street, place.district ?? place.subregion, place.city]
      .filter((part, i, all): part is string => !!part && all.indexOf(part) === i);
    return parts.length > 1 ? parts.join(', ') : null;
  } catch {
    return null;
  }
}
