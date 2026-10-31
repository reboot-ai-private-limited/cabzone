import React, { useCallback } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { RIDE_COMMUNICATION_STATUSES } from '@cabzone/contracts';
import { useAuth } from '@/context/auth-context';
import { useRide } from '@/context/ride-context';
import { useRideCall } from '@/context/call-context';
import { RideChatScreen } from '@/components/ride/ride-chat-screen';

export default function RideChatRoute() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { token, user } = useAuth();
  const { chatRevision, activeRide, socketConnected, clearUnreadChat } = useRide();
  const { startCall } = useRideCall();
  const handleOpen = useCallback(() => {
    if (rideId) clearUnreadChat(rideId);
  }, [clearUnreadChat, rideId]);

  if (!token || !user || !rideId) return <Text>Sign in to open ride chat.</Text>;
  const ride = activeRide?.id === rideId ? activeRide : null;
  const name = ride?.passenger.name || 'Your rider';
  const rideClosed = Boolean(ride && !RIDE_COMMUNICATION_STATUSES.includes(ride.status));

  return (
    <RideChatScreen
      key={`${user.id}:${rideId}`}
      token={token}
      rideId={rideId}
      role="DRIVER"
      revision={chatRevision}
      name={name}
      connected={socketConnected}
      rideClosed={rideClosed}
      onOpen={handleOpen}
      onCall={!rideClosed ? () => void startCall(rideId, name) : undefined}
    />
  );
}
