import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/context/auth-context';
import { EntryStep } from './entry-step';
import { VehicleTypeStep } from './vehicle-type-step';
import { PhoneStep } from './phone-step';
import { OtpStep } from './otp-step';

type PreAuthStep = 'entry' | 'vehicle-type' | 'phone';

export function AuthScreen() {
  const { step } = useAuth();
  const [preAuthStep, setPreAuthStep] = useState<PreAuthStep>('entry');

  if (step === 'otp') {
    return (
      <View style={styles.container}>
        <OtpStep />
      </View>
    );
  }

  if (preAuthStep === 'entry') {
    return (
      <EntryStep
        onBecomeDriver={() => setPreAuthStep('vehicle-type')}
        onLogin={() => setPreAuthStep('phone')}
      />
    );
  }

  if (preAuthStep === 'vehicle-type') {
    return (
      <VehicleTypeStep
        onSelect={(_type) => {
          setPreAuthStep('phone');
        }}
        onBack={() => setPreAuthStep('entry')}
      />
    );
  }

  return (
    <View style={styles.container}>
      <PhoneStep onBack={() => setPreAuthStep('entry')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
});
