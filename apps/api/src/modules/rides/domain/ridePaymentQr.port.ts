export interface RidePaymentQrPort {
  issue(
    rideId: string,
    orderId: string,
    origin: string,
  ): Promise<{ imageDataUrl: string; expiresAt: string }>;
  read(ticket: string): Promise<{ rideId: string; orderId: string }>;
}
