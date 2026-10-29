import React, { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { RideProvider, useRide } from '@/context/ride-context';
import { isRideActive } from '@/services/rider-helpers';
import { colors } from '@/design-system';

function NotificationNavigator() {
  const router = useRouter();
  const { token, isBootstrapping, needsNameSetup } = useAuth();
  const { refreshRideById, refreshRides } = useRide();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (isBootstrapping || !token || needsNameSetup) return;
    let active = true;
    let subscription: { remove: () => void } | null = null;
    import('expo-notifications')
      .then((Notifications) => {
        if (!active) return;
        const handle = async (
          response: NonNullable<ReturnType<typeof Notifications.getLastNotificationResponse>>,
        ) => {
          const notification = response.notification;
          if (handledRef.current === notification.request.identifier) return;
          handledRef.current = notification.request.identifier;
          const { rideId } = notification.request.content.data ?? {};
          try {
            if (typeof rideId === 'string' && rideId.length > 0) {
              const detail = await refreshRideById(rideId);
              void refreshRides().catch(() => null);
              if (detail && isRideActive(detail.ride.status)) {
                router.push(`/(rider)/ride/${rideId}`);
              } else if (
                detail &&
                (detail.ride.status === 'SETTLED' || detail.ride.status === 'PAYMENT_DISPUTED')
              ) {
                router.push(`/(rider)/history/${rideId}`);
              } else {
                router.push('/(rider)/(tabs)/home');
              }
            } else {
              router.push('/(rider)/(tabs)/home');
            }
          } catch {
            router.push('/(rider)/(tabs)/home');
            Alert.alert('Unable to load ride', 'Check your connection and try again.');
          }
          Notifications.clearLastNotificationResponse?.();
        };
        const last = Notifications.getLastNotificationResponse?.();
        if (last) void handle(last);
        subscription = Notifications.addNotificationResponseReceivedListener((response) => {
          void handle(response);
        });
      })
      .catch(() => {});
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [router, token, isBootstrapping, needsNameSetup, refreshRideById, refreshRides]);

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
