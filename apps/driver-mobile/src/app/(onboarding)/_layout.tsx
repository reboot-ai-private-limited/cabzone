import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/context/auth-context';

export default function OnboardingGroupLayout() {
  const { isAuthenticated, isLoading, isKycVerified } = useAuth();

  if (!isLoading && !isAuthenticated) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (!isLoading && isKycVerified) {
    return <Redirect href="/(driver)/(tabs)/home" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
