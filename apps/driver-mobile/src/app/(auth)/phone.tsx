import React from 'react';
import { useRouter } from 'expo-router';
import { SignupStep } from '@/components/auth/signup-step';

export default function PhoneAuthRoute() {
  const router = useRouter();
  return <SignupStep onBack={() => router.replace('/(auth)/welcome')} />;
}
