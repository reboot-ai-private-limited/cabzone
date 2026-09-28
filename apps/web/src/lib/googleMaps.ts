/**
 * Shared Google Maps loader and utilities
 */

export const DEFAULT_CENTER = { lat: 26.7271, lng: 88.3953 };

export const hasApiKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

let loadPromise: Promise<void> | null = null;

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (window.google?.maps) {
    return Promise.resolve();
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]',
    );
    if (existing) {
      if (window.google?.maps) {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps SDK')));
      }
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps SDK'));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export async function loadMapLibraries(
  ...libraries: string[]
): Promise<Record<string, unknown>> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  if (apiKey) {
    await loadGoogleMapsScript(apiKey);
  }

  const result: Record<string, unknown> = {};
  if (typeof window !== 'undefined' && window.google?.maps) {
    for (const lib of libraries) {
      if (typeof window.google.maps.importLibrary === 'function') {
        try {
          result[lib] = await window.google.maps.importLibrary(lib);
        } catch {
          result[lib] = (window.google.maps as unknown as Record<string, unknown>)[lib] ?? window.google.maps;
        }
      } else {
        result[lib] = (window.google.maps as unknown as Record<string, unknown>)[lib] ?? window.google.maps;
      }
    }
  }

  return result;
}
