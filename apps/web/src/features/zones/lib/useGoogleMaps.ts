'use client';

import { useEffect, useState } from 'react';

let isScriptLoading = false;
const callbacks: Array<() => void> = [];

export function useGoogleMaps(apiKey?: string) {
  const [isLoaded, setIsLoaded] = useState<boolean>(() => {
    return typeof window !== 'undefined' && Boolean(window.google?.maps);
  });
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) {
      return;
    }

    if (window.google?.maps) {
      setIsLoaded(true);
      return;
    }

    const onScriptLoaded = () => {
      setIsLoaded(true);
    };

    if (isScriptLoading) {
      callbacks.push(onScriptLoaded);
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]',
    );
    if (existingScript) {
      existingScript.addEventListener('load', onScriptLoaded);
      return () => {
        existingScript.removeEventListener('load', onScriptLoaded);
      };
    }

    isScriptLoading = true;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      isScriptLoading = false;
      setIsLoaded(true);
      callbacks.forEach((cb) => cb());
      callbacks.length = 0;
    };

    script.onerror = () => {
      isScriptLoading = false;
      setLoadError('Failed to load Google Maps SDK');
      callbacks.length = 0;
    };

    document.head.appendChild(script);
  }, [apiKey]);

  return { isLoaded, loadError };
}
