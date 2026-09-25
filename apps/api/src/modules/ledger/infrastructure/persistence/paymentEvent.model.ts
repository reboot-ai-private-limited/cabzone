import mongoose, { type Document, Schema } from 'mongoose';

export interface PaymentEventDocument extends Document<string> {
  _id: string;
  payment_id: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  payload_hash: string;
  payload: Record<string, unknown>;
  processed_at: Date | null;
  created_at: Date;
}

const paymentEventSchema = new Schema<PaymentEventDocument>(
  {
    _id: { type: String, required: true },
    payment_id: { type: String, required: true },
    provider: { type: String, required: true },
    provider_event_id: { type: String, required: true },
    event_type: { type: String, required: true },
    payload_hash: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    processed_at: { type: Date, default: null },
    created_at: { type: Date, default: () => new Date() },
  },
  {
    collection: 'payment_events',
    timestamps: false,
    _id: false,
    versionKey: false,
  },
);

paymentEventSchema.index({ provider: 1, provider_event_id: 1 }, { unique: true });
paymentEventSchema.index({ payment_id: 1, created_at: -1 });

export const PaymentEventModel: mongoose.Model<PaymentEventDocument> =
  (mongoose.models.PaymentEvent as mongoose.Model<PaymentEventDocument>) ||
  mongoose.model<PaymentEventDocument>('PaymentEvent', paymentEventSchema);
