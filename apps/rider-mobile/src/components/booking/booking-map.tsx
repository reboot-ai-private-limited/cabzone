import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type LatLng } from 'react-native-maps';

// Explicit light style: Google Maps otherwise follows the phone's dark mode on Android.
const GOOGLE_MAPS_LIGHT_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d8efd3' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#fde9b0' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9e4f5' }] },
];

export interface BookingMapProps {
  pickup: { lat: number; lng: number; address: string };
  drop?: { lat: number; lng: number; address: string };
  stops?: { lat: number; lng: number; address: string }[];
  bottomInset: number;
  /** Space covered by floating cards over the map, so the fitted route stays visible. */
  fitPadding?: { top: number; bottom: number };
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
  stops,
  bottomInset,
  fitPadding,
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
  const [canShowUser, setCanShowUser] = useState(false);

  // The blue dot only renders once location permission is granted.
  useEffect(() => {
    let off = false;
    void Location.requestForegroundPermissionsAsync()
      .then((perm) => {
        if (!off) setCanShowUser(perm.granted);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, []);

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
    // Fit the drawn road, not just the endpoints, so detours stay on screen (sampled to keep it cheap).
    const step = Math.max(1, Math.ceil(polylineCoords.length / 150));
    for (let i = 0; i < polylineCoords.length; i += step) pointsToFit.push(polylineCoords[i]!);
    for (const stop of stops ?? []) {
      pointsToFit.push({ latitude: stop.lat, longitude: stop.lng });
    }
    if (drop) {
      pointsToFit.push({ latitude: drop.lat, longitude: drop.lng });
    }
    if (driverLocation) {
      pointsToFit.push({ latitude: driverLocation.lat, longitude: driverLocation.lng });
    }

    if (pointsToFit.length > 1) {
      mapRef.current.fitToCoordinates(pointsToFit, {
        edgePadding: {
          top: fitPadding?.top ?? 60,
          right: 50,
          bottom: fitPadding?.bottom ?? Math.max(bottomInset, 40) + 50,
          left: 50,
        },
        animated: true,
      });
    } else {
      mapRef.current.animateCamera(
        { center: { latitude: pickup.lat, longitude: pickup.lng }, zoom: 16 },
        { duration: 450 },
      );
    }
  }, [
    mapReady,
    pickup.lat,
    pickup.lng,
    drop?.lat,
    drop?.lng,
    stops,
    polylineCoords,
    fitPadding?.top,
    fitPadding?.bottom,
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
        userInterfaceStyle="light"
        customMapStyle={GOOGLE_MAPS_LIGHT_STYLE}
        style={styles.map}
        initialRegion={{
          latitude: pickup.lat,
          longitude: pickup.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        onMapLoaded={() => setMapReady(true)}
        // Camera moves before tiles load are dropped on Android; fall back if the loaded event never fires.
        onMapReady={() => setTimeout(() => setMapReady(true), 3000)}
        toolbarEnabled={false}
        showsCompass={false}
        showsUserLocation={canShowUser}
        showsMyLocationButton={false}
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

        {(stops ?? []).map((stop, index) => (
          <Marker
            key={`stop-${index}`}
            coordinate={{ latitude: stop.lat, longitude: stop.lng }}
            title={`Stop ${index + 1}`}
            description={stop.address}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.stopPin}>
              <Text style={styles.stopPinText}>{index + 1}</Text>
            </View>
          </Marker>
        ))}

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
            strokeColor="#3A2414"
            strokeWidth={5}
            geodesic
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  stopPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#7C2D12',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopPinText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
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
