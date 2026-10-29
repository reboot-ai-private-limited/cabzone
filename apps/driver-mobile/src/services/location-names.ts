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

/** Ride data returns immediately; later refreshes use names warmed by a bounded queue. */
export function createRouteNameResolver(lookup: AddressLookup) {
  type Entry = { expires: number; value: string | null; pending: boolean };
  const cache = new Map<string, Entry>();
  const queue: { point: Point; entry: Entry }[] = [];
  let active = 0;
  function pump() {
    while (active < 4 && queue.length > 0) {
      const job = queue.shift()!;
      active++;
      void Promise.resolve()
        .then(() => lookup(job.point.lat, job.point.lng))
        .then((result) => {
          job.entry.value =
            locationLabel(result.formattedAddress, '') ||
            [result.city, result.state].filter(Boolean).join(', ') ||
            null;
        })
        .catch(() => {
          /* Failed address lookup must not affect a ride action. */
        })
        .finally(() => {
          job.entry.pending = false;
          job.entry.expires = Date.now() + 60000;
          active--;
          pump();
        });
    }
  }
  function resolvePoint(point: Point, fallback: string): Point {
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
    if (!entry || (!entry.pending && entry.expires < Date.now())) {
      if (!entry && cache.size >= 200) {
        const evictable = [...cache].find(([, value]) => !value.pending);
        if (evictable) cache.delete(evictable[0]);
        else return { ...point, address: existing || fallback };
      }
      entry = { value: entry?.value ?? null, expires: 0, pending: true };
      cache.set(key, entry);
      queue.push({ point: { ...point }, entry });
      pump();
    }
    return { ...point, address: entry.value || existing || fallback };
  }
  function resolve<T>(data: T): T {
    if (Array.isArray(data)) return data.map(resolve) as T;
    if (!data || typeof data !== 'object') return data;
    const result = { ...data } as Record<string, unknown>;
    for (const key of ['pickup', 'drop']) {
      const point = result[key] as Point | undefined;
      if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng))
        result[key] = resolvePoint(point, key === 'pickup' ? 'Pickup location' : 'Destination');
    }
    for (const key of ['items', 'rides', 'offers', 'ride']) {
      if (result[key]) result[key] = resolve(result[key]);
    }
    return result as T;
  }
  return resolve;
}
