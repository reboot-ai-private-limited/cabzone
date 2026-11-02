import React, { useEffect, useMemo } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CabzonRideOffer, mapRideOfferDtoToCardData } from '@/components/cards/cabzon-ride-offer';
import { useRide } from '@/context/ride-context';
import { startOfferRing } from '@/services/ringtone';

export function IncomingRideOffer() {
  const router = useRouter();
  const {
    activeOffer,
    isMutatingRide,
    acceptOffer,
    ignoreOffer,
    counterOffer,
    counters,
    rejectedCounters,
  } = useRide();
  const offer = useMemo(
    () => activeOffer ? mapRideOfferDtoToCardData(activeOffer) : null,
    [activeOffer],
  );

  // Ring until the driver accepts or ignores, the offer expires, or 30 seconds pass.
  const ringRideId = activeOffer?.rideId ?? null;
  const ringExpiresAt = activeOffer?.expiresAt ?? null;
  useEffect(() => {
    if (!ringRideId || isMutatingRide) return;
    return startOfferRing(ringRideId, ringExpiresAt);
  }, [ringRideId, ringExpiresAt, isMutatingRide]);

  const handleAccept = async (rideId: string) => {
    const ride = await acceptOffer(rideId);
    if (ride) router.push({ pathname: '/(driver)/ride/[rideId]', params: { rideId: ride.id } });
  };

  return (
    <Modal
      visible={Boolean(offer)}
      transparent
      animationType="none"
      onRequestClose={() => { if (activeOffer) ignoreOffer(activeOffer.rideId); }}>
      <View style={styles.overlay}>
        <CabzonRideOffer
          key={offer?.rideId ?? 'no-offer'}
          offer={offer}
          onAccept={handleAccept}
          onDecline={ignoreOffer}
          onCounter={counterOffer}
          counteredFarePaise={activeOffer ? (counters[activeOffer.rideId] ?? null) : null}
          rejectedFarePaise={activeOffer ? (rejectedCounters[activeOffer.rideId] ?? null) : null}
          isAccepting={isMutatingRide}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.28)' },
});
