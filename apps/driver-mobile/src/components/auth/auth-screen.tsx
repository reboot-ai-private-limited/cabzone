import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/context/auth-context';
import { EntryStep } from './entry-step';
import { SignupStep } from './signup-step';
import { VehicleTypeStep } from './vehicle-type-step';
import { PhoneStep } from './phone-step';
import { OtpStep } from './otp-step';

type PreAuthStep = 'entry' | 'signup' | 'vehicle-type' | 'phone';

export function AuthScreen() {
  const { step } = useAuth();
  const [preAuthStep, setPreAuthStep] = useState<PreAuthStep>('entry');

  if (preAuthStep === 'entry') {
    return (
      <EntryStep
        onBecomeDriver={() => setPreAuthStep('signup')}
        onLogin={() => setPreAuthStep('signup')}
      />
    );
  }

  if (preAuthStep === 'signup') {
    return <SignupStep onBack={() => setPreAuthStep('entry')} />;
  }

  if (step === 'otp') {
    return (
      <View style={styles.container}>
        <OtpStep />
      </View>
    );
  }

  if (preAuthStep === 'vehicle-type') {
    return (
      <VehicleTypeStep
        onSelect={(_type) => {
          setPreAuthStep('signup');
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
