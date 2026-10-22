import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { BookingMapProps } from './booking-map';
import { bookingMapHtml, mapSelection, mapUpdate } from './booking-map-html';

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
  const frame = useRef<HTMLIFrameElement>(null);
  const [html] = useState(() =>
    bookingMapHtml(pickup, drop, { driverLocation, routeCoordinates, readOnly, cameraVersion }),
  );
  const points = mapUpdate(pickup, drop, {
    driverLocation,
    routeCoordinates,
    readOnly,
    cameraVersion,
  });
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { type: 'booking.map.update', points: JSON.parse(points) },
      '*',
    );
  }, [points]);
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data === 'editPickup') {
        onEditPickup?.();
        return;
      }
      const point = mapSelection(event.data);
      if (point) onSelectPoint?.(point.lat, point.lng);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onEditPickup, onSelectPoint]);

  return (
    <View style={[StyleSheet.absoluteFill, { bottom: bottomInset }]}>
      {React.createElement('iframe', {
        ref: frame,
        title: 'Pickup and destination map',
        srcDoc: html,
        onLoad: () =>
          frame.current?.contentWindow?.postMessage(
            { type: 'booking.map.update', points: JSON.parse(points) },
            '*',
          ),
        style: { width: '100%', height: '100%', border: 0 },
      })}
    </View>
  );
}
