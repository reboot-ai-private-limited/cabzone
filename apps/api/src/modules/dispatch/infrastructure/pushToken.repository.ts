import mongoose, { Schema } from 'mongoose';
import type { PushTokenPort } from '../application/pushToken.port.js';

interface PushTokenDocument {
  _id: string;
  user_id: string;
  token: string;
  updated_at: Date;
}

const schema = new Schema<PushTokenDocument>({
  _id: { type: String, required: true },
  user_id: { type: String, required: true, index: true },
  token: { type: String, required: true, unique: true },
  updated_at: { type: Date, required: true },
}, { collection: 'driver_push_tokens', versionKey: false });

const PushTokenModel = mongoose.models.DriverPushToken as mongoose.Model<PushTokenDocument> | undefined
  ?? mongoose.model<PushTokenDocument>('DriverPushToken', schema);

export class MongoPushTokenRepository implements PushTokenPort {
  async put(userId: string, installationId: string, token: string): Promise<void> {
    await PushTokenModel.deleteOne({ token, _id: { $ne: installationId } });
    await PushTokenModel.updateOne(
      { _id: installationId },
      { $set: { user_id: userId, token, updated_at: new Date() } },
      { upsert: true },
    );
  }

  async remove(userId: string, installationId: string): Promise<void> {
    await PushTokenModel.deleteOne({ _id: installationId, user_id: userId });
  }

  async list(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const docs = await PushTokenModel.find({ user_id: { $in: userIds } }).select('token').lean();
    return docs.map((doc) => doc.token);
  }

  async removeToken(token: string): Promise<void> {
    await PushTokenModel.deleteOne({ token });
  }
}

export class MemoryPushTokenRepository implements PushTokenPort {
  private readonly tokens = new Map<string, { userId: string; token: string }>();

  async put(userId: string, installationId: string, token: string): Promise<void> {
    for (const [id, record] of this.tokens) if (record.token === token && id !== installationId) this.tokens.delete(id);
    this.tokens.set(installationId, { userId, token });
  }

  async remove(userId: string, installationId: string): Promise<void> {
    if (this.tokens.get(installationId)?.userId === userId) this.tokens.delete(installationId);
  }

  async list(userIds: string[]): Promise<string[]> {
    const selected = new Set(userIds);
    return [...this.tokens.values()].filter((item) => selected.has(item.userId)).map((item) => item.token);
  }

  async removeToken(token: string): Promise<void> {
    for (const [id, record] of this.tokens) if (record.token === token) this.tokens.delete(id);
  }
}
