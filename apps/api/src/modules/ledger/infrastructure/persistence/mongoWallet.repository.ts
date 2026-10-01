import type {
  WalletEntity,
  WalletRepositoryPort,
  WalletTransactionEntity,
} from '../../domain/index.js';
import { WalletModel, type WalletDocument } from './wallet.model.js';
import {
  WalletTransactionModel,
  type WalletTransactionDocument,
} from './walletTransaction.model.js';

export class MongoWalletRepository implements WalletRepositoryPort {
  async findByDriverId(driverId: string): Promise<WalletEntity | null> {
    const doc = await WalletModel.findOne({ driver_id: driverId })
      .lean<WalletDocument | null>()
      .exec();
    return doc ? this.toWallet(doc) : null;
  }

  async save(wallet: WalletEntity): Promise<WalletEntity> {
    const doc = await WalletModel.findByIdAndUpdate(
      wallet.id,
      {
        driver_id: wallet.driverId,
        balance_paise: wallet.balancePaise,
        status: wallet.status,
        version: wallet.version,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
      .lean<WalletDocument>()
      .exec();
    return this.toWallet(doc);
  }

  async recordTransaction(
    transaction: WalletTransactionEntity,
  ): Promise<WalletTransactionEntity> {
    const created = await WalletTransactionModel.create({
      _id: transaction.id,
      wallet_id: transaction.walletId,
      driver_id: transaction.driverId,
      type: transaction.type,
      amount_paise: transaction.amountPaise,
      reference_type: transaction.referenceType,
      reference_id: transaction.referenceId,
      idempotency_key: transaction.idempotencyKey,
      balance_before_paise: transaction.balanceBeforePaise,
      balance_after_paise: transaction.balanceAfterPaise,
      created_by: transaction.createdBy,
      note: transaction.note ?? null,
      created_at: transaction.createdAt,
    });
    return this.toTransaction(created.toObject() as WalletTransactionDocument);
  }

  async findTransactionsByWalletId(walletId: string): Promise<WalletTransactionEntity[]> {
    const docs = await WalletTransactionModel.find({ wallet_id: walletId })
      .sort({ created_at: -1 })
      .lean<WalletTransactionDocument[]>()
      .exec();
    return docs.map((d) => this.toTransaction(d));
  }

  private toWallet(doc: WalletDocument): WalletEntity {
    return {
      id: doc._id,
      driverId: doc.driver_id,
      balancePaise: doc.balance_paise,
      status: doc.status,
      version: doc.version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }

  private toTransaction(doc: WalletTransactionDocument): WalletTransactionEntity {
    return {
      id: doc._id,
      walletId: doc.wallet_id,
      driverId: doc.driver_id,
      type: doc.type,
      amountPaise: doc.amount_paise,
      referenceType: doc.reference_type,
      referenceId: doc.reference_id,
      idempotencyKey: doc.idempotency_key,
      balanceBeforePaise: doc.balance_before_paise,
      balanceAfterPaise: doc.balance_after_paise,
      createdBy: doc.created_by,
      note: doc.note ?? null,
      createdAt: doc.created_at,
    };
  }
}
