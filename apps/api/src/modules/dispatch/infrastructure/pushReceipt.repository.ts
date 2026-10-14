import mongoose, { Schema } from 'mongoose';
import type { PendingPushReceipt, PushReceiptPort } from '../application/pushReceipt.port.js';

interface PushReceiptDocument {
  _id: string;
  token: string;
  check_after: Date;
  created_at: Date;
}

const schema = new Schema<PushReceiptDocument>({
  _id: { type: String, required: true },
  token: { type: String, required: true },
  check_after: { type: Date, required: true, index: true },
  created_at: { type: Date, required: true, expires: 172_800 },
}, { collection: 'driver_push_receipts', versionKey: false });

const PushReceiptModel = mongoose.models.DriverPushReceipt as mongoose.Model<PushReceiptDocument> | undefined
  ?? mongoose.model<PushReceiptDocument>('DriverPushReceipt', schema);

export class MongoPushReceiptRepository implements PushReceiptPort {
  async add(id: string, token: string, checkAfter: Date): Promise<void> {
    await PushReceiptModel.updateOne(
      { _id: id },
      { $setOnInsert: { token, check_after: checkAfter, created_at: new Date() } },
      { upsert: true },
    );
  }

  async due(now: Date, limit: number): Promise<PendingPushReceipt[]> {
    const docs = await PushReceiptModel.find({ check_after: { $lte: now } }).limit(limit).lean();
    return docs.map((doc) => ({ id: doc._id, token: doc.token }));
  }

  async postpone(id: string, checkAfter: Date): Promise<void> {
    await PushReceiptModel.updateOne({ _id: id }, { $set: { check_after: checkAfter } });
  }

  async remove(id: string): Promise<void> {
    await PushReceiptModel.deleteOne({ _id: id });
  }
}

export class MemoryPushReceiptRepository implements PushReceiptPort {
  private readonly records = new Map<string, { token: string; checkAfter: Date }>();

  async add(id: string, token: string, checkAfter: Date): Promise<void> {
    this.records.set(id, { token, checkAfter });
  }

  async due(now: Date, limit: number): Promise<PendingPushReceipt[]> {
    return [...this.records].filter(([, item]) => item.checkAfter <= now).slice(0, limit)
      .map(([id, item]) => ({ id, token: item.token }));
  }

  async postpone(id: string, checkAfter: Date): Promise<void> {
    const record = this.records.get(id);
    if (record) record.checkAfter = checkAfter;
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id);
  }
}
