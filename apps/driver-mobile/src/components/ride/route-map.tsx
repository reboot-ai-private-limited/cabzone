import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type LatLng, type Region } from 'react-native-maps';
import { colors } from '@/design-system';
import { decodePolyline } from '@/services/polyline';

interface Point {
  lat: number;
  lng: number;
}

export interface RouteMapProps {
  pickup: Point;
  drop: Point;
  stops?: Point[];
  /** Google encoded polyline of the road route. Without one only the pins are drawn. */
  polyline?: string | null;
  height?: number;
  /** Lets the driver pan and zoom. Keep false inside sheets so scrolling is not hijacked. */
  interactive?: boolean;
}

const valid = ([lng, lat]: [number, number]) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

function regionFor(points: LatLng[]): Region {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.01),
    longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.01),
  };
}

/** The real Google road route from pickup to drop (through any stops), with pins. */
export function RouteMap({ pickup, drop, stops = [], polyline, height = 180, interactive = false }: RouteMapProps) {
  const route = useMemo<LatLng[]>(() => {
    if (!polyline) return [];
    try {
      return decodePolyline(polyline)
        .filter(valid)
        .map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
    } catch {
      return [];
    }
  }, [polyline]);

  const region = useMemo(() => {
    const points: LatLng[] = [
      { latitude: pickup.lat, longitude: pickup.lng },
      ...stops.map((s) => ({ latitude: s.lat, longitude: s.lng })),
      { latitude: drop.lat, longitude: drop.lng },
      // Sampled so a long road does not make this expensive, but detours still fit on screen.
      ...route.filter((_, i) => i % Math.max(1, Math.ceil(route.length / 120)) === 0),
    ];
    return regionFor(points);
  }, [pickup.lat, pickup.lng, drop.lat, drop.lng, stops, route]);

  return (
    <View style={[styles.frame, { height }]} accessibilityLabel="Route map from pickup to destination">
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsCompass={false}
        mapPadding={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        {route.length > 1 ? (
          <Polyline coordinates={route} strokeColor={colors.brandBrown} strokeWidth={5} />
        ) : null}
        <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} pinColor="green" title="Pickup" />
        {stops.map((stop, index) => (
          <Marker
            key={`stop-${index}`}
            coordinate={{ latitude: stop.lat, longitude: stop.lng }}
            pinColor="orange"
            title={`Stop ${index + 1}`}
          />
        ))}
        <Marker coordinate={{ latitude: drop.lat, longitude: drop.lng }} pinColor="red" title="Destination" />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F1ECE6',
    marginBottom: 14,
  },
});
