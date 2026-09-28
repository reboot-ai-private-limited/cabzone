'use client';

import React, { useMemo, useState } from 'react';
import {
  Layers,
  Minus,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react';
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

export function ZoneMap({
  zones,
  selectedZoneId,
  onSelectZone,
  draftGeometry,
  onDraftChange,
  isDrawing = false,
  onToggleDrawing,
}: ZoneMapProps) {
  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Draft drawing points: array of [lng, lat]
  const [drawingPoints, setDrawingPoints] = useState<Position[]>([]);

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

    // Add 10% padding
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
    // Invert Y axis for screen space
    const y = SVG_HEIGHT - ((lat - bbox.minLat) / (bbox.maxLat - bbox.minLat)) * SVG_HEIGHT;
    return [x, y];
  };

  // Inverse project from SVG [x, y] back to [lng, lat]
  const unproject = (x: number, y: number): Position => {
    const lng = bbox.minLng + (x / SVG_WIDTH) * (bbox.maxLng - bbox.minLng);
    const lat = bbox.minLat + ((SVG_HEIGHT - y) / SVG_HEIGHT) * (bbox.maxLat - bbox.minLat);
    return [Math.round(lng * 10000) / 10000, Math.round(lat * 10000) / 10000];
  };

  // Helper to convert ring positions into SVG path data
  const ringToSvgPath = (ring: Position[]): string => {
    if (!ring || ring.length < 2) return '';
    return ring
      .map((pos, idx) => {
        const [x, y] = project(pos[0], pos[1]);
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ') + ' Z';
  };

  // Handle map click for drawing mode
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing) return;

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    // Normalized click coordinate inside SVG viewBox
    const rawX = ((e.clientX - rect.left) / rect.width) * SVG_WIDTH;
    const rawY = ((e.clientY - rect.top) / rect.height) * SVG_HEIGHT;

    // Apply inverse pan and zoom
    const svgX = (rawX - SVG_WIDTH / 2 - pan.x) / zoom + SVG_WIDTH / 2;
    const svgY = (rawY - SVG_HEIGHT / 2 - pan.y) / zoom + SVG_HEIGHT / 2;

    const newPos = unproject(svgX, svgY);
    const nextPoints = [...drawingPoints, newPos];
    setDrawingPoints(nextPoints);

    if (nextPoints.length >= 4) {
      // Automatically update draft geometry with closed ring
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

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900 select-none overflow-hidden">
      {/* Map Header Overlay */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-xs text-white px-3 py-1.5 rounded-lg border border-slate-700 text-xs shadow-md">
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-semibold">{zones.length} Zones Rendered</span>
        </div>

        {isDrawing && (
          <div className="flex items-center gap-1.5 bg-amber-500 text-slate-950 font-semibold px-3 py-1.5 rounded-lg text-xs shadow-md animate-pulse">
            <Square className="w-3.5 h-3.5" />
            <span>Drawing Polygon ({drawingPoints.length} vertices)</span>
          </div>
        )}
      </div>

      {/* Floating Controls Overlay */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        <div className="flex flex-col bg-slate-900/90 backdrop-blur-xs rounded-lg border border-slate-700 p-1 shadow-md text-white">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(z * 1.3, 5))}
            className="p-1.5 hover:bg-slate-800 rounded transition-colors"
            title="Zoom In"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(z / 1.3, 0.5))}
            className="p-1.5 hover:bg-slate-800 rounded transition-colors"
            title="Zoom Out"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
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

      {/* SVG Map Canvas */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
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
            {/* EXCLUSION Zone Diagonal Stripe Pattern */}
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

            {/* Grid Pattern for map background */}
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

              // Styles per zone type
              let strokeColor = '#38bdf8'; // CITY (sky)
              let fillColor = 'rgba(56, 189, 248, 0.18)';
              if (zoneType === 'PICKUP') {
                strokeColor = '#10b981'; // PICKUP (emerald)
                fillColor = 'rgba(16, 185, 129, 0.22)';
              } else if (zoneType === 'EXCLUSION') {
                strokeColor = '#f43f5e'; // EXCLUSION (rose)
                fillColor = 'url(#exclusionPattern)';
              }

              if (isSelected) {
                strokeColor = '#fbbf24'; // Selected zone gold highlight
                fillColor =
                  zoneType === 'EXCLUSION'
                    ? 'url(#exclusionPattern)'
                    : 'rgba(251, 191, 36, 0.3)';
              }

              // Compute centroid for label
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

                  {/* Centroid Label */}
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

        <div className="text-[11px] text-slate-400">
          Scroll/Drag to pan · Double click vertex to close
        </div>
      </div>
    </div>
  );
}
