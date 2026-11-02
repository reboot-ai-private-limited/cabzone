import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type LatLng } from 'react-native-maps';

export const GOOGLE_MAPS_DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0d1829' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8fa0b5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1829' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#cbd5e1' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#94a3b8' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#0f233a' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64748b' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1e2e42' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#162233' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#94a3b8' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#253d5a' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1b2d42' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#cbd5e1' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#18283b' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#cbd5e1' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0b2848' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#38bdf8' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#0b2848' }],
  },
];

export interface BookingMapProps {
  pickup: { lat: number; lng: number; address: string };
  drop?: { lat: number; lng: number; address: string };
  bottomInset: number;
  driverLocation?: { lat: number; lng: number } | null;
  routeCoordinates?: [number, number][];
  readOnly?: boolean;
  cameraVersion?: number;
  interactivePinMode?: boolean;
  onEditPickup?: () => void;
  onSelectPoint?: (lat: number, lng: number) => void;
}

export default function BookingMap({
  pickup,
  drop,
  bottomInset,
  driverLocation,
  routeCoordinates,
  readOnly,
  cameraVersion,
  interactivePinMode = false,
  onEditPickup,
  onSelectPoint,
}: BookingMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // GeoJSON routeCoordinates are [lng, lat] pairs
  const polylineCoords = useMemo<LatLng[]>(() => {
    if (!routeCoordinates || routeCoordinates.length < 2) return [];
    return routeCoordinates.map(([lng, lat]) => ({
      latitude: lat,
      longitude: lng,
    }));
  }, [routeCoordinates]);

  // Sync camera when points or cameraVersion change
  useEffect(() => {
    if (!mapReady || !mapRef.current || interactivePinMode) return;

    const pointsToFit: LatLng[] = [
      { latitude: pickup.lat, longitude: pickup.lng },
    ];
    if (drop) {
      pointsToFit.push({ latitude: drop.lat, longitude: drop.lng });
    }
    if (driverLocation) {
      pointsToFit.push({ latitude: driverLocation.lat, longitude: driverLocation.lng });
    }

    if (pointsToFit.length > 1) {
      mapRef.current.fitToCoordinates(pointsToFit, {
        edgePadding: {
          top: 60,
          right: 50,
          bottom: Math.max(bottomInset, 40) + 50,
          left: 50,
        },
        animated: true,
      });
    } else {
      mapRef.current.animateToRegion(
        {
          latitude: pickup.lat,
          longitude: pickup.lng,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        },
        450,
      );
    }
  }, [
    mapReady,
    pickup.lat,
    pickup.lng,
    drop?.lat,
    drop?.lng,
    driverLocation?.lat,
    driverLocation?.lng,
    cameraVersion,
    bottomInset,
    interactivePinMode,
  ]);

  return (
    <View style={[StyleSheet.absoluteFill, { bottom: bottomInset }]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        customMapStyle={GOOGLE_MAPS_DARK_STYLE}
        style={styles.map}
        initialRegion={{
          latitude: pickup.lat,
          longitude: pickup.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        onMapReady={() => setMapReady(true)}
        toolbarEnabled={false}
        showsCompass={false}
        showsMyLocationButton={false}
        mapPadding={{ top: 0, right: 0, bottom: bottomInset, left: 0 }}
        onPress={(event) => {
          if (readOnly) return;
          const { latitude, longitude } = event.nativeEvent.coordinate;
          onSelectPoint?.(
            Number(latitude.toFixed(5)),
            Number(longitude.toFixed(5)),
          );
        }}
      >
        {/* Radar Concentric Circle Pickup Pin */}
        <Marker
          coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
          title={readOnly ? 'Pickup' : 'Change pickup'}
          description={pickup.address}
          anchor={{ x: 0.5, y: 0.5 }}
          onPress={() => {
            if (!readOnly && onEditPickup) {
              onEditPickup();
            }
          }}
        >
          <View style={styles.pickupRadarWrapper}>
            <View style={styles.pickupOuterHalo}>
              <View style={styles.pickupGreenRing}>
                <View style={styles.pickupWhiteRing}>
                  <View style={styles.pickupCenterDot} />
                </View>
              </View>
            </View>
          </View>
        </Marker>

        {/* Red Teardrop Destination Pin */}
        {drop && (
          <Marker
            coordinate={{ latitude: drop.lat, longitude: drop.lng }}
            title="Destination"
            description={drop.address}
            anchor={{ x: 0.5, y: 0.95 }}
          >
            <View style={styles.dropTeardropWrapper}>
              <View style={styles.dropTeardropHead}>
                <View style={styles.dropWhiteCenter} />
              </View>
              <View style={styles.dropTeardropPointer} />
              <View style={styles.pinGroundShadow} />
            </View>
          </Marker>
        )}

        {/* Driver Pin */}
        {driverLocation && (
          <Marker
            coordinate={{ latitude: driverLocation.lat, longitude: driverLocation.lng }}
            title="Driver location"
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.driverPin}>
              <View style={styles.driverDot} />
              <Text style={styles.driverText}>Driver</Text>
            </View>
          </Marker>
        )}

        {/* Vibrant Gold Route Polyline */}
        {polylineCoords.length > 1 && (
          <Polyline
            coordinates={polylineCoords}
            strokeColor="#F59E0B"
            strokeWidth={5.5}
            geodesic
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFill,
  },
  pickupRadarWrapper: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupOuterHalo: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(5, 150, 105, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupGreenRing: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  pickupWhiteRing: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupCenterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#059669',
  },
  dropTeardropWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 48,
  },
  dropTeardropHead: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#dc2626',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  dropWhiteCenter: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
  },
  dropTeardropPointer: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#dc2626',
    marginTop: -1,
    alignSelf: 'center',
  },
  pinGroundShadow: {
    width: 12,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    alignSelf: 'center',
    marginTop: 1,
  },
  driverPin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#1e1b18',
    borderWidth: 2,
    borderColor: '#ffffff',
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  driverDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f59e0b',
  },
  driverText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
