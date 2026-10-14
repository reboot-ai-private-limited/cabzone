import mongoose, { Schema } from 'mongoose';
import type { OtpRecord, OtpStorePort } from '../domain/index.js';

const otpSchema = new Schema<OtpRecord>({
  phoneE164: { type: String, required: true, unique: true },
  otpHmac: { type: String, required: true },
  attempts: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
  lastSentAt: { type: Date, required: true },
}, { collection: 'otp_challenges', versionKey: false });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const OtpModel = mongoose.models.OtpChallenge as mongoose.Model<OtpRecord> | undefined ??
  mongoose.model<OtpRecord>('OtpChallenge', otpSchema);

export class MongoOtpStoreAdapter implements OtpStorePort {
  async save(record: OtpRecord): Promise<void> {
    await OtpModel.findOneAndUpdate({ phoneE164: record.phoneE164 }, record, { upsert: true });
  }

  async reserve(record: OtpRecord, cooldownSeconds: number): Promise<boolean> {
    await OtpModel.init();
    try {
      await OtpModel.findOneAndUpdate({
        phoneE164: record.phoneE164,
        $or: [{ lastSentAt: { $lte: new Date(record.lastSentAt.getTime() - cooldownSeconds * 1000) } }, { expiresAt: { $lte: record.lastSentAt } }],
      }, record, { upsert: true });
      return true;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) return false;
      throw error;
    }
  }

  async get(phoneE164: string): Promise<OtpRecord | null> {
    return OtpModel.findOne({ phoneE164, expiresAt: { $gt: new Date() } }).lean().exec();
  }

  async consume(phoneE164: string, expectedHmac: string, maxAttempts: number): Promise<boolean> {
    const record = await OtpModel.findOneAndDelete({ phoneE164, otpHmac: expectedHmac, attempts: { $lt: maxAttempts }, expiresAt: { $gt: new Date() } });
    return record !== null;
  }

  async incrementAttempts(phoneE164: string, expectedHmac?: string): Promise<number> {
    const record = await OtpModel.findOneAndUpdate({ phoneE164, ...(expectedHmac ? { otpHmac: expectedHmac } : {}) }, { $inc: { attempts: 1 } }, { new: true });
    return record?.attempts ?? 0;
  }

  async delete(phoneE164: string): Promise<void> {
    await OtpModel.deleteOne({ phoneE164 });
  }
}
