'use client';

import { useEffect, useRef, useState } from 'react';
import type { GeoPoint, ZoneDto } from '@cabzone/contracts';
import { isPointInIndia } from '@cabzone/geo';
import { DEFAULT_CENTER, hasApiKey, loadMapLibraries } from '@/lib/googleMaps.js';
import { zonesToFeatureCollection } from '@/features/zones/lib/zone-layers.js';

export interface TripPointMapProps {
  pickup: GeoPoint | null;
  drop: GeoPoint | null;
  onPickupChange: (point: GeoPoint) => void;
  onDropChange: (point: GeoPoint) => void;
  activeTarget?: 'pickup' | 'drop' | 'auto';
  className?: string;
  zones?: ZoneDto[];
}

const PICKUP_ICON_SVG = (
  fill = '#1a7f37',
  stroke = '#ffffff',
  text = 'P',
) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
    <path fill="${fill}" stroke="${stroke}" stroke-width="2" d="M17 1C8.16 1 1 8.16 1 17c0 12.5 16 26 16 26s16-13.5 16-26c0-8.84-7.16-16-16-16z"/>
    <circle fill="#ffffff" cx="17" cy="17" r="7"/>
    <text x="17" y="21" font-size="11" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" fill="${fill}" text-anchor="middle">${text}</text>
  </svg>
`)}`;

const DROP_ICON_SVG = (
  fill = '#cf222e',
  stroke = '#ffffff',
  text = 'D',
) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
    <path fill="${fill}" stroke="${stroke}" stroke-width="2" d="M17 1C8.16 1 1 8.16 1 17c0 12.5 16 26 16 26s16-13.5 16-26c0-8.84-7.16-16-16-16z"/>
    <circle fill="#ffffff" cx="17" cy="17" r="7"/>
    <text x="17" y="21" font-size="11" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" fill="${fill}" text-anchor="middle">${text}</text>
  </svg>
`)}`;

export function TripPointMap({
  pickup,
  drop,
  onPickupChange,
  onDropChange,
  activeTarget = 'auto',
  className = '',
  zones,
}: TripPointMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const pickupMarkerRef = useRef<google.maps.Marker | null>(null);
  const dropMarkerRef = useRef<google.maps.Marker | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const zoneLayerRef = useRef<google.maps.Data | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Keep latest callbacks in refs to avoid recreating map listeners
  const onPickupChangeRef = useRef(onPickupChange);
  onPickupChangeRef.current = onPickupChange;
  const onDropChangeRef = useRef(onDropChange);
  onDropChangeRef.current = onDropChange;
  const activeTargetRef = useRef(activeTarget);
  activeTargetRef.current = activeTarget;
  const pickupRef = useRef(pickup);
  pickupRef.current = pickup;
  const dropRef = useRef(drop);
  dropRef.current = drop;

  // 1. Initialize Map
  useEffect(() => {
    if (!containerRef.current) return;

    let isMounted = true;

    async function init() {
      try {
        await loadMapLibraries('places', 'geometry');
        if (!isMounted || !containerRef.current) return;

        if (typeof window === 'undefined' || !window.google?.maps) {
          throw new Error('Google Maps SDK is not available');
        }

        const map = new google.maps.Map(containerRef.current, {
          center: pickupRef.current ?? dropRef.current ?? DEFAULT_CENTER,
          zoom: 12,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });

        // Click handler: sets pickup or drop
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          const point: GeoPoint = {
            lat: Number(e.latLng.lat().toFixed(6)),
            lng: Number(e.latLng.lng().toFixed(6)),
          };

          const target = activeTargetRef.current;
          if (target === 'pickup') {
            onPickupChangeRef.current(point);
          } else if (target === 'drop') {
            onDropChangeRef.current(point);
          } else {
            // Auto mode: fill whichever is missing first, else replace drop
            if (!pickupRef.current) {
              onPickupChangeRef.current(point);
            } else if (!dropRef.current) {
              onDropChangeRef.current(point);
            } else {
              onDropChangeRef.current(point);
            }
          }
        });

        // Search Autocomplete mounting
        if (
          searchHostRef.current &&
          typeof google.maps.places?.PlaceAutocompleteElement === 'function'
        ) {
          const autocomplete = new google.maps.places.PlaceAutocompleteElement({
            includedRegionCodes: ['in'],
          });
          autocomplete.setAttribute('placeholder', 'Search place or landmark...');
          autocomplete.style.colorScheme = 'light';
          autocomplete.style.setProperty('--gmpx-color-surface', '#ffffff');
          autocomplete.style.setProperty('--gmpx-color-on-surface', '#3A2414');
          autocomplete.style.setProperty('--gmpx-color-outline', '#8a9281');
          autocomplete.style.backgroundColor = '#ffffff';
          autocomplete.style.color = '#3A2414';
          autocomplete.style.borderRadius = '6px';
          autocomplete.style.width = '100%';

          autocomplete.addEventListener('gmp-select', (event: Event) => {
            void (async () => {
              const { placePrediction } = event as unknown as {
                placePrediction: { toPlace: () => google.maps.places.Place };
              };
              const place = placePrediction.toPlace();
              await place.fetchFields({ fields: ['location', 'viewport'] });

              if (place.viewport) {
                map.fitBounds(place.viewport);
              } else if (place.location) {
                map.panTo(place.location);
                map.setZoom(15);
              }
            })();
          });

          searchHostRef.current.innerHTML = '';
          searchHostRef.current.appendChild(autocomplete);
        }

        mapRef.current = map;
        setMapLoaded(true);
      } catch (err) {
        if (isMounted) {
          setMapError(err instanceof Error ? err.message : 'Failed to load map');
        }
      }
    }

    void init();

    return () => {
      isMounted = false;
      if (pickupMarkerRef.current) pickupMarkerRef.current.setMap(null);
      if (dropMarkerRef.current) dropMarkerRef.current.setMap(null);
      if (polylineRef.current) polylineRef.current.setMap(null);
      if (zoneLayerRef.current) {
        zoneLayerRef.current.setMap(null);
        zoneLayerRef.current = null;
      }
      mapRef.current = null;
    };
  }, []);

  // 2. Sync Pickup Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!pickup) {
      if (pickupMarkerRef.current) {
        pickupMarkerRef.current.setMap(null);
        pickupMarkerRef.current = null;
      }
      return;
    }

    const pos = { lat: pickup.lat, lng: pickup.lng };
    const pickupIndia = isPointInIndia(pickup);
    const pickupColor = pickupIndia.inside ? '#1a7f37' : '#cf222e';
    const pickupText = pickupIndia.inside ? 'P' : '!';
    const pickupTitle = pickupIndia.inside
      ? 'Pickup (P)'
      : `Pickup: RESTRICTED (${pickupIndia.country ?? 'Outside India'})`;

    const iconConfig = {
      url: PICKUP_ICON_SVG(pickupColor, '#ffffff', pickupText),
      scaledSize: new google.maps.Size(34, 44),
      anchor: new google.maps.Point(17, 44),
    };

    if (!pickupMarkerRef.current) {
      const marker = new google.maps.Marker({
        position: pos,
        map,
        title: pickupTitle,
        draggable: true,
        icon: iconConfig,
      });

      marker.addListener('dragend', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
          onPickupChangeRef.current({
            lat: Number(e.latLng.lat().toFixed(6)),
            lng: Number(e.latLng.lng().toFixed(6)),
          });
        }
      });

      pickupMarkerRef.current = marker;
    } else {
      pickupMarkerRef.current.setPosition(pos);
      pickupMarkerRef.current.setIcon(iconConfig);
      pickupMarkerRef.current.setTitle(pickupTitle);
    }
  }, [pickup, mapLoaded]);

  // 3. Sync Drop Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!drop) {
      if (dropMarkerRef.current) {
        dropMarkerRef.current.setMap(null);
        dropMarkerRef.current = null;
      }
      return;
    }

    const pos = { lat: drop.lat, lng: drop.lng };
    const dropIndia = isPointInIndia(drop);
    const dropColor = dropIndia.inside ? '#cf222e' : '#7f1d1d';
    const dropText = dropIndia.inside ? 'D' : '!';
    const dropTitle = dropIndia.inside
      ? 'Drop (D)'
      : `Drop: RESTRICTED (${dropIndia.country ?? 'Outside India'})`;

    const iconConfig = {
      url: DROP_ICON_SVG(dropColor, '#ffffff', dropText),
      scaledSize: new google.maps.Size(34, 44),
      anchor: new google.maps.Point(17, 44),
    };

    if (!dropMarkerRef.current) {
      const marker = new google.maps.Marker({
        position: pos,
        map,
        title: dropTitle,
        draggable: true,
        icon: iconConfig,
      });

      marker.addListener('dragend', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
          onDropChangeRef.current({
            lat: Number(e.latLng.lat().toFixed(6)),
            lng: Number(e.latLng.lng().toFixed(6)),
          });
        }
      });

      dropMarkerRef.current = marker;
    } else {
      dropMarkerRef.current.setPosition(pos);
      dropMarkerRef.current.setIcon(iconConfig);
      dropMarkerRef.current.setTitle(dropTitle);
    }
  }, [drop, mapLoaded]);

  // 4. Sync Connecting Polyline between Pickup and Drop
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (pickup && drop) {
      const path = [
        { lat: pickup.lat, lng: pickup.lng },
        { lat: drop.lat, lng: drop.lng },
      ];
      const isDomestic = isPointInIndia(pickup).inside && isPointInIndia(drop).inside;
      const strokeColor = isDomestic ? '#3f6212' : '#cf222e';

      if (!polylineRef.current) {
        polylineRef.current = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor,
          strokeOpacity: 0.8,
          strokeWeight: 3,
          map,
        });
      } else {
        polylineRef.current.setPath(path);
        polylineRef.current.setOptions({ strokeColor });
        polylineRef.current.setMap(map);
      }
    } else if (polylineRef.current) {
      polylineRef.current.setMap(null);
    }
  }, [pickup, drop, mapLoaded]);

  // 5. Sync Active Zones polygon layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!zoneLayerRef.current) {
      const layer = new google.maps.Data({ map });
      layer.setStyle({
        fillColor: '#10b981',
        fillOpacity: 0.12,
        strokeColor: '#059669',
        strokeWeight: 2,
        strokeOpacity: 0.7,
        clickable: false,
      });
      zoneLayerRef.current = layer;
    }

    const layer = zoneLayerRef.current;
    layer.forEach((feature) => layer.remove(feature));

    if (zones && zones.length > 0) {
      layer.addGeoJson(zonesToFeatureCollection(zones, null, false));
    }
  }, [zones, mapLoaded]);

  return (
    <div className={`relative w-full h-full min-h-[460px] rounded-lg overflow-hidden border border-border ${className}`}>
      {!hasApiKey && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-surface-sunken text-center">
          <p className="text-sm font-semibold text-text">Google Maps API key not configured</p>
          <p className="text-xs text-text-subtle mt-1 max-w-sm">
            Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable interactive map clicks. You can still type exact coordinates in the control panel.
          </p>
        </div>
      )}

      {mapError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-surface-sunken text-center">
          <p className="text-sm font-semibold text-danger">Failed to load Google Maps</p>
          <p className="text-xs text-text-subtle mt-1">{mapError}</p>
        </div>
      )}

      {/* Place search overlay */}
      <div className="absolute top-3 left-3 z-10 w-72 max-w-[calc(100%-24px)] shadow-md">
        <div ref={searchHostRef} className="dz-place-search w-full" />
      </div>

      {/* Target indicator banner */}
      <div className="absolute bottom-3 left-3 z-10 bg-surface/90 backdrop-blur-sm border border-border px-3 py-1.5 rounded-md text-xs text-text shadow-sm flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">Click map to set:</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
              activeTarget === 'pickup'
                ? 'bg-success/20 text-success'
                : activeTarget === 'drop'
                  ? 'bg-danger/20 text-danger'
                  : 'bg-surface-muted text-text-subtle'
            }`}
          >
            {activeTarget === 'pickup' ? 'Pickup (P)' : activeTarget === 'drop' ? 'Drop (D)' : 'Next Point'}
          </span>
          <span className="text-[11px] text-text-subtle hidden sm:inline">(markers are draggable)</span>
        </div>
        {zones && zones.length > 0 && (
          <div className="flex items-center gap-1.5 border-l border-border pl-3 text-text-subtle text-[11px]">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-600" />
            <span>Active City Zone</span>
          </div>
        )}
      </div>

      <div ref={containerRef} className="w-full h-full min-h-[460px]" />
    </div>
  );
}
