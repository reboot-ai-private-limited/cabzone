import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { bookingMapHtml, mapSelection, mapUpdate } from './booking-map-html';

export interface BookingMapProps {
  pickup: { lat: number; lng: number; address: string };
  drop?: { lat: number; lng: number; address: string };
  bottomInset: number;
  driverLocation?: { lat: number; lng: number } | null;
  routeCoordinates?: [number, number][];
  readOnly?: boolean;
  cameraVersion?: number;
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
  onEditPickup,
  onSelectPoint,
}: BookingMapProps) {
  const webView = useRef<WebView>(null);
  const [html] = useState(() =>
    bookingMapHtml(pickup, drop, { driverLocation, routeCoordinates, readOnly, cameraVersion }),
  );
  const [loaded, setLoaded] = useState(false);
  const points = mapUpdate(pickup, drop, {
    driverLocation,
    routeCoordinates,
    readOnly,
    cameraVersion,
  });

  useEffect(() => {
    if (loaded) webView.current?.injectJavaScript(`window.updateBookingMap(${points});true;`);
  }, [points, loaded]);

  return (
    <View style={[StyleSheet.absoluteFill, { bottom: bottomInset }]}>
      <WebView
        ref={webView}
        source={{ html, baseUrl: 'https://tiles.openfreemap.org' }}
        originWhitelist={['*']}
        onLoadEnd={() => setLoaded(true)}
        onMessage={({ nativeEvent }) => {
          if (nativeEvent.data === 'editPickup') {
            onEditPickup?.();
            return;
          }
          const point = mapSelection(nativeEvent.data);
          if (point) onSelectPoint?.(point.lat, point.lng);
        }}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="never"
        scrollEnabled={false}
        style={styles.map}
      />
    </View>
  );
}

const styles = StyleSheet.create({ map: { flex: 1, backgroundColor: '#ffffff' } });
