export interface PaymentEventEntity {
  id: string;
  paymentId: string | null;
  provider: string;
  providerEventId: string;
  eventType: string;
  payloadHash: string;
  payload: Record<string, unknown>;
  processedAt: Date | null;
  createdAt: Date;
}
