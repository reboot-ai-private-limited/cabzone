import mongoose, { type Document, Schema } from 'mongoose';
import {
  PAYMENT_CHANNELS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type PaymentChannel,
  type PaymentMethod,
  type PaymentStatus,
} from '@cabzone/contracts';

export interface PaymentQrSubdocument {
  upi_uri: string | null;
  image_url: string | null;
  expires_at: Date;
}

export interface PaymentDocument extends Document<string> {
  _id: string;
  ride_id: string;
  payer_rider_id: string;
  method: PaymentMethod;
  channel: PaymentChannel;
  amount_paise: number;
  attempt: number;
  idempotency_key: string;
  status: PaymentStatus;
  provider: string | null;
  gateway_ref: string | null;
  provider_payment_id: string | null;
  qr: PaymentQrSubdocument | null;
  metadata: Record<string, unknown>;
  last_polled_at: Date | null;
  confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const qrSubSchema = new Schema<PaymentQrSubdocument>(
  {
    upi_uri: { type: String, default: null },
    image_url: { type: String, default: null },
    expires_at: { type: Date, required: true },
  },
  { _id: false },
);

const paymentSchema = new Schema<PaymentDocument>(
  {
    _id: { type: String, required: true },
    ride_id: { type: String, required: true, index: true },
    payer_rider_id: { type: String, required: true },
    method: {
      type: String,
      enum: PAYMENT_METHODS,
      required: true,
    },
    channel: {
      type: String,
      enum: PAYMENT_CHANNELS,
      default: 'QR',
    },
    amount_paise: { type: Number, required: true, min: 1 },
    attempt: { type: Number, required: true, default: 1, min: 1 },
    idempotency_key: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'CREATED',
      index: true,
    },
    provider: { type: String, default: null },
    gateway_ref: { type: String, default: null },
    provider_payment_id: { type: String, default: null },
    qr: { type: qrSubSchema, default: null },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
    last_polled_at: { type: Date, default: null },
    confirmed_at: { type: Date, default: null },
  },
  {
    collection: 'payments',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    _id: false,
    versionKey: false,
  },
);

paymentSchema.index({ gateway_ref: 1 }, { sparse: true });
paymentSchema.index({ ride_id: 1, channel: 1, created_at: -1 });
paymentSchema.index({ provider: 1, provider_payment_id: 1 });
paymentSchema.index({ payer_rider_id: 1, created_at: -1 });

export const PaymentModel: mongoose.Model<PaymentDocument> =
  (mongoose.models.Payment as mongoose.Model<PaymentDocument>) ||
  mongoose.model<PaymentDocument>('Payment', paymentSchema);
