import type { Room } from 'livekit-client';
import { hasNativeWebRtc } from './voice-bootstrap';

let activeRoom: Room | null = null;

export function setActiveRideCallRoom(room: Room | null): void { activeRoom = room; }

export async function stopActiveRideCallMedia(): Promise<void> {
  const room = activeRoom;
  activeRoom = null;
  try { await room?.disconnect(); } catch { /* local audio still stops below */ }
  if (!hasNativeWebRtc()) return;
  try { await (await import('@livekit/react-native')).AudioSession.stopAudioSession(); }
  catch { /* native voice may be unavailable in Expo Go */ }
}
