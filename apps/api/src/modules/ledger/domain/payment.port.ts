import type { PaymentEntity, PaymentQrSnapshot } from './payment.entity.js';

export interface RecordPaymentWebhookEventInput {
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

export interface PaymentRepositoryPort {
  /**
   * Write-first insert under unique `idempotencyKey`.
   * If a row with the same `idempotencyKey` already exists, returns `{ payment: existing, inserted: false }`.
   */
  insertCreated(payment: PaymentEntity): Promise<{ payment: PaymentEntity; inserted: boolean }>;

  findById(id: string): Promise<PaymentEntity | null>;

  findByIdempotencyKey(idempotencyKey: string): Promise<PaymentEntity | null>;

  findByGatewayRef(gatewayRef: string): Promise<PaymentEntity | null>;

  listQrByRideId(rideId: string): Promise<PaymentEntity[]>;

  markPendingWithQr(
    id: string,
    input: {
      provider: string;
      gatewayRef: string;
      qr: PaymentQrSnapshot;
      now: Date;
    },
  ): Promise<PaymentEntity | null>;

  /**
   * Moves CREATED or PENDING -> FAILED. Never overwrites CAPTURED or CONFIRMED.
   */
  markFailedIfOpen(id: string, now: Date): Promise<PaymentEntity | null>;

  /**
   * Atomically claims a gateway poll slot if `lastPolledAt` is null or older than `minIntervalMs`.
   */
  claimGatewayPoll(id: string, now: Date, minIntervalMs: number): Promise<boolean>;

  /**
   * Single compare-and-swap moving PENDING or FAILED -> CAPTURED.
   * Exactly one caller receives `justCaptured: true`; subsequent callers receive `justCaptured: false`.
   */
  captureIfPending(
    id: string,
    providerPaymentId: string,
    now: Date,
  ): Promise<{ payment: PaymentEntity | null; justCaptured: boolean }>;

  /**
   * Deduplicates webhook deliveries on `(provider, providerEventId)`.
   * Returns `true` when recorded for the first time, `false` when already seen.
   */
  recordWebhookEvent(event: RecordPaymentWebhookEventInput): Promise<boolean>;
  hasWebhookEvent(provider: string, providerEventId: string): Promise<boolean>;
}
