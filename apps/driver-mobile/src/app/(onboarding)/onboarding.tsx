import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { KycWizard } from '@/components/kyc/kyc-wizard';

export default function OnboardingWizardRoute() {
  const { application } = useAuth();

  const appStatus = application?.status;
  const isUnderReview =
    appStatus === 'SUBMITTED' ||
    appStatus === 'UNDER_REVIEW_AUTO' ||
    appStatus === 'UNDER_REVIEW_ADMIN' ||
    appStatus === 'REAPPLIED';

  if (isUnderReview) {
    return <Redirect href="/(onboarding)/application-status" />;
  }

  return <KycWizard />;
}
