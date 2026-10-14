import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider } from '@/context/auth-context';
import { DutyProvider } from '@/context/duty-context';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <DutyProvider>
        <StatusBar style="dark" />
        <AnimatedSplashOverlay />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#F8FAFC' },
            animation: Platform.OS === 'android' ? 'fade' : 'default',
          }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
        </Stack>
        </DutyProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
