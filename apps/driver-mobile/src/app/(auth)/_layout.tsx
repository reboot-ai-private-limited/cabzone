import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/context/auth-context';

export default function AuthGroupLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (!isLoading && isAuthenticated) {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
