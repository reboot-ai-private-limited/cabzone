import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '@/design-system';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="name" />
    </Stack>
  );
}
