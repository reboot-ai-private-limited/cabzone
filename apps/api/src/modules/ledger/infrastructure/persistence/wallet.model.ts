import mongoose, { type Document, Schema } from 'mongoose';
import { WALLET_STATUSES, type WalletStatus } from '@cabzone/contracts';

export interface WalletDocument extends Document<string> {
  _id: string;
  driver_id: string;
  balance_paise: number;
  status: WalletStatus;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const walletSchema = new Schema<WalletDocument>(
  {
    _id: { type: String, required: true },
    driver_id: { type: String, required: true, unique: true },
    balance_paise: { type: Number, default: 0 },
    status: {
      type: String,
      enum: WALLET_STATUSES,
      default: 'ACTIVE',
      index: true,
    },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'wallets',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    _id: false,
    versionKey: false,
  },
);

export const WalletModel: mongoose.Model<WalletDocument> =
  (mongoose.models.Wallet as mongoose.Model<WalletDocument>) ||
  mongoose.model<WalletDocument>('Wallet', walletSchema);
