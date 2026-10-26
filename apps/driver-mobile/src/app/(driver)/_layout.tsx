import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { useRide } from '@/context/ride-context';
import { IncomingRideOffer } from '@/components/driver/incoming-ride-offer';

export default function DriverGroupLayout() {
  const { isAuthenticated, isLoading, isKycVerified } = useAuth();
  const { activeRide, isCheckingActiveRide } = useRide();

  if (!isLoading && !isAuthenticated) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (!isLoading && !isCheckingActiveRide && !isKycVerified && !activeRide) {
    return <Redirect href="/" />;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <IncomingRideOffer />
    </>
  );
}
