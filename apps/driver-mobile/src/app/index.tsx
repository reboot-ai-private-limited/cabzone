import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/context/auth-context';
import { AuthScreen } from '@/components/auth/auth-screen';
import { DriverHome } from '@/components/driver/driver-home';
import { KycPendingHome } from '@/components/kyc/kyc-pending-home';
import { KycWizard } from '@/components/kyc/kyc-wizard';

export default function HomeScreen() {
  const {
    isAuthenticated,
    isLoading,
    driver,
    application,
    isKycVerified,
    hasVehicle,
  } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#002451" />
      </View>
    );
  }

  // 1. Not Authenticated -> Flows 1-4 (Entry, Vehicle Type, Phone, OTP)
  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  // 2. Approved Driver with vehicle -> Flows 14-16 (Approved Driver Dashboard / OFFLINE / ONLINE)
  if (isKycVerified && hasVehicle) {
    return <DriverHome />;
  }

  // 3. Application submitted / under review -> Flow 13 (KYC Pending Home)
  const appStatus = application?.status;
  const isUnderReview =
    appStatus === 'SUBMITTED' ||
    appStatus === 'UNDER_REVIEW_AUTO' ||
    appStatus === 'UNDER_REVIEW_ADMIN' ||
    (driver && driver.kycStatus === 'PENDING' && appStatus !== 'DRAFT' && !!appStatus);

  if (isUnderReview) {
    return <KycPendingHome />;
  }

  // 4. Incomplete Onboarding / Draft Application -> Flows 5-12 (KYC Onboarding Wizard)
  return <KycWizard />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
