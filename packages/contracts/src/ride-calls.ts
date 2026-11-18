export const RIDE_CALL_STATES = [
  'RINGING',
  'ACCEPTED',
  'CONNECTED',
  'ENDED',
  'DECLINED',
  'MISSED',
  'CANCELLED',
  'FAILED',
] as const;

export type RideCallState = (typeof RIDE_CALL_STATES)[number];

export const RIDE_CALL_RING_TIMEOUT_MS = 30_000;
export const RIDE_CALL_JOIN_TIMEOUT_MS = 20_000;
export const RIDE_CALL_TOKEN_TTL_S = 120;
export const RIDE_CALL_RATE_LIMIT_PER_MIN = 3;
export const RIDE_CALL_RETENTION_MS = 24 * 60 * 60 * 1000;

export const PUSH_TOKEN_TRANSPORTS = ['FCM', 'EXPO', 'FCM_CALL', 'APNS_VOIP'] as const;
export type PushTokenTransport = (typeof PUSH_TOKEN_TRANSPORTS)[number];

export interface RideCallDto {
  id: string;
  rideId: string;
  state: RideCallState;
  callerRole: 'RIDER' | 'DRIVER';
  createdAt: string;
  ringingUntil: string;
  joinUntil: string | null;
  connectedAt?: string | null | undefined;
}

export interface RideCallTokenDto {
  url: string;
  token: string;
  expiresAt: string;
}
