import type { ZoneDto } from '@cabzone/contracts';
import { colors } from '@cabzone/design-system';
import type { FeatureCollection, Geometry, Polygon } from 'geojson';

/**
 * How a zone is painted, and why each type looks the way it does.
 *
 * The colours come from `colors.zone*` in the design tokens rather than the semantic CSS
 * variables, because a Google Maps style takes a literal colour string — there is no stylesheet
 * for an overlay to resolve `var(--color-zone-city)` against. That is also why these five values
 * live in `tokens.ts` at all: they are the one part of the palette that cannot go through
 * `theme.css`.
 *
 * The four fills are chosen to stay distinguishable ON A BASEMAP, which is a different problem
 * from UI contrast (docs/engineering/design-language.md §Color) — a translucent lime over
 * satellite imagery is invisible, so the accent is not among them. That matters more under
 * Google's hybrid view than it did under a plain street map.
 */

export interface ZoneFeatureProperties extends Record<string, unknown> {
  id: string;
  type: ZoneDto['type'];
  name: string;
  selected: boolean;
  /** While one zone is being edited, every other zone drops back so the edit is legible. */
  dimmed: boolean;
}

export function zonesToFeatureCollection(
  zones: ZoneDto[],
  selectedId: string | null,
  dimOthers: boolean,
): FeatureCollection<Geometry, ZoneFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: zones
      .filter((zone) => Boolean(zone && (zone.geometry || zone.boundary)))
      .map((zone) => {
        const geom = (zone.geometry ?? zone.boundary) as Geometry;
        const zoneType = (zone.type ?? zone.zoneType ?? 'PICKUP') as ZoneDto['type'];
        return {
          type: 'Feature',
          id: zone.id,
          geometry: geom,
          properties: {
            id: zone.id,
            type: zoneType,
            name: zone.name,
            selected: zone.id === selectedId,
            dimmed: dimOthers && zone.id !== selectedId,
          },
        };
      }),
  };
}

function fillColour(type: ZoneDto['type']): string {
  if (type === 'CITY') return colors.zoneCity;
  if (type === 'PICKUP') return colors.zonePickupFree;
  if (type === 'EXCLUSION') return colors.zoneViolation;
  return colors.interactive;
}

/**
 * The style function for the saved-zones `Data` layer.
 *
 * Deliberately low fill opacity. Overlapping translucent polygons over satellite imagery
 * stop being readable well before they stop being visible, and the stroke is what actually
 * carries the boundary.
 */
export function zoneFeatureStyle(properties: ZoneFeatureProperties): google.maps.Data.StyleOptions {
  const colour = fillColour(properties.type);

  return {
    fillColor: colour,
    fillOpacity: properties.dimmed ? 0.04 : properties.selected ? 0.35 : 0.2,
    strokeColor: colour,
    strokeWeight: properties.selected ? 3 : 2,
    strokeOpacity: properties.dimmed ? 0.25 : 1,
    clickable: !properties.dimmed,
    zIndex: properties.selected ? 3 : 1,
  };
}

/**
 * The city boundary is DASHED, always, even when it is not the selection.
 *
 * It is the one polygon that is context rather than content on every other zone's edit — a
 * pickup zone drawn outside it is legal (Z-1 is retired) but tells the admin that incity quotes
 * from there will come back `PICKUP_OUTSIDE_CITY`, and they can only see that if the boundary is
 * on screen while they draw.
 *
 * Google's `Data` layer has no dash support, so this is the one thing that costs an extra
 * overlay: a `Polyline` whose stroke is transparent and whose dashes are repeated symbols.
 * `google.maps.SymbolPath.CIRCLE` would give dots; the two-point path below gives real dashes.
 */
export function cityBoundaryStroke(): google.maps.PolylineOptions {
  return {
    strokeOpacity: 0,
    icons: [
      {
        icon: {
          path: 'M 0,-1 0,1',
          strokeOpacity: 1,
          strokeColor: colors.zoneCity,
          strokeWeight: 2,
          scale: 3,
        },
        offset: '0',
        repeat: '12px',
      },
    ],
    zIndex: 2,
  };
}

/**
 * The offending area from a Z-2 overlap or a failed containment, painted above everything else.
 *
 * This is the whole reason `ZoneViolationDto` carries `offending_geometry` rather than only a
 * message: "Overlaps 'Central' by 0.42 km²" tells an admin there is a problem, and painting the
 * 0.42 km² tells them where to drag. Mongo cannot return derived geometry at all, which is why
 * Turf computes it server-side (docs/LLD/zones.md §Why MongoDB geo).
 */
export const VIOLATION_STYLE: google.maps.Data.StyleOptions = {
  fillColor: colors.zoneViolation,
  fillOpacity: 0.45,
  strokeColor: colors.zoneViolation,
  strokeWeight: 2,
  clickable: false,
  zIndex: 5,
};

/**
 * The polygon under edit. `interactive` ink, not one of the zone colours: it is the one shape on
 * screen that is not yet saved, and it should read as the thing being manipulated rather than as
 * a fifth category of zone.
 */
export const DRAFT_STYLE: google.maps.PolygonOptions = {
  fillColor: colors.interactive,
  fillOpacity: 0.22,
  strokeColor: colors.interactive,
  strokeWeight: 2.5,
  zIndex: 4,
};

/**
 * The open chain drawn between corners while a boundary is being TRACED, including the rubber
 * band from the last placed corner to the cursor.
 *
 * Its own style rather than borrowing `DRAFT_STYLE`'s stroke, because it is not the same thing:
 * `DRAFT_STYLE` paints a shape that exists, this paints one that does not yet. The magenta is
 * the only hue Google's basemap never uses for anything, so the line stays readable over
 * vegetation green, road grey, water blue and satellite imagery alike — the olive it replaced
 * vanished against the first of those.
 *
 * `clickable: false` is REQUIRED, not tidy: the band always terminates under the cursor, and a
 * clickable Polyline swallows the click that lands on it, so every corner after the first would
 * be silently dropped.
 */
export const DRAFT_LINE_STYLE: google.maps.PolylineOptions = {
  strokeColor: colors.zoneDraftLine,
  strokeWeight: 3,
  strokeOpacity: 1,
  clickable: false,
  zIndex: 6,
};

export const EMPTY_COLLECTION: FeatureCollection<Polygon> = {
  type: 'FeatureCollection',
  features: [],
};
