'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe,
  Grid,
  Layers,
  Minus,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useGoogleMaps } from '../lib/useGoogleMaps.js';
import type { GeoJsonGeometry, GeoJsonPolygon, Position, ZoneDto } from '../types/zones.js';

interface ZoneMapProps {
  zones: ZoneDto[];
  selectedZoneId?: string | null | undefined;
  onSelectZone: (zone: ZoneDto) => void;
  draftGeometry?: GeoJsonPolygon | null;
  onDraftChange?: (geometry: GeoJsonPolygon | null) => void;
  isDrawing?: boolean;
  onToggleDrawing?: () => void;
}

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#020617' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#e2e8f0' }],
  },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#064e3b' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0f172a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1e293b' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#020617' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#38bdf8' }] },
];

export function ZoneMap({
  zones,
  selectedZoneId,
  onSelectZone,
  draftGeometry,
  onDraftChange,
  isDrawing = false,
  onToggleDrawing,
}: ZoneMapProps) {
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const { isLoaded: isGoogleLoaded } = useGoogleMaps(googleMapsApiKey);

  const [mapProvider, setMapProvider] = useState<'google' | 'vector'>('google');
  const [mapType, setMapType] = useState<'dark' | 'roadmap' | 'satellite' | 'hybrid'>('dark');

  // SVG Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Draft drawing points: array of [lng, lat]
  const [drawingPoints, setDrawingPoints] = useState<Position[]>([]);

  // Google Map refs
  const googleMapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const draftPolylineRef = useRef<google.maps.Polyline | null>(null);
  const draftMarkersRef = useRef<google.maps.Marker[]>([]);

  // 1. Compute global bounding box across all zones
  const bbox = useMemo(() => {
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    const includePos = (pos: Position) => {
      const lng = pos[0];
      const lat = pos[1];
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    };

    const processGeom = (g: GeoJsonGeometry) => {
      if (g.type === 'Polygon') {
        for (const ring of g.coordinates) {
          for (const pos of ring) includePos(pos);
        }
      } else if (g.type === 'MultiPolygon') {
        for (const poly of g.coordinates) {
          for (const ring of poly) {
            for (const pos of ring) includePos(pos);
          }
        }
      }
    };

    for (const z of zones) {
      if (z.geometry) processGeom(z.geometry);
      else if (z.boundary) processGeom(z.boundary);
    }

    if (draftGeometry) processGeom(draftGeometry);
    for (const p of drawingPoints) includePos(p);

    if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) {
      // Default fallback: Siliguri region
      return { minLng: 88.35, minLat: 26.65, maxLng: 88.55, maxLat: 26.85 };
    }

    const dLng = (maxLng - minLng) * 0.1 || 0.05;
    const dLat = (maxLat - minLat) * 0.1 || 0.05;

    return {
      minLng: minLng - dLng,
      minLat: minLat - dLat,
      maxLng: maxLng + dLng,
      maxLat: maxLat + dLat,
    };
  }, [zones, draftGeometry, drawingPoints]);

  const SVG_WIDTH = 1000;
  const SVG_HEIGHT = 700;

  // Project geographic coordinates [lng, lat] to SVG coordinates [x, y]
  const project = (lng: number, lat: number): [number, number] => {
    const x = ((lng - bbox.minLng) / (bbox.maxLng - bbox.minLng)) * SVG_WIDTH;
    const y = SVG_HEIGHT - ((lat - bbox.minLat) / (bbox.maxLat - bbox.minLat)) * SVG_HEIGHT;
    return [x, y];
  };

  // Inverse project from SVG [x, y] back to [lng, lat]
  const unproject = (x: number, y: number): Position => {
    const lng = bbox.minLng + (x / SVG_WIDTH) * (bbox.maxLng - bbox.minLng);
    const lat = bbox.minLat + ((SVG_HEIGHT - y) / SVG_HEIGHT) * (bbox.maxLat - bbox.minLat);
    return [Math.round(lng * 10000) / 10000, Math.round(lat * 10000) / 10000];
  };

  const ringToSvgPath = (ring: Position[]): string => {
    if (!ring || ring.length < 2) return '';
    return (
      ring
        .map((pos, idx) => {
          const [x, y] = project(pos[0], pos[1]);
          return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ') + ' Z'
    );
  };

  // Initialize and update Google Map instance
  useEffect(() => {
    if (!isGoogleLoaded || mapProvider !== 'google' || !googleMapRef.current) {
      return;
    }

    if (!mapInstanceRef.current) {
      const centerLat = (bbox.minLat + bbox.maxLat) / 2;
      const centerLng = (bbox.minLng + bbox.maxLng) / 2;

      mapInstanceRef.current = new window.google.maps.Map(googleMapRef.current, {
        center: { lat: centerLat, lng: centerLng },
        zoom: 12,
        styles: mapType === 'dark' ? DARK_MAP_STYLES : [],
        mapTypeId:
          mapType === 'satellite'
            ? 'satellite'
            : mapType === 'hybrid'
              ? 'hybrid'
              : 'roadmap',
        disableDefaultUI: true,
        zoomControl: false,
        gestureHandling: isDrawing ? 'none' : 'greedy',
      });
    } else {
      mapInstanceRef.current.setOptions({
        styles: mapType === 'dark' ? DARK_MAP_STYLES : [],
        mapTypeId:
          mapType === 'satellite'
            ? 'satellite'
            : mapType === 'hybrid'
              ? 'hybrid'
              : 'roadmap',
        gestureHandling: isDrawing ? 'none' : 'greedy',
        draggableCursor: isDrawing ? 'crosshair' : 'grab',
      });
    }

    const map = mapInstanceRef.current;

    // Clear previous polygons
    polygonsRef.current.forEach((p) => p.setMap(null));
    polygonsRef.current = [];

    // Render zones
    const bounds = new window.google.maps.LatLngBounds();
    let hasPoints = false;

    zones.forEach((zone) => {
      const isSelected = zone.id === selectedZoneId;
      const zoneType = zone.zoneType ?? zone.type;
      const geom = zone.geometry ?? zone.boundary;
      if (!geom) return;

      const polygons = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;

      let strokeColor = '#38bdf8';
      let fillColor = '#38bdf8';
      let fillOpacity = 0.18;

      if (zoneType === 'PICKUP') {
        strokeColor = '#10b981';
        fillColor = '#10b981';
        fillOpacity = 0.22;
      } else if (zoneType === 'EXCLUSION') {
        strokeColor = '#f43f5e';
        fillColor = '#f43f5e';
        fillOpacity = 0.35;
      }

      if (isSelected) {
        strokeColor = '#fbbf24';
        fillOpacity = 0.35;
      }

      polygons.forEach((polyCoords) => {
        const paths = polyCoords.map((ring) =>
          ring.map((pos) => {
            const latLng = { lat: pos[1], lng: pos[0] };
            bounds.extend(latLng);
            hasPoints = true;
            return latLng;
          }),
        );

        const polygon = new window.google.maps.Polygon({
          paths,
          strokeColor,
          strokeOpacity: isSelected ? 1.0 : 0.85,
          strokeWeight: isSelected ? 3.5 : 2,
          fillColor,
          fillOpacity,
          map,
        });

        polygon.addListener('click', () => {
          onSelectZone(zone);
        });

        polygonsRef.current.push(polygon);
      });
    });

    if (hasPoints && !isDrawing) {
      map.fitBounds(bounds, 40);
    }
  }, [isGoogleLoaded, mapProvider, mapType, zones, selectedZoneId, bbox, isDrawing, onSelectZone]);

  // Handle Google Maps drawing clicks & draft polyline
  useEffect(() => {
    if (!isGoogleLoaded || mapProvider !== 'google' || !mapInstanceRef.current) {
      return;
    }

    const map = mapInstanceRef.current;

    // Clear existing draft graphics
    if (draftPolylineRef.current) {
      draftPolylineRef.current.setMap(null);
      draftPolylineRef.current = null;
    }
    draftMarkersRef.current.forEach((m) => m.setMap(null));
    draftMarkersRef.current = [];

    // Live click handler when drawing
    let clickListener: google.maps.MapsEventListener | null = null;

    if (isDrawing) {
      clickListener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const lat = Math.round(e.latLng.lat() * 100000) / 100000;
        const lng = Math.round(e.latLng.lng() * 100000) / 100000;
        const next: Position[] = [...drawingPoints, [lng, lat]];
        setDrawingPoints(next);

        if (next.length >= 4) {
          const closedRing = [...next, next[0]!];
          onDraftChange?.({
            type: 'Polygon',
            coordinates: [closedRing],
          });
        }
      });
    }

    // Render active drawing points & polyline
    if (drawingPoints.length > 0) {
      const path = drawingPoints.map((p) => ({ lat: p[1], lng: p[0] }));

      draftPolylineRef.current = new window.google.maps.Polyline({
        path,
        strokeColor: '#fbbf24',
        strokeOpacity: 0.9,
        strokeWeight: 2.5,
        map,
      });

      drawingPoints.forEach((p, index) => {
        const marker = new window.google.maps.Marker({
          position: { lat: p[1], lng: p[0] },
          map,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: index === 0 ? '#10b981' : '#fbbf24',
            fillOpacity: 1,
            strokeColor: '#0f172a',
            strokeWeight: 2,
          },
        });
        draftMarkersRef.current.push(marker);
      });
    }

    return () => {
      if (clickListener) {
        window.google.maps.event.removeListener(clickListener);
      }
    };
  }, [isGoogleLoaded, mapProvider, isDrawing, drawingPoints, onDraftChange]);

  // Handle map click for SVG drawing mode
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing) return;

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const rawX = ((e.clientX - rect.left) / rect.width) * SVG_WIDTH;
    const rawY = ((e.clientY - rect.top) / rect.height) * SVG_HEIGHT;

    const svgX = (rawX - SVG_WIDTH / 2 - pan.x) / zoom + SVG_WIDTH / 2;
    const svgY = (rawY - SVG_HEIGHT / 2 - pan.y) / zoom + SVG_HEIGHT / 2;

    const newPos = unproject(svgX, svgY);
    const nextPoints = [...drawingPoints, newPos];
    setDrawingPoints(nextPoints);

    if (nextPoints.length >= 4) {
      const closedRing = [...nextPoints, nextPoints[0]!];
      onDraftChange?.({
        type: 'Polygon',
        coordinates: [closedRing],
      });
    }
  };

  const handleFinishDrawing = () => {
    if (drawingPoints.length >= 3) {
      const closedRing = [...drawingPoints, drawingPoints[0]!];
      onDraftChange?.({
        type: 'Polygon',
        coordinates: [closedRing],
      });
      setDrawingPoints([]);
      onToggleDrawing?.();
    }
  };

  const handleResetDrawing = () => {
    setDrawingPoints([]);
    onDraftChange?.(null);
  };

  const handleUndoPoint = () => {
    const next = drawingPoints.slice(0, -1);
    setDrawingPoints(next);
    if (next.length >= 3) {
      onDraftChange?.({
        type: 'Polygon',
        coordinates: [[...next, next[0]!]],
      });
    } else {
      onDraftChange?.(null);
    }
  };

  const activeProvider = isGoogleLoaded && mapProvider === 'google' ? 'google' : 'vector';

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900 select-none overflow-hidden">
      {/* Top Left: Status & Layer Controls */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-xs text-white px-3 py-1.5 rounded-lg border border-slate-700 text-xs shadow-md">
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-semibold">{zones.length} Zones Rendered</span>
        </div>

        {/* Map Provider Selector */}
        <div className="flex items-center bg-slate-900/90 backdrop-blur-xs rounded-lg border border-slate-700 p-0.5 shadow-md text-xs">
          <button
            type="button"
            onClick={() => setMapProvider('google')}
            disabled={!isGoogleLoaded}
            className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
              activeProvider === 'google'
                ? 'bg-indigo-600 text-white font-medium'
                : 'text-slate-400 hover:text-white disabled:opacity-40'
            }`}
            title={isGoogleLoaded ? 'Switch to Google Maps' : 'Google Maps SDK loading...'}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Google Maps</span>
          </button>
          <button
            type="button"
            onClick={() => setMapProvider('vector')}
            className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
              activeProvider === 'vector'
                ? 'bg-indigo-600 text-white font-medium'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Switch to Vector Grid"
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Vector Grid</span>
          </button>
        </div>

        {/* Map Type Selector for Google Maps */}
        {activeProvider === 'google' && (
          <div className="flex items-center bg-slate-900/90 backdrop-blur-xs rounded-lg border border-slate-700 p-0.5 shadow-md text-xs">
            {(['dark', 'roadmap', 'satellite', 'hybrid'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setMapType(type)}
                className={`px-2 py-1 rounded capitalize transition-colors ${
                  mapType === type
                    ? 'bg-slate-700 text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        )}

        {isDrawing && (
          <div className="flex items-center gap-1.5 bg-amber-500 text-slate-950 font-semibold px-3 py-1.5 rounded-lg text-xs shadow-md animate-pulse">
            <Square className="w-3.5 h-3.5" />
            <span>Drawing Polygon ({drawingPoints.length} vertices)</span>
          </div>
        )}
      </div>

      {/* Top Right: Zoom & Drawing Controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        <div className="flex flex-col bg-slate-900/90 backdrop-blur-xs rounded-lg border border-slate-700 p-1 shadow-md text-white">
          <button
            type="button"
            onClick={() => {
              if (activeProvider === 'google' && mapInstanceRef.current) {
                mapInstanceRef.current.setZoom((mapInstanceRef.current.getZoom() ?? 12) + 1);
              } else {
                setZoom((z) => Math.min(z * 1.3, 5));
              }
            }}
            className="p-1.5 hover:bg-slate-800 rounded transition-colors"
            title="Zoom In"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeProvider === 'google' && mapInstanceRef.current) {
                mapInstanceRef.current.setZoom((mapInstanceRef.current.getZoom() ?? 12) - 1);
              } else {
                setZoom((z) => Math.max(z / 1.3, 0.5));
              }
            }}
            className="p-1.5 hover:bg-slate-800 rounded transition-colors"
            title="Zoom Out"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeProvider === 'google' && mapInstanceRef.current) {
                const centerLat = (bbox.minLat + bbox.maxLat) / 2;
                const centerLng = (bbox.minLng + bbox.maxLng) / 2;
                mapInstanceRef.current.setCenter({ lat: centerLat, lng: centerLng });
                mapInstanceRef.current.setZoom(12);
              } else {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }
            }}
            className="p-1.5 hover:bg-slate-800 rounded transition-colors"
            title="Reset View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {onToggleDrawing && (
          <div className="flex flex-col gap-1 bg-slate-900/90 backdrop-blur-xs rounded-lg border border-slate-700 p-1.5 shadow-md">
            <button
              type="button"
              onClick={onToggleDrawing}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 ${
                isDrawing
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <Square className="w-3.5 h-3.5" />
              <span>{isDrawing ? 'Cancel Draw' : 'Draw Polygon'}</span>
            </button>

            {isDrawing && (
              <>
                <button
                  type="button"
                  onClick={handleUndoPoint}
                  disabled={drawingPoints.length === 0}
                  className="px-2 py-1 text-[11px] bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 rounded flex items-center justify-center gap-1"
                >
                  <Undo2 className="w-3 h-3" />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetDrawing}
                  disabled={drawingPoints.length === 0}
                  className="px-2 py-1 text-[11px] bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 rounded flex items-center justify-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
                <button
                  type="button"
                  onClick={handleFinishDrawing}
                  disabled={drawingPoints.length < 3}
                  className="px-2 py-1 text-[11px] bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-40 rounded flex items-center justify-center gap-1"
                >
                  <span>Close & Save</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Main Map View: Google Maps or SVG Vector Grid */}
      {activeProvider === 'google' ? (
        <div ref={googleMapRef} className="flex-1 w-full h-full relative" />
      ) : (
        /* SVG Map Canvas */
        /* eslint-disable-next-line jsx-a11y/no-static-element-interactions */
        <div
          className="flex-1 w-full h-full relative cursor-crosshair overflow-hidden"
          onMouseDown={(e) => {
            if (e.button === 0 && !isDrawing) {
              setIsPanning(true);
              setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
            }
          }}
          onMouseMove={(e) => {
            if (isPanning) {
              setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
            }
          }}
          onMouseUp={() => setIsPanning(false)}
          onMouseLeave={() => setIsPanning(false)}
        >
          <svg
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            className="w-full h-full"
            onClick={handleSvgClick}
          >
            <defs>
              <pattern
                id="exclusionPattern"
                patternUnits="userSpaceOnUse"
                width="16"
                height="16"
                patternTransform="rotate(45)"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="16"
                  stroke="#f43f5e"
                  strokeWidth="4"
                  strokeOpacity="0.4"
                />
              </pattern>

              <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="0.5"
                  strokeOpacity="0.4"
                />
              </pattern>
            </defs>

            {/* Background Grid */}
            <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="#0f172a" />
            <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="url(#gridPattern)" />

            {/* Pan and Zoom Layer */}
            <g
              transform={`translate(${SVG_WIDTH / 2 + pan.x}, ${
                SVG_HEIGHT / 2 + pan.y
              }) scale(${zoom}) translate(${-SVG_WIDTH / 2}, ${-SVG_HEIGHT / 2})`}
            >
              {/* Render all zones */}
              {zones.map((zone) => {
                const isSelected = zone.id === selectedZoneId;
                const zoneType = zone.zoneType ?? zone.type;
                const geom = zone.geometry ?? zone.boundary;
                if (!geom) return null;

                const polygons =
                  geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;

                let strokeColor = '#38bdf8';
                let fillColor = 'rgba(56, 189, 248, 0.18)';
                if (zoneType === 'PICKUP') {
                  strokeColor = '#10b981';
                  fillColor = 'rgba(16, 185, 129, 0.22)';
                } else if (zoneType === 'EXCLUSION') {
                  strokeColor = '#f43f5e';
                  fillColor = 'url(#exclusionPattern)';
                }

                if (isSelected) {
                  strokeColor = '#fbbf24';
                  fillColor =
                    zoneType === 'EXCLUSION'
                      ? 'url(#exclusionPattern)'
                      : 'rgba(251, 191, 36, 0.3)';
                }

                const exterior = polygons[0]?.[0];
                const [centerX, centerY] = exterior
                  ? project(exterior[0]![0], exterior[0]![1])
                  : [0, 0];

                return (
                  <g
                    key={zone.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectZone(zone);
                    }}
                    className="cursor-pointer transition-opacity hover:opacity-90"
                  >
                    {polygons.map((polyCoords) => {
                      const startPos = polyCoords[0]?.[0];
                      const polyKey = startPos
                        ? `${zone.id}-${startPos[0]}-${startPos[1]}`
                        : `${zone.id}-poly`;

                      return (
                        <path
                          key={polyKey}
                          d={polyCoords.map((ring) => ringToSvgPath(ring)).join(' ')}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={isSelected ? 3.5 : 2}
                          strokeDasharray={zoneType === 'EXCLUSION' ? '6 3' : 'none'}
                        />
                      );
                    })}

                    {exterior && (
                      <g transform={`translate(${centerX}, ${centerY})`}>
                        <rect
                          x="-40"
                          y="-12"
                          width="80"
                          height="24"
                          rx="4"
                          fill="rgba(15, 23, 42, 0.85)"
                          stroke={strokeColor}
                          strokeWidth="1"
                        />
                        <text
                          textAnchor="middle"
                          y="4"
                          fill="#f8fafc"
                          fontSize="9"
                          fontWeight="bold"
                        >
                          {zone.code}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Render Draft Drawing Points & Line */}
              {drawingPoints.length > 0 && (
                <g>
                  <path
                    d={
                      drawingPoints
                        .map((p, i) => {
                          const [x, y] = project(p[0], p[1]);
                          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                        })
                        .join(' ')
                    }
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="2.5"
                    strokeDasharray="4 2"
                  />
                  {drawingPoints.map((p) => {
                    const [x, y] = project(p[0], p[1]);
                    return (
                      <circle
                        key={`draw-pt-${p[0]}-${p[1]}`}
                        cx={x}
                        cy={y}
                        r="5"
                        fill={p === drawingPoints[0] ? '#10b981' : '#fbbf24'}
                        stroke="#0f172a"
                        strokeWidth="2"
                      />
                    );
                  })}
                </g>
              )}

              {/* Render Draft Polygon */}
              {draftGeometry && !isDrawing && (
                <path
                  d={draftGeometry.coordinates.map((ring) => ringToSvgPath(ring)).join(' ')}
                  fill="rgba(251, 191, 36, 0.25)"
                  stroke="#fbbf24"
                  strokeWidth="3"
                  strokeDasharray="4 3"
                />
              )}
            </g>
          </svg>
        </div>
      )}

      {/* Legend Footer */}
      <div className="bg-slate-900 border-t border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between text-xs text-slate-300">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs border-2 border-sky-400 bg-sky-500/20" />
            <span className="font-medium text-slate-200">CITY Boundary</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs border-2 border-emerald-500 bg-emerald-500/20" />
            <span className="font-medium text-slate-200">PICKUP Coverage</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs border-2 border-rose-500 border-dashed bg-rose-500/20" />
            <span className="font-medium text-slate-200">EXCLUSION Area (Veto)</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-slate-400">
          <span>Active Layer: <strong className="text-slate-200 capitalize">{activeProvider === 'google' ? `Google Maps (${mapType})` : 'Vector Grid'}</strong></span>
          <span className="hidden sm:inline">|</span>
          <span className="hidden sm:inline">Click zone to inspect</span>
        </div>
      </div>
    </div>
  );
}
