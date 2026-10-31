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
  const { token, user, profile } = useAuth();
  const { chatRevision, activeRide, rideHistory, isRealtimeConnected, clearUnreadChat } = useRide();
  const { startCall } = useRideCall();
  const handleOpen = useCallback(() => {
    if (rideId) clearUnreadChat(rideId);
  }, [clearUnreadChat, rideId]);

  if (!token || !user || !rideId) return <Text>Sign in to open ride chat.</Text>;
  const ride =
    activeRide?.id === rideId ? activeRide : (rideHistory.find((r) => r.id === rideId) ?? null);
  const name = ride?.assignedDriver?.name || 'Your driver';
  const rideClosed = Boolean(ride && !RIDE_COMMUNICATION_STATUSES.includes(ride.status));
  const canCall = Boolean(
    !rideClosed && (!ride || !profile?.id || profile.id === ride.bookerRiderId),
  );

  return (
    <RideChatScreen
      key={`${user.id}:${rideId}`}
      token={token}
      rideId={rideId}
      role="RIDER"
      revision={chatRevision}
      name={name}
      connected={isRealtimeConnected}
      rideClosed={rideClosed}
      onOpen={handleOpen}
      onCall={canCall ? () => void startCall(rideId, name) : undefined}
    />
  );
}
