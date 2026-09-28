import mongoose, { type Document, Schema } from 'mongoose';
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type PaymentMethod,
  type PaymentStatus,
} from '@Cabzone/contracts';

export interface PaymentDocument extends Document<string> {
  _id: string;
  ride_id: string;
  payer_rider_id: string;
  method: PaymentMethod;
  amount_paise: number;
  status: PaymentStatus;
  provider: string | null;
  provider_payment_id: string | null;
  confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

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
    amount_paise: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'CREATED',
      index: true,
    },
    provider: { type: String, default: null },
    provider_payment_id: { type: String, default: null },
    confirmed_at: { type: Date, default: null },
  },
  {
    collection: 'payments',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    _id: false,
    versionKey: false,
  },
);

paymentSchema.index({ provider: 1, provider_payment_id: 1 });
paymentSchema.index({ payer_rider_id: 1, created_at: -1 });

export const PaymentModel: mongoose.Model<PaymentDocument> =
  (mongoose.models.Payment as mongoose.Model<PaymentDocument>) ||
  mongoose.model<PaymentDocument>('Payment', paymentSchema);
