import mongoose, { type Document, Schema } from 'mongoose';
import {
  WALLET_OWNER_TYPES,
  WALLET_STATUSES,
  type WalletOwnerType,
  type WalletStatus,
} from '@cabzone/contracts';

export interface WalletDocument extends Document<string> {
  _id: string;
  owner_type: WalletOwnerType;
  driver_id: string | null;
  rider_id: string | null;
  balance_paise: number;
  earnings_balance_paise: number;
  owed_paise: number;
  status: WalletStatus;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const walletSchema = new Schema<WalletDocument>(
  {
    _id: { type: String, required: true },
    owner_type: {
      type: String,
      enum: WALLET_OWNER_TYPES,
      default: 'DRIVER',
      index: true,
    },
    driver_id: { type: String, default: null, sparse: true, index: true },
    rider_id: { type: String, default: null, sparse: true, index: true },
    balance_paise: { type: Number, default: 0 },
    earnings_balance_paise: { type: Number, default: 0, min: 0 },
    owed_paise: { type: Number, default: 0 },
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

walletSchema.index(
  { rider_id: 1 },
  {
    name: 'one_wallet_per_rider',
    unique: true,
    partialFilterExpression: {
      owner_type: 'RIDER',
      rider_id: { $type: 'string' },
    },
  },
);

export const WalletModel: mongoose.Model<WalletDocument> =
  (mongoose.models.Wallet as mongoose.Model<WalletDocument>) ||
  mongoose.model<WalletDocument>('Wallet', walletSchema);
