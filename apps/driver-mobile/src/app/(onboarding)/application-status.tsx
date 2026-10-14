import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { KycPendingHome } from '@/components/kyc/kyc-pending-home';

export default function ApplicationStatusRoute() {
  const { application, isKycVerified } = useAuth();

  if (isKycVerified) {
    return <Redirect href="/(driver)/(tabs)/home" />;
  }

  if (application?.status === 'REJECTED' && application.rejectionType !== 'HARD_FRAUD') {
    return <Redirect href="/(onboarding)/onboarding" />;
  }

  return <KycPendingHome />;
}
