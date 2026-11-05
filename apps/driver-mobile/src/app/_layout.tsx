import '@/services/voice-bootstrap';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { DutyProvider } from '@/context/duty-context';
import {
  ACTIVE_RIDE_STATUSES,
  PENDING_PAYMENT_STATUSES,
  RideProvider,
  useRide,
} from '@/context/ride-context';
import { RideCallProvider } from '@/context/call-context';
import { dispatchApi } from '@/services/api';
import { RIDE_COMMUNICATION_STATUSES } from '@cabzone/contracts';
import { ThemeBoundary, ThemeProvider, colors } from '@/design-system';

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
        const handle = async (
          response: NonNullable<ReturnType<typeof Notifications.getLastNotificationResponse>>,
        ) => {
          const notification = response.notification;
          const { type, rideId } = notification.request.content.data ?? {};
          if (type === 'ride.call.incoming') return;
          if (handledRef.current === notification.request.identifier) return;
          handledRef.current = notification.request.identifier;
          try {
            if (type === 'ride.offer.created' && typeof rideId === 'string') {
              const offers = await dispatchApi.listOffers(token);
              await refreshOffers();
              router.push('/(driver)/(tabs)/home');
              if (!offers.some((offer) => offer.rideId === rideId)) {
                Alert.alert('Ride no longer available');
              }
            } else if (type === 'ride.chat.message' && typeof rideId === 'string') {
              const ride = await refreshActiveRide(rideId);
              if (ride && RIDE_COMMUNICATION_STATUSES.includes(ride.status)) {
                router.push({ pathname: '/(driver)/chat/[rideId]', params: { rideId } });
              } else {
                router.push('/(driver)/(tabs)/home');
              }
            } else if (
              (type === 'ride.driver.assigned' ||
                type === 'ride.payment.cash_claimed' ||
                type === 'ride.payment.confirmed') &&
              typeof rideId === 'string'
            ) {
              const ride = await refreshActiveRide(rideId);
              if (
                ride &&
                (ACTIVE_RIDE_STATUSES.has(ride.status) ||
                  PENDING_PAYMENT_STATUSES.has(ride.status) ||
                  ride.status === 'SETTLED')
              ) {
                router.push(`/(driver)/ride/${rideId}`);
              } else {
                router.push('/(driver)/(tabs)/home');
              }
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
    <ThemeProvider>
      <AuthProvider>
        <DutyProvider>
          <RideProvider>
            <RideCallProvider>
              <StatusBar style="auto" />
              <NotificationNavigator />
              <ThemeBoundary>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.background },
                  }}
                />
              </ThemeBoundary>
            </RideCallProvider>
          </RideProvider>
        </DutyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
