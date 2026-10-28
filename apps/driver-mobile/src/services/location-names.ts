type Point = { lat: number; lng: number; address?: string | null };
type AddressLookup = (
  lat: number,
  lng: number,
) => Promise<{ formattedAddress?: string | null; city?: string | null; state?: string | null }>;

export function locationLabel(address: string | null | undefined, fallback: string): string {
  const label = address?.trim();
  if (
    !label ||
    /^(?:(?:GPS|Pin)\s*\()?[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?\)?$/i.test(label)
  )
    return fallback;
  return label;
}

export function createRouteNameResolver(lookup: AddressLookup) {
  const cache = new Map<string, { expires: number; value: Promise<string | null> }>();
  async function resolvePoint(point: Point, fallback: string) {
    const existing = locationLabel(point.address, '');
    if (
      existing &&
      !['Selected location', 'Current location', 'Pickup location', 'Destination'].includes(
        existing,
      )
    )
      return point;
    const key = `${point.lat},${point.lng}`;
    let entry = cache.get(key);
    if (!entry || entry.expires < Date.now()) {
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      const value = lookup(point.lat, point.lng)
        .then(
          (result) =>
            locationLabel(result.formattedAddress, '') ||
            [result.city, result.state].filter(Boolean).join(', ') ||
            null,
        )
        .catch(() => null);
      entry = { expires: Date.now() + 60000, value };
      cache.set(key, entry);
    }
    return { ...point, address: (await entry.value) || existing || fallback };
  }
  async function resolve<T>(data: T): Promise<T> {
    if (Array.isArray(data)) return (await Promise.all(data.map(resolve))) as T;
    if (!data || typeof data !== 'object') return data;
    const result = { ...data } as Record<string, unknown>;
    await Promise.all(
      ['pickup', 'drop'].map(async (key) => {
        const point = result[key] as Point | undefined;
        if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
          result[key] = await resolvePoint(
            point,
            key === 'pickup' ? 'Pickup location' : 'Destination',
          );
        }
      }),
    );
    await Promise.all(
      ['items', 'rides', 'offers', 'ride'].map(async (key) => {
        if (result[key]) result[key] = await resolve(result[key]);
      }),
    );
    return result as T;
  }
  return resolve;
}
