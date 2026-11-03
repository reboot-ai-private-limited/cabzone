import mongoose, { Schema } from 'mongoose';
import { AppError } from '../../../../shared/errors/AppError.js';
import type {
  WalletOperation,
  WalletOperationRepository,
} from '../../domain/walletOperation.port.js';

const schema = new Schema<WalletOperation>(
  {
    id: { type: String, required: true, unique: true },
    driverId: { type: String, required: true, index: true },
    kind: { type: String, enum: ['RECHARGE', 'CASHOUT'], required: true },
    status: { type: String, enum: ['CREATED', 'PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED'], required: true },
    amountPaise: { type: Number, required: true, min: 1 },
    rechargePaise: { type: Number, required: true, min: 0 },
    earningsPaise: { type: Number, required: true, min: 0 },
    destinationUpi: { type: String, default: null },
    destinationType: { type: String, enum: ['UPI', 'BANK'], default: 'UPI' },
    destinationLabel: { type: String, default: null },
    destinationBank: {
      type: { accountNumber: String, ifsc: String, accountHolderName: String },
      default: null,
      _id: false,
    },
    orderId: { type: String, default: null },
    providerPaymentId: { type: String, default: null },
    transferReference: { type: String, default: null },
    reason: { type: String, default: null },
    resolvedBy: { type: String, default: null },
    idempotencyKey: { type: String, required: true, unique: true },
    testMode: { type: Boolean, required: true },
    version: { type: Number, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'wallet_operations', versionKey: false, id: false },
);
schema.index({ kind: 1, status: 1, createdAt: -1 });
schema.index({ orderId: 1 }, { sparse: true });
schema.index({ providerPaymentId: 1 }, { sparse: true });
schema.index(
  { transferReference: 1 },
  { unique: true, partialFilterExpression: { transferReference: { $type: 'string' } } },
);
export const WalletOperationModel: mongoose.Model<WalletOperation> =
  (mongoose.models.WalletOperation as mongoose.Model<WalletOperation>) ??
  mongoose.model<WalletOperation>('WalletOperation', schema);

export class MongoWalletOperationRepository implements WalletOperationRepository {
  async find(id: string) {
    return WalletOperationModel.findOne({ id }).lean<WalletOperation>().exec();
  }
  async findByKey(idempotencyKey: string) {
    return WalletOperationModel.findOne({ idempotencyKey }).lean<WalletOperation>().exec();
  }
  async findByOrderId(orderId: string) {
    return WalletOperationModel.findOne({ orderId }).lean<WalletOperation>().exec();
  }
  async save(operation: WalletOperation): Promise<WalletOperation> {
    if (operation.version === 1) {
      await WalletOperationModel.create(operation);
      return operation;
    }
    const saved = await WalletOperationModel.findOneAndUpdate(
      { id: operation.id, version: operation.version - 1 },
      { $set: operation },
      { new: true },
    )
      .lean<WalletOperation>()
      .exec();
    if (!saved) throw AppError.conflict('Wallet request changed. Refresh and try again.');
    return saved;
  }
  async list(
    driverId?: string,
    kind?: WalletOperation['kind'],
    status?: WalletOperation['status'],
  ) {
    return WalletOperationModel.find({
      ...(driverId ? { driverId } : {}),
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean<WalletOperation[]>()
      .exec();
  }
}

export class MemoryWalletOperationRepository implements WalletOperationRepository {
  private readonly entries = new Map<string, WalletOperation>();
  async find(id: string) {
    const value = this.entries.get(id);
    return value ? { ...value } : null;
  }
  async findByKey(key: string) {
    return [...this.entries.values()].find((entry) => entry.idempotencyKey === key) ?? null;
  }
  async findByOrderId(orderId: string) {
    return [...this.entries.values()].find((entry) => entry.orderId === orderId) ?? null;
  }
  async save(value: WalletOperation) {
    const previous = this.entries.get(value.id);
    if ((previous && previous.version !== value.version - 1) || (!previous && value.version !== 1))
      throw AppError.conflict('Wallet request changed.');
    const duplicate = await this.findByKey(value.idempotencyKey);
    if (duplicate && duplicate.id !== value.id)
      throw AppError.conflict('Wallet request already exists.');
    this.entries.set(value.id, { ...value });
    return { ...value };
  }
  async list(
    driverId?: string,
    kind?: WalletOperation['kind'],
    status?: WalletOperation['status'],
  ) {
    return [...this.entries.values()]
      .filter(
        (entry) =>
          (!driverId || entry.driverId === driverId) &&
          (!kind || entry.kind === kind) &&
          (!status || entry.status === status),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 100);
  }
}
