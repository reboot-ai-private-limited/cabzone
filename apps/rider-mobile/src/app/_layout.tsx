import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/auth-context';
import { RideProvider } from '@/context/ride-context';
import { colors } from '@/design-system';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RideProvider>
          <StatusBar style="dark" />
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
