import React from 'react';
import { useRouter } from 'expo-router';
import { EntryStep } from './entry-step';

export function AuthScreen() {
  const router = useRouter();
  return <EntryStep onContinue={() => router.navigate('/(auth)/phone')} />;
}
