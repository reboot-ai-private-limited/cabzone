export interface OfferRecipientsPort {
  save(rideId: string, userIds: string[], expiresAt: Date): Promise<void>;
  take(rideId: string): Promise<string[]>;
}
