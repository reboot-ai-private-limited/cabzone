export interface RidePaymentGateway {
  readonly keyId: string;
  createOrder(amountPaise: number, rideId: string): Promise<string>;
  verifySignature(orderId: string, paymentId: string, signature: string): void;
  findCapturedPayment(orderId: string, amountPaise: number): Promise<string | null>;
}
