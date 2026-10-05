'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Car,
  Compass,
  Crosshair,
  Gauge,
  Layers,
  MapPin,
  Navigation,
  Phone,
  Radio,
  RefreshCw,
  X,
  Zap,
} from 'lucide-react';
import type { DispatchFleetDriverDto, VehicleCategory } from '@cabzone/contracts';
import { Badge, Button, cn } from '@cabzone/design-system';
import { ACTIVE_RIDE_STATUSES, type AdminRideDto } from '@/lib/api/endpoints/rides';
import { DEFAULT_CENTER, hasApiKey, loadMapLibraries } from '@/lib/googleMaps';
import { useZones } from '@/features/zones/hooks/useZones';
import {
  zonesToFeatureCollection,
  zoneFeatureStyle,
  type ZoneFeatureProperties,
} from '@/features/zones/lib/zone-layers';
import { useDispatchFleet, useSimulateFleet } from '../hooks/useDispatchFleet';

const CATEGORIES: { label: string; value: 'ALL' | VehicleCategory }[] = [
  { label: 'All Fleet', value: 'ALL' },
  { label: 'Cabs', value: 'CAB' },
  { label: 'E-Rickshaws', value: 'E_RICKSHAW' },
];

function getCategoryColor(category: VehicleCategory, isBusy: boolean): string {
  if (isBusy) return '#f59e0b'; // Amber for busy
  return category === 'CAB' ? '#3b82f6' : '#10b981';
}

function getCategoryIconSvg(category: VehicleCategory): string {
  if (category === 'CAB') {
    return '<path d="M11 20l2-6h10l2 6v4h-2v-1H13v1h-2v-4zm3-5l-1.33 4h10.66L22 15H14zm-1 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm10 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" fill="#ffffff"/>';
  }
  return '<path d="M19 9l-6 9h5l-2 9 8-11h-5l2-7z" fill="#ffffff"/>';
}

function buildDriverMarkerSvg(category: VehicleCategory, isBusy: boolean, heading: number | null): string {
  const color = getCategoryColor(category, isBusy);
  const iconPath = getCategoryIconSvg(category);
  const headingArrow =
    heading !== null
      ? `<g transform="rotate(${heading}, 18, 18)"><polygon points="18,1 22,7 14,7" fill="${color}" stroke="#ffffff" stroke-width="1"/></g>`
      : '';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
      ${headingArrow}
      <circle cx="18" cy="18" r="14" fill="${color}" stroke="#ffffff" stroke-width="2"/>
      ${iconPath}
      ${isBusy ? '<circle cx="26" cy="10" r="4" fill="#ef4444" stroke="#ffffff" stroke-width="1.5"/>' : ''}
    </svg>
  `.trim();
}

function buildPinSvg(type: 'pickup' | 'drop'): string {
  const isPickup = type === 'pickup';
  const color = isPickup ? '#10b981' : '#ef4444';
  const label = isPickup ? 'P' : 'D';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
      <circle cx="15" cy="15" r="13" fill="${color}" stroke="#ffffff" stroke-width="2"/>
      <text x="15" y="19" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle" fill="#ffffff">${label}</text>
    </svg>
  `.trim();
}

export interface RideDispatchMapProps {
  rides: AdminRideDto[];
  onSelectRide: (ride: AdminRideDto) => void;
  selectedRideId?: string | null;
  className?: string;
}

export function RideDispatchMap({
  rides,
  onSelectRide,
  selectedRideId,
  className,
}: RideDispatchMapProps) {
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | VehicleCategory>('ALL');
  const [selectedDriver, setSelectedDriver] = useState<DispatchFleetDriverDto | null>(null);
  const [layers, setLayers] = useState({ zones: true, rides: true, drivers: true });
  const [googleReady, setGoogleReady] = useState(false);

  // Queries
  const { data: zonesData } = useZones({ status: 'ACTIVE' });
  const zones = useMemo(() => zonesData?.zones ?? [], [zonesData]);
  const { data: fleet = [], refetch: refetchFleet, isFetching: isFetchingFleet } = useDispatchFleet({
    vehicleCategory: selectedCategory === 'ALL' ? undefined : selectedCategory,
  });
  const simulateFleet = useSimulateFleet();

  // Active rides filtering
  const activeRides = useMemo(
    () => rides.filter((r) => ACTIVE_RIDE_STATUSES.includes(r.status)),
    [rides],
  );

  const isSimulatedActive = useMemo(
    () => fleet.some((d) => d.driverId.startsWith('sim-driver-')),
    [fleet],
  );

  // Stats
  const onlineCount = fleet.filter((d) => d.status === 'ONLINE').length;
  const busyCount = fleet.filter((d) => d.status === 'BUSY').length;

  // Refs for Google Maps objects
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const zonesDataRef = useRef<google.maps.Data | null>(null);
  const driverMarkersRef = useRef<google.maps.Marker[]>([]);
  const rideOverlaysRef = useRef<{ markers: google.maps.Marker[]; polylines: google.maps.Polyline[] }>({
    markers: [],
    polylines: [],
  });

  // Initialize Google Maps instance
  useEffect(() => {
    if (!hasApiKey || !mapContainerRef.current || googleMapRef.current) return;

    let cancelled = false;
    void loadMapLibraries('places', 'geometry').then((libs) => {
      if (cancelled || !mapContainerRef.current) return;
      const gMaps = (libs['maps'] ?? window.google?.maps) as typeof google.maps;
      if (!gMaps) return;

      const map = new gMaps.Map(mapContainerRef.current, {
        center: DEFAULT_CENTER,
        zoom: 12,
        mapTypeId: 'roadmap',
        tilt: 0,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
      });

      const zoneData = new gMaps.Data();
      zoneData.setMap(map);
      zonesDataRef.current = zoneData;

      googleMapRef.current = map;
      setGoogleReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Update Zones Layer in Google Maps
  useEffect(() => {
    const dataLayer = zonesDataRef.current;
    if (!dataLayer || !googleReady) return;

    // Clear existing
    dataLayer.forEach((f) => dataLayer.remove(f));

    if (layers.zones && zones.length > 0) {
      const geojson = zonesToFeatureCollection(zones, null, false);
      dataLayer.addGeoJson(geojson);
      dataLayer.setStyle((feature) =>
        zoneFeatureStyle({
          id: String(feature.getProperty('id') ?? ''),
          type: (feature.getProperty('type') as ZoneFeatureProperties['type']) ?? 'CITY',
          name: String(feature.getProperty('name') ?? ''),
          selected: false,
          dimmed: false,
        }),
      );
    }
  }, [googleReady, zones, layers.zones]);

  // Update Drivers Layer in Google Maps
  useEffect(() => {
    const map = googleMapRef.current;
    if (!map || !googleReady) return;

    // Remove previous driver markers
    for (const m of driverMarkersRef.current) m.setMap(null);
    driverMarkersRef.current = [];

    if (!layers.drivers) return;

    const gMaps = window.google?.maps;
    if (!gMaps) return;

    for (const driver of fleet) {
      const isBusy = driver.status === 'BUSY';
      const svg = buildDriverMarkerSvg(driver.vehicleCategory, isBusy, driver.heading);
      const icon = {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        scaledSize: new gMaps.Size(36, 36),
        anchor: new gMaps.Point(18, 18),
      };

      const marker = new gMaps.Marker({
        position: { lat: driver.lat, lng: driver.lng },
        map,
        icon,
        title: `${driver.driverName ?? 'Driver'} (${driver.vehicleCategory})`,
      });

      marker.addListener('click', () => {
        setSelectedDriver(driver);
      });

      driverMarkersRef.current.push(marker);
    }
  }, [googleReady, fleet, layers.drivers]);

  // Update Active Rides Layer in Google Maps
  useEffect(() => {
    const map = googleMapRef.current;
    if (!map || !googleReady) return;

    for (const m of rideOverlaysRef.current.markers) m.setMap(null);
    for (const p of rideOverlaysRef.current.polylines) p.setMap(null);
    rideOverlaysRef.current = { markers: [], polylines: [] };

    if (!layers.rides) return;

    const gMaps = window.google?.maps;
    if (!gMaps) return;

    const pickupSvg = buildPinSvg('pickup');
    const dropSvg = buildPinSvg('drop');

    const pickupIcon = {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(pickupSvg)}`,
      scaledSize: new gMaps.Size(30, 30),
      anchor: new gMaps.Point(15, 15),
    };

    const dropIcon = {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(dropSvg)}`,
      scaledSize: new gMaps.Size(30, 30),
      anchor: new gMaps.Point(15, 15),
    };

    for (const ride of activeRides) {
      const isSelected = ride.id === selectedRideId;

      // Pickup marker
      const pMarker = new gMaps.Marker({
        position: { lat: ride.pickup.lat, lng: ride.pickup.lng },
        map,
        icon: pickupIcon,
        title: `Pickup: ${ride.passenger.name}`,
        zIndex: isSelected ? 100 : 10,
      });
      pMarker.addListener('click', () => onSelectRide(ride));
      rideOverlaysRef.current.markers.push(pMarker);

      // Drop marker
      const dMarker = new gMaps.Marker({
        position: { lat: ride.drop.lat, lng: ride.drop.lng },
        map,
        icon: dropIcon,
        title: `Drop: ${ride.passenger.name}`,
        zIndex: isSelected ? 100 : 10,
      });
      dMarker.addListener('click', () => onSelectRide(ride));
      rideOverlaysRef.current.markers.push(dMarker);

      // Polyline vector
      const polyline = new gMaps.Polyline({
        path: [
          { lat: ride.pickup.lat, lng: ride.pickup.lng },
          { lat: ride.drop.lat, lng: ride.drop.lng },
        ],
        map,
        strokeColor: isSelected ? '#ec4899' : '#2563eb',
        strokeOpacity: isSelected ? 1.0 : 0.75,
        strokeWeight: isSelected ? 4 : 2.5,
        zIndex: isSelected ? 50 : 5,
      });
      polyline.addListener('click', () => onSelectRide(ride));
      rideOverlaysRef.current.polylines.push(polyline);
    }
  }, [googleReady, activeRides, layers.rides, selectedRideId, onSelectRide]);

  // Recenter / Fit Bounds handler
  const handleRecenter = useCallback(() => {
    if (!googleMapRef.current) return;
    googleMapRef.current.panTo(DEFAULT_CENTER);
    googleMapRef.current.setZoom(12);
  }, []);

  // Bounds for SVG radar fallback
  // Siliguri Metro bounds: lat 26.65 to 26.78, lng 88.30 to 88.50
  const svgBounds = useMemo(() => {
    return { minLat: 26.66, maxLat: 26.78, minLng: 88.31, maxLng: 88.48 };
  }, []);

  const projectToSvg = useCallback(
    (lat: number, lng: number, width = 800, height = 500) => {
      const x = ((lng - svgBounds.minLng) / (svgBounds.maxLng - svgBounds.minLng)) * width;
      const y = ((svgBounds.maxLat - lat) / (svgBounds.maxLat - svgBounds.minLat)) * height;
      return { x: Math.max(20, Math.min(width - 20, x)), y: Math.max(20, Math.min(height - 20, y)) };
    },
    [svgBounds],
  );

  return (
    <div className={cn('flex flex-col gap-3 w-full bg-surface border border-border rounded-xl overflow-hidden shadow-sm', className)}>
      {/* Top Operations Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-border bg-surface-muted/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <span className="font-semibold text-sm tracking-wide text-text uppercase">
              Live Dispatch Radar
            </span>
          </div>

          <div className="h-4 w-px bg-border mx-1" />

          {/* Quick Counter Badges */}
          <div className="flex items-center gap-2">
            <Badge tone="accent" className="font-mono text-xs">
              {activeRides.length} Active Trips
            </Badge>
            <Badge tone="info" className="font-mono text-xs">
              {fleet.length} Drivers Online ({onlineCount} Idle / {busyCount} Busy)
            </Badge>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <div className="flex items-center rounded-lg bg-surface border border-border p-0.5 text-xs">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setSelectedCategory(c.value)}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium transition-colors',
                  selectedCategory === c.value
                    ? 'bg-interactive text-text-inverse shadow-xs'
                    : 'text-text-subtle hover:text-text',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Layer Toggles */}
          <div className="flex items-center gap-1 bg-surface border border-border rounded-lg px-2 py-1 text-xs">
            <Layers className="size-3.5 text-text-subtle mr-1" />
            <label className="flex items-center gap-1 cursor-pointer text-text-subtle hover:text-text">
              <input
                type="checkbox"
                checked={layers.zones}
                onChange={(e) => setLayers((l) => ({ ...l, zones: e.target.checked }))}
                className="rounded-xs text-interactive"
              />
              Zones
            </label>
            <label className="flex items-center gap-1 cursor-pointer text-text-subtle hover:text-text ml-2">
              <input
                type="checkbox"
                checked={layers.rides}
                onChange={(e) => setLayers((l) => ({ ...l, rides: e.target.checked }))}
                className="rounded-xs text-interactive"
              />
              Trips
            </label>
            <label className="flex items-center gap-1 cursor-pointer text-text-subtle hover:text-text ml-2">
              <input
                type="checkbox"
                checked={layers.drivers}
                onChange={(e) => setLayers((l) => ({ ...l, drivers: e.target.checked }))}
                className="rounded-xs text-interactive"
              />
              Drivers
            </label>
          </div>

          {/* Simulate Fleet Button */}
          <Button
            size="sm"
            variant={isSimulatedActive ? 'secondary' : 'primary'}
            loading={simulateFleet.isPending}
            icon={<Zap className={cn('size-3.5', isSimulatedActive ? 'text-amber-500 fill-amber-500' : '')} />}
            onClick={() => simulateFleet.mutate({ enabled: !isSimulatedActive })}
          >
            {isSimulatedActive ? 'Clear Fleet' : '⚡ Simulate Fleet (Siliguri)'}
          </Button>

          {/* Recenter / Refresh */}
          {hasApiKey && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Crosshair className="size-3.5" />}
              onClick={handleRecenter}
              title="Recenter on Siliguri"
            >
              Center
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw className={cn('size-3.5', isFetchingFleet ? 'animate-spin' : '')} />}
            onClick={() => void refetchFleet()}
            title="Refresh Radar"
          />
        </div>
      </div>

      {/* Main Map View Area */}
      <div className="relative w-full h-[580px] bg-slate-950 overflow-hidden">
        {hasApiKey ? (
          // Google Map Container
          <div ref={mapContainerRef} className="w-full h-full" />
        ) : (
          // Stylized Interactive SVG Radar Canvas (when API key is missing or testing)
          <div className="relative w-full h-full bg-[#0a0f1d] flex items-center justify-center select-none overflow-hidden">
            <svg
              className="w-full h-full"
              viewBox="0 0 800 500"
              preserveAspectRatio="xMidYMid slice"
            >
              <defs>
                <radialGradient id="radarGridGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#1e293b" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#0a0f1d" stopOpacity="0.8" />
                </radialGradient>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" />
                </pattern>
              </defs>

              {/* Background Radar Rings and Grid */}
              <rect width="800" height="500" fill="url(#grid)" />
              <rect width="800" height="500" fill="url(#radarGridGlow)" />

              {/* Concentric Radar Distance Rings */}
              <circle cx="400" cy="250" r="80" fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx="400" cy="250" r="160" fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
              <circle cx="400" cy="250" r="240" fill="none" stroke="#1e293b" strokeWidth="1" />
              <line x1="400" y1="0" x2="400" y2="500" stroke="#1e293b" strokeWidth="1" />
              <line x1="0" y1="250" x2="800" y2="250" stroke="#1e293b" strokeWidth="1" />

              {/* Siliguri Center Marker */}
              <circle cx="400" cy="250" r="3" fill="#64748b" />
              <text x="408" y="254" fill="#64748b" fontSize="10" fontFamily="sans-serif">Siliguri City Center</text>

              {/* City Zones Layer */}
              {layers.zones && (
                <g opacity="0.35">
                  <polygon
                    points="320,160 480,180 540,320 420,380 290,310 280,210"
                    fill="#3b82f6"
                    stroke="#60a5fa"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                  />
                  <text x="380" y="210" fill="#93c5fd" fontSize="11" fontWeight="600" opacity="0.7">
                    SILIGURI METRO ZONE
                  </text>
                </g>
              )}

              {/* Active Rides Layer */}
              {layers.rides &&
                activeRides.map((ride) => {
                  const pPos = projectToSvg(ride.pickup.lat, ride.pickup.lng);
                  const dPos = projectToSvg(ride.drop.lat, ride.drop.lng);
                  const isSelected = ride.id === selectedRideId;

                  return (
                    <g key={ride.id} className="cursor-pointer" onClick={() => onSelectRide(ride)}>
                      {/* Polyline Vector */}
                      <line
                        x1={pPos.x}
                        y1={pPos.y}
                        x2={dPos.x}
                        y2={dPos.y}
                        stroke={isSelected ? '#f43f5e' : '#3b82f6'}
                        strokeWidth={isSelected ? '3' : '2'}
                        strokeDasharray={isSelected ? 'none' : '4 3'}
                        opacity="0.8"
                      />

                      {/* Pickup Pin */}
                      <circle cx={pPos.x} cy={pPos.y} r="10" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                      <text x={pPos.x} y={pPos.y + 4} fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle">
                        P
                      </text>

                      {/* Drop Pin */}
                      <circle cx={dPos.x} cy={dPos.y} r="10" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                      <text x={dPos.x} y={dPos.y + 4} fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle">
                        D
                      </text>

                      {/* Status Tag on Polyline midpoint */}
                      <g transform={`translate(${(pPos.x + dPos.x) / 2}, ${(pPos.y + dPos.y) / 2 - 8})`}>
                        <rect x="-35" y="-9" width="70" height="18" rx="4" fill="#0f172a" stroke="#334155" strokeWidth="1" />
                        <text x="0" y="3" fill="#cbd5e1" fontSize="8" fontWeight="600" textAnchor="middle">
                          {ride.status.replace('DRIVER_', '')}
                        </text>
                      </g>
                    </g>
                  );
                })}

              {/* Online Drivers Layer */}
              {layers.drivers &&
                fleet.map((driver) => {
                  const pos = projectToSvg(driver.lat, driver.lng);
                  const isBusy = driver.status === 'BUSY';
                  const color = getCategoryColor(driver.vehicleCategory, isBusy);
                  const isSelected = selectedDriver?.driverId === driver.driverId;

                  return (
                    <g
                      key={driver.driverId}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      className="cursor-pointer group"
                      onClick={() => setSelectedDriver(driver)}
                    >
                      {/* Pulse Halo for idle online drivers */}
                      {!isBusy && (
                        <circle cx="0" cy="0" r="18" fill={color} opacity="0.2">
                          <animate attributeName="r" values="14;22;14" dur="3s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.3;0;0.3" dur="3s" repeatCount="indefinite" />
                        </circle>
                      )}

                      {/* Driver Marker Circle */}
                      <circle
                        cx="0"
                        cy="0"
                        r={isSelected ? '14' : '12'}
                        fill={color}
                        stroke="#ffffff"
                        strokeWidth={isSelected ? '2.5' : '1.5'}
                      />

                      {/* Heading Arrow indicator */}
                      {driver.heading !== null && (
                        <g transform={`rotate(${driver.heading})`}>
                          <polygon points="0,-16 4,-11 -4,-11" fill={color} stroke="#ffffff" strokeWidth="0.75" />
                        </g>
                      )}

                      {/* Category Label */}
                      <text x="0" y="3.5" fill="#ffffff" fontSize="8" fontWeight="bold" textAnchor="middle">
                        {driver.vehicleCategory === 'CAB' ? 'C' : 'E'}
                      </text>

                      {/* Busy indicator badge */}
                      {isBusy && <circle cx="8" cy="-8" r="3.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1" />}

                      {/* Hover / Identifier Label */}
                      <g className="opacity-0 group-hover:opacity-100 transition-opacity" transform="translate(0, 20)">
                        <rect x="-40" y="-8" width="80" height="16" rx="3" fill="#0f172a" stroke="#475569" strokeWidth="0.5" />
                        <text x="0" y="3" fill="#f8fafc" fontSize="8" textAnchor="middle">
                          {driver.driverName ?? driver.driverId.slice(0, 8)}
                        </text>
                      </g>
                    </g>
                  );
                })}
            </svg>

            {/* Notice Footer inside Schematic Radar */}
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs text-slate-400 bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-lg px-3 py-1.5 pointer-events-none">
              <span className="flex items-center gap-1.5">
                <Radio className="size-3.5 text-emerald-400 animate-pulse" />
                Schematic Radar Active · Realtime Driver Coordinates Plotted
              </span>
              <span>
                Set <code className="text-slate-200">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> for Satellite & Hybrid Google Basemap
              </span>
            </div>
          </div>
        )}

        {/* Selected Driver Telemetry Card Overlay */}
        {selectedDriver && (
          <div className="absolute top-4 right-4 z-20 w-80 bg-surface/95 backdrop-blur-md border border-border shadow-xl rounded-xl p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="size-9 rounded-lg flex items-center justify-center text-text-inverse font-bold text-xs"
                  style={{ backgroundColor: getCategoryColor(selectedDriver.vehicleCategory, selectedDriver.status === 'BUSY') }}
                >
                  <Car className="size-4 text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-sm text-text leading-tight">
                    {selectedDriver.driverName ?? 'Driver'}
                  </span>
                  <span className="text-xs text-text-subtle font-mono">
                    {selectedDriver.driverId.slice(0, 12)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDriver(null)}
                className="text-text-subtle hover:text-text p-1 rounded-md transition-colors"
                aria-label="Close driver card"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Status & Category Pills */}
            <div className="flex items-center gap-2">
              <Badge tone={selectedDriver.status === 'ONLINE' ? 'success' : 'warning'}>
                {selectedDriver.status === 'ONLINE' ? 'AVAILABLE (IDLE)' : 'BUSY (ON RIDE)'}
              </Badge>
              <Badge tone="neutral">{selectedDriver.vehicleCategory}</Badge>
            </div>

            {/* Telemetry Metrics */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-surface-muted/60 rounded-lg p-2.5 border border-border/50">
              <div className="flex items-center gap-1.5">
                <Gauge className="size-3.5 text-text-subtle shrink-0" />
                <span className="text-text-subtle">Speed:</span>
                <span className="font-mono font-medium text-text">
                  {selectedDriver.speedMps !== null
                    ? `${Math.round(selectedDriver.speedMps * 3.6)} km/h`
                    : '0 km/h'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Compass className="size-3.5 text-text-subtle shrink-0" />
                <span className="text-text-subtle">Heading:</span>
                <span className="font-mono font-medium text-text">
                  {selectedDriver.heading !== null ? `${selectedDriver.heading}°` : '—'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 col-span-2">
                <MapPin className="size-3.5 text-text-subtle shrink-0" />
                <span className="text-text-subtle">GPS:</span>
                <span className="font-mono text-text font-medium">
                  {selectedDriver.lat.toFixed(4)}, {selectedDriver.lng.toFixed(4)}
                </span>
              </div>
              {selectedDriver.vehicleRegistration && (
                <div className="flex items-center gap-1.5 col-span-2">
                  <Car className="size-3.5 text-text-subtle shrink-0" />
                  <span className="text-text-subtle">Reg:</span>
                  <span className="font-mono text-text font-medium">
                    {selectedDriver.vehicleRegistration}
                  </span>
                </div>
              )}
              {selectedDriver.phoneE164 && (
                <div className="flex items-center gap-1.5 col-span-2">
                  <Phone className="size-3.5 text-text-subtle shrink-0" />
                  <span className="text-text-subtle">Phone:</span>
                  <span className="font-mono text-text font-medium">
                    {selectedDriver.phoneE164}
                  </span>
                </div>
              )}
            </div>

            {/* Busy Ride Link */}
            {selectedDriver.activeRideId && (
              <Button
                size="sm"
                variant="secondary"
                className="w-full text-xs"
                icon={<Navigation className="size-3.5" />}
                onClick={() => {
                  const ride = rides.find((r) => r.id === selectedDriver.activeRideId);
                  if (ride) onSelectRide(ride);
                }}
              >
                Inspect Associated Ride ({selectedDriver.activeRideId.slice(0, 8)})
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
