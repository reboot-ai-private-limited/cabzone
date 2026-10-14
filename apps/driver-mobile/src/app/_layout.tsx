import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { DutyProvider } from '@/context/duty-context';
import { ACTIVE_RIDE_STATUSES, RideProvider, useRide } from '@/context/ride-context';
import { dispatchApi } from '@/services/api';

function NotificationNavigator() {
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const { refreshOffers, refreshActiveRide } = useRide();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || !token) return;
    let active = true;
    let subscription: { remove: () => void } | null = null;
    import('expo-notifications')
      .then((Notifications) => {
        if (!active) return;
        const handle = async (response: NonNullable<ReturnType<typeof Notifications.getLastNotificationResponse>>) => {
          const notification = response.notification;
          if (handledRef.current === notification.request.identifier) return;
          handledRef.current = notification.request.identifier;
          const { type, rideId } = notification.request.content.data ?? {};
          try {
            if (type === 'ride.offer.created' && typeof rideId === 'string') {
              const offers = await dispatchApi.listOffers(token);
              await refreshOffers();
              router.push('/(driver)/(tabs)/home');
              if (!offers.some((offer) => offer.rideId === rideId)) Alert.alert('Ride no longer available');
            } else if (type === 'ride.driver.assigned' && typeof rideId === 'string') {
              const ride = await refreshActiveRide(rideId);
              if (ride && ACTIVE_RIDE_STATUSES.has(ride.status)) router.push(`/(driver)/ride/${rideId}`);
              else router.push('/(driver)/(tabs)/home');
            } else {
              router.push('/(driver)/(tabs)/home');
            }
          } catch {
            router.push('/(driver)/(tabs)/home');
            Alert.alert('Unable to load ride', 'Check your connection and try again.');
          }
          Notifications.clearLastNotificationResponse();
        };
        const last = Notifications.getLastNotificationResponse();
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
  }, [router, token, isLoading, refreshOffers, refreshActiveRide]);

  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <DutyProvider>
        <RideProvider>
          <StatusBar style="dark" />
          <NotificationNavigator />
          <Stack screenOptions={{ headerShown: false }} />
        </RideProvider>
      </DutyProvider>
    </AuthProvider>
  );
}
