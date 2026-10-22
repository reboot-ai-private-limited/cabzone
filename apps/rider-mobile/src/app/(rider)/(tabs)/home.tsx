import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RideBookingComposer } from '@/components/booking/ride-booking-composer';
import { colors } from '@/design-system';

export default function HomeCityRidesTab() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <RideBookingComposer mode="IN_CITY" />
    </SafeAreaView>
  );
}
