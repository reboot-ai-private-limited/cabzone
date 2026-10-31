import type { RideStatus } from './rides.js';

export const RIDE_COMMUNICATION_STATUSES: readonly RideStatus[] = [
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'TRIP_STARTED',
];

export interface RideCommunicationAccessDto {
  rideId: string;
  eligible: true;
  participantRole: 'RIDER' | 'DRIVER';
}

export const RIDE_CHAT_MAX_LENGTH = 300;
export const RIDE_CHAT_PAGE_SIZE = 30;
export const RIDE_CHAT_RATE_LIMIT_PER_MIN = 20;
export const RIDE_CHAT_RETENTION_MS = 24 * 60 * 60 * 1000;
export const RIDE_CHAT_QUICK_REPLIES = {
  RIDER: ["I'm at pickup", 'Please wait', 'Where are you?'],
  DRIVER: ["I've arrived", 'Arriving shortly', 'Please come to pickup'],
} as const;

export interface RideChatMessageDto {
  id: string;
  rideId: string;
  clientMessageId: string;
  senderRole: 'RIDER' | 'DRIVER';
  sequence: number;
  text: string;
  createdAt: string;
}

export interface RideChatPageDto {
  messages: RideChatMessageDto[];
  hasMore: boolean;
}
