import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/context/auth-context';
import { PhoneStep } from './phone-step';
import { OtpStep } from './otp-step';

export function AuthScreen() {
  const { step } = useAuth();

  return (
    <View style={styles.container}>
      {step === 'phone' ? <PhoneStep /> : <OtpStep />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#002451',
    justifyContent: 'center',
  },
});
