import type { PaymentEntity, PaymentQrSnapshot } from '../../domain/payment.entity.js';
import type {
  PaymentRepositoryPort,
  RecordPaymentWebhookEventInput,
} from '../../domain/payment.port.js';
import { PaymentModel, type PaymentDocument } from './payment.model.js';
import { PaymentEventModel } from './paymentEvent.model.js';

function isDuplicateKeyError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code?: unknown }).code === 11000
  );
}

type LeanPaymentDoc = Pick<
  PaymentDocument,
  | '_id'
  | 'ride_id'
  | 'payer_rider_id'
  | 'method'
  | 'channel'
  | 'amount_paise'
  | 'attempt'
  | 'idempotency_key'
  | 'status'
  | 'provider'
  | 'gateway_ref'
  | 'provider_payment_id'
  | 'qr'
  | 'metadata'
  | 'last_polled_at'
  | 'confirmed_at'
  | 'created_at'
  | 'updated_at'
>;

function toEntity(doc: LeanPaymentDoc): PaymentEntity {
  return {
    id: doc._id,
    rideId: doc.ride_id,
    payerRiderId: doc.payer_rider_id,
    method: doc.method,
    channel: doc.channel ?? 'QR',
    amountPaise: doc.amount_paise,
    attempt: doc.attempt ?? 1,
    idempotencyKey: doc.idempotency_key,
    status: doc.status,
    provider: doc.provider ?? null,
    gatewayRef: doc.gateway_ref ?? null,
    providerPaymentId: doc.provider_payment_id ?? null,
    qr: doc.qr
      ? {
          upiUri: doc.qr.upi_uri ?? null,
          imageUrl: doc.qr.image_url ?? null,
          expiresAt: new Date(doc.qr.expires_at),
        }
      : null,
    metadata:
      doc.metadata && typeof doc.metadata === 'object'
        ? { ...(doc.metadata as Record<string, unknown>) }
        : {},
    lastPolledAt: doc.last_polled_at ? new Date(doc.last_polled_at) : null,
    confirmedAt: doc.confirmed_at ? new Date(doc.confirmed_at) : null,
    createdAt: new Date(doc.created_at),
    updatedAt: new Date(doc.updated_at),
  };
}

export class MongoPaymentRepository implements PaymentRepositoryPort {
  async hasWebhookEvent(provider: string, providerEventId: string): Promise<boolean> {
    return Boolean(
      await PaymentEventModel.exists({ provider, provider_event_id: providerEventId }),
    );
  }

  async insertCreated(
    payment: PaymentEntity,
  ): Promise<{ payment: PaymentEntity; inserted: boolean }> {
    try {
      const created = await PaymentModel.create({
        _id: payment.id,
        ride_id: payment.rideId,
        payer_rider_id: payment.payerRiderId,
        method: payment.method,
        channel: payment.channel,
        amount_paise: payment.amountPaise,
        attempt: payment.attempt,
        idempotency_key: payment.idempotencyKey,
        status: payment.status,
        provider: payment.provider,
        gateway_ref: payment.gatewayRef,
        provider_payment_id: payment.providerPaymentId,
        qr: payment.qr
          ? {
              upi_uri: payment.qr.upiUri,
              image_url: payment.qr.imageUrl,
              expires_at: payment.qr.expiresAt,
            }
          : null,
        metadata: payment.metadata,
        last_polled_at: payment.lastPolledAt,
        confirmed_at: payment.confirmedAt,
        created_at: payment.createdAt,
        updated_at: payment.updatedAt,
      });
      return { payment: toEntity(created.toObject() as LeanPaymentDoc), inserted: true };
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        const existing = await PaymentModel.findOne({
          idempotency_key: payment.idempotencyKey,
        }).lean<LeanPaymentDoc>();
        if (existing) {
          return { payment: toEntity(existing), inserted: false };
        }
      }
      throw err;
    }
  }

  async findById(id: string): Promise<PaymentEntity | null> {
    const doc = await PaymentModel.findById(id).lean<LeanPaymentDoc>();
    return doc ? toEntity(doc) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<PaymentEntity | null> {
    const doc = await PaymentModel.findOne({
      idempotency_key: idempotencyKey,
    }).lean<LeanPaymentDoc>();
    return doc ? toEntity(doc) : null;
  }

  async findByGatewayRef(gatewayRef: string): Promise<PaymentEntity | null> {
    const doc = await PaymentModel.findOne({ gateway_ref: gatewayRef }).lean<LeanPaymentDoc>();
    return doc ? toEntity(doc) : null;
  }

  async listQrByRideId(rideId: string): Promise<PaymentEntity[]> {
    const docs = await PaymentModel.find({ ride_id: rideId, channel: 'QR' })
      .sort({ created_at: -1, attempt: -1 })
      .lean<LeanPaymentDoc[]>();
    return docs.map(toEntity);
  }

  async markPendingWithQr(
    id: string,
    input: {
      provider: string;
      gatewayRef: string;
      qr: PaymentQrSnapshot;
      now: Date;
    },
  ): Promise<PaymentEntity | null> {
    const updated = await PaymentModel.findOneAndUpdate(
      { _id: id, status: 'CREATED' },
      {
        $set: {
          status: 'PENDING',
          provider: input.provider,
          gateway_ref: input.gatewayRef,
          qr: {
            upi_uri: input.qr.upiUri,
            image_url: input.qr.imageUrl,
            expires_at: input.qr.expiresAt,
          },
          updated_at: input.now,
        },
      },
      { new: true },
    ).lean<LeanPaymentDoc>();
    return updated ? toEntity(updated) : null;
  }

  async markFailedIfOpen(id: string, now: Date): Promise<PaymentEntity | null> {
    const updated = await PaymentModel.findOneAndUpdate(
      { _id: id, status: { $in: ['CREATED', 'PENDING'] } },
      { $set: { status: 'FAILED', updated_at: now } },
      { new: true },
    ).lean<LeanPaymentDoc>();
    if (updated) return toEntity(updated);
    return this.findById(id);
  }

  async claimGatewayPoll(id: string, now: Date, minIntervalMs: number): Promise<boolean> {
    const cutoff = new Date(now.getTime() - minIntervalMs);
    const res = await PaymentModel.updateOne(
      {
        _id: id,
        status: { $in: ['PENDING', 'FAILED'] },
        $or: [{ last_polled_at: null }, { last_polled_at: { $lte: cutoff } }],
      },
      { $set: { last_polled_at: now, updated_at: now } },
    );
    return res.modifiedCount > 0;
  }

  async captureIfPending(
    id: string,
    providerPaymentId: string,
    now: Date,
  ): Promise<{ payment: PaymentEntity | null; justCaptured: boolean }> {
    const prior = await PaymentModel.findOneAndUpdate(
      { _id: id, status: { $in: ['PENDING', 'FAILED'] } },
      {
        $set: {
          status: 'CAPTURED',
          provider_payment_id: providerPaymentId,
          confirmed_at: now,
          updated_at: now,
        },
      },
      { new: false },
    ).lean<LeanPaymentDoc>();
    if (prior) {
      return {
        payment: toEntity({
          ...prior,
          status: 'CAPTURED',
          provider_payment_id: providerPaymentId,
          confirmed_at: now,
          updated_at: now,
        }),
        justCaptured: true,
      };
    }
    const existing = await this.findById(id);
    return { payment: existing, justCaptured: false };
  }

  async recordWebhookEvent(event: RecordPaymentWebhookEventInput): Promise<boolean> {
    try {
      await PaymentEventModel.create({
        _id: event.id,
        payment_id: event.paymentId,
        provider: event.provider,
        provider_event_id: event.providerEventId,
        event_type: event.eventType,
        payload_hash: event.payloadHash,
        payload: event.payload,
        processed_at: event.processedAt,
        created_at: event.createdAt,
      });
      return true;
    } catch (err) {
      if (isDuplicateKeyError(err)) return false;
      throw err;
    }
  }
}

function clonePayment(p: PaymentEntity): PaymentEntity {
  return {
    ...p,
    qr: p.qr ? { ...p.qr, expiresAt: new Date(p.qr.expiresAt) } : null,
    metadata: { ...p.metadata },
    lastPolledAt: p.lastPolledAt ? new Date(p.lastPolledAt) : null,
    confirmedAt: p.confirmedAt ? new Date(p.confirmedAt) : null,
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
  };
}

export class MemoryPaymentRepository implements PaymentRepositoryPort {
  private readonly rows = new Map<string, PaymentEntity>();
  private readonly byKey = new Map<string, string>();
  private readonly seenWebhookEvents = new Set<string>();

  async hasWebhookEvent(provider: string, providerEventId: string): Promise<boolean> {
    return this.seenWebhookEvents.has(`${provider}:${providerEventId}`);
  }

  async insertCreated(
    payment: PaymentEntity,
  ): Promise<{ payment: PaymentEntity; inserted: boolean }> {
    const existingId = this.byKey.get(payment.idempotencyKey);
    if (existingId) {
      const existing = this.rows.get(existingId)!;
      return { payment: clonePayment(existing), inserted: false };
    }
    const stored = clonePayment(payment);
    this.rows.set(stored.id, stored);
    this.byKey.set(stored.idempotencyKey, stored.id);
    return { payment: clonePayment(stored), inserted: true };
  }

  async findById(id: string): Promise<PaymentEntity | null> {
    const row = this.rows.get(id);
    return row ? clonePayment(row) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<PaymentEntity | null> {
    const id = this.byKey.get(idempotencyKey);
    if (!id) return null;
    return this.findById(id);
  }

  async findByGatewayRef(gatewayRef: string): Promise<PaymentEntity | null> {
    for (const row of this.rows.values()) {
      if (row.gatewayRef === gatewayRef) return clonePayment(row);
    }
    return null;
  }

  async listQrByRideId(rideId: string): Promise<PaymentEntity[]> {
    const items: PaymentEntity[] = [];
    for (const row of this.rows.values()) {
      if (row.rideId === rideId && row.channel === 'QR') {
        items.push(clonePayment(row));
      }
    }
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.attempt - a.attempt);
    return items;
  }

  async markPendingWithQr(
    id: string,
    input: {
      provider: string;
      gatewayRef: string;
      qr: PaymentQrSnapshot;
      now: Date;
    },
  ): Promise<PaymentEntity | null> {
    const row = this.rows.get(id);
    if (!row || row.status !== 'CREATED') return null;
    const updated: PaymentEntity = {
      ...row,
      status: 'PENDING',
      provider: input.provider,
      gatewayRef: input.gatewayRef,
      qr: {
        upiUri: input.qr.upiUri,
        imageUrl: input.qr.imageUrl,
        expiresAt: new Date(input.qr.expiresAt),
      },
      updatedAt: new Date(input.now),
    };
    this.rows.set(id, updated);
    return clonePayment(updated);
  }

  async markFailedIfOpen(id: string, now: Date): Promise<PaymentEntity | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    if (row.status === 'CREATED' || row.status === 'PENDING') {
      const updated: PaymentEntity = {
        ...row,
        status: 'FAILED',
        updatedAt: new Date(now),
      };
      this.rows.set(id, updated);
      return clonePayment(updated);
    }
    return clonePayment(row);
  }

  async claimGatewayPoll(id: string, now: Date, minIntervalMs: number): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || !['PENDING', 'FAILED'].includes(row.status)) return false;
    if (row.lastPolledAt && now.getTime() - row.lastPolledAt.getTime() < minIntervalMs) {
      return false;
    }
    this.rows.set(id, {
      ...row,
      lastPolledAt: new Date(now),
      updatedAt: new Date(now),
    });
    return true;
  }

  async captureIfPending(
    id: string,
    providerPaymentId: string,
    now: Date,
  ): Promise<{ payment: PaymentEntity | null; justCaptured: boolean }> {
    const row = this.rows.get(id);
    if (!row) return { payment: null, justCaptured: false };
    if (row.status !== 'PENDING' && row.status !== 'FAILED') {
      return { payment: clonePayment(row), justCaptured: false };
    }
    const updated: PaymentEntity = {
      ...row,
      status: 'CAPTURED',
      providerPaymentId,
      confirmedAt: new Date(now),
      updatedAt: new Date(now),
    };
    this.rows.set(id, updated);
    return { payment: clonePayment(updated), justCaptured: true };
  }

  async recordWebhookEvent(event: RecordPaymentWebhookEventInput): Promise<boolean> {
    const key = `${event.provider}:${event.providerEventId}`;
    if (this.seenWebhookEvents.has(key)) return false;
    this.seenWebhookEvents.add(key);
    return true;
  }
}
