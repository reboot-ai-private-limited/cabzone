import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import type { NotificationResponse } from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/auth-context';
import { RideProvider } from '@/context/ride-context';
import { useAuth } from '@/context/auth-context';
import { useRide } from '@/context/ride-context';
import { colors } from '@/design-system';

function NotificationNavigator() {
  const router = useRouter();
  const { token, isBootstrapping } = useAuth();
  const { refreshRideById, refreshRides } = useRide();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token || isBootstrapping) return;
    let active = true;
    let subscription: { remove: () => void } | null = null;
    import('expo-notifications')
      .then((Notifications) => {
        if (!active) return;
        const handle = async (response: NotificationResponse) => {
          const request = response.notification.request;
          if (handledRef.current === request.identifier) return;
          handledRef.current = request.identifier;
          const { type, rideId } = request.content.data ?? {};
          try {
            if (
              typeof rideId !== 'string' ||
              !/^[A-Za-z0-9_-]{1,128}$/.test(rideId) ||
              typeof type !== 'string' ||
              !type.startsWith('ride.')
            )
              return;
            const detail = await refreshRideById(rideId);
            if (!active) return;
            if (
              detail &&
              [
                'REQUESTED',
                'OFFERING',
                'DRIVER_ASSIGNED',
                'DRIVER_EN_ROUTE',
                'DRIVER_ARRIVED',
                'TRIP_STARTED',
                'TRIP_COMPLETED',
                'PAYMENT_PENDING',
              ].includes(detail.ride.status)
            ) {
              router.push(`/(rider)/ride/${encodeURIComponent(rideId)}`);
            } else if (detail) {
              router.push(`/(rider)/history/${encodeURIComponent(rideId)}`);
            } else {
              await refreshRides();
              router.replace('/(rider)/(tabs)/home');
            }
          } catch {
            await refreshRides();
            router.replace('/(rider)/(tabs)/home');
          } finally {
            Notifications.clearLastNotificationResponse();
          }
        };
        const last = Notifications.getLastNotificationResponse();
        if (last) void handle(last);
        subscription = Notifications.addNotificationResponseReceivedListener(
          (response) => void handle(response),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [isBootstrapping, refreshRideById, refreshRides, router, token]);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RideProvider>
          <StatusBar style="dark" />
          <NotificationNavigator />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="(rider)" />
          </Stack>
        </RideProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
