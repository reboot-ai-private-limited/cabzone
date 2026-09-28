import mongoose, { type Document, Schema } from 'mongoose';
import {
  TRANSACTION_REFERENCE_TYPES,
  WALLET_TRANSACTION_TYPES,
  type TransactionReferenceType,
  type WalletTransactionType,
} from '@Cabzone/contracts';

export interface WalletTransactionDocument extends Document<string> {
  _id: string;
  wallet_id: string;
  driver_id: string;
  type: WalletTransactionType;
  amount_paise: number;
  reference_type: TransactionReferenceType;
  reference_id: string | null;
  idempotency_key: string | null;
  balance_before_paise: number;
  balance_after_paise: number;
  created_by: string | null;
  created_at: Date;
}

const walletTransactionSchema = new Schema<WalletTransactionDocument>(
  {
    _id: { type: String, required: true },
    wallet_id: { type: String, required: true },
    driver_id: { type: String, required: true },
    type: {
      type: String,
      enum: WALLET_TRANSACTION_TYPES,
      required: true,
    },
    amount_paise: { type: Number, required: true, min: 1 },
    reference_type: {
      type: String,
      enum: TRANSACTION_REFERENCE_TYPES,
      required: true,
    },
    reference_id: { type: String, default: null },
    idempotency_key: {
      type: String,
      default: null,
      sparse: true,
      unique: true,
    },
    balance_before_paise: { type: Number, required: true },
    balance_after_paise: { type: Number, required: true },
    created_by: { type: String, default: null },
    created_at: { type: Date, default: () => new Date() },
  },
  {
    collection: 'wallet_transactions',
    timestamps: false,
    _id: false,
    versionKey: false,
  },
);

walletTransactionSchema.index({ wallet_id: 1, created_at: -1 });
walletTransactionSchema.index({ driver_id: 1, created_at: -1 });
walletTransactionSchema.index({ reference_type: 1, reference_id: 1 });

export const WalletTransactionModel: mongoose.Model<WalletTransactionDocument> =
  (mongoose.models.WalletTransaction as mongoose.Model<WalletTransactionDocument>) ||
  mongoose.model<WalletTransactionDocument>('WalletTransaction', walletTransactionSchema);
