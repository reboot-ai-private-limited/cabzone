import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { colors } from '@/design-system';

export default function RiderGroupLayout() {
  const router = useRouter();
  const { isBootstrapping, token, needsNameSetup } = useAuth();

  useEffect(() => {
    if (isBootstrapping) return;
    if (!token) {
      router.replace('/(auth)/welcome');
      return;
    }
    if (needsNameSetup) {
      router.replace('/(onboarding)/name');
    }
  }, [isBootstrapping, needsNameSetup, router, token]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="ride/[rideId]" />
      <Stack.Screen name="chat/[rideId]" />
      <Stack.Screen name="history/[rideId]" />
      <Stack.Screen name="account/edit-profile" />
      <Stack.Screen name="account/emergency-contact" />
      <Stack.Screen name="account/saved-routes" />
      <Stack.Screen name="account/support" />
      <Stack.Screen name="account/legal" />
    </Stack>
  );
}
