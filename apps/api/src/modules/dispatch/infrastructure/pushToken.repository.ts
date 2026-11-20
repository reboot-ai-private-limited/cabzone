import mongoose, { Schema } from 'mongoose';
import { PUSH_TOKEN_TRANSPORTS, type PushTokenTransport } from '@cabzone/contracts';
import type { PushTokenMetadata, PushTokenPort } from '../application/pushToken.port.js';

interface PushTokenDocument {
  _id: string;
  installation_id?: string | undefined;
  user_id: string;
  token: string;
  platform?: 'android' | 'ios' | undefined;
  transport?: PushTokenTransport | undefined;
  updated_at: Date;
}

const schema = new Schema<PushTokenDocument>(
  {
    _id: { type: String, required: true },
    installation_id: { type: String, index: true },
    user_id: { type: String, required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['android', 'ios'] },
    transport: { type: String, enum: PUSH_TOKEN_TRANSPORTS, default: 'EXPO' },
    updated_at: { type: Date, required: true },
  },
  { collection: 'driver_push_tokens', versionKey: false },
);

const PushTokenModel =
  (mongoose.models.DriverPushToken as mongoose.Model<PushTokenDocument> | undefined) ??
  mongoose.model<PushTokenDocument>('DriverPushToken', schema);

function recordKey(installationId: string, transport: PushTokenTransport): string {
  return transport === 'EXPO' ? installationId : `${installationId}:${transport}`;
}

export class MongoPushTokenRepository implements PushTokenPort {
  async hasInstallation(userId: string, installationId: string): Promise<boolean> {
    return Boolean(
      await PushTokenModel.exists({
        user_id: userId,
        $or: [{ _id: installationId }, { installation_id: installationId }],
      }),
    );
  }

  async put(
    userId: string,
    installationId: string,
    token: string,
    meta?: PushTokenMetadata,
  ): Promise<void> {
    const transport: PushTokenTransport = meta?.transport ?? 'EXPO';
    const key = recordKey(installationId, transport);
    await PushTokenModel.deleteOne({ token, _id: { $ne: key } });
    await PushTokenModel.updateOne(
      { _id: key },
      {
        $set: {
          installation_id: installationId,
          user_id: userId,
          token,
          transport,
          ...(meta?.platform ? { platform: meta.platform } : {}),
          updated_at: new Date(),
        },
      },
      { upsert: true },
    );
  }

  async remove(userId: string, installationId: string): Promise<void> {
    await PushTokenModel.deleteMany({
      user_id: userId,
      $or: [
        { _id: installationId },
        { installation_id: installationId },
        { _id: `${installationId}:FCM` },
        { _id: `${installationId}:FCM_CALL` },
        { _id: `${installationId}:APNS_VOIP` },
        { _id: `${installationId}:APNS` },
      ],
    });
  }

  async list(userIds: string[], transport: PushTokenTransport = 'EXPO'): Promise<string[]> {
    if (userIds.length === 0) return [];
    const transportFilter =
      transport === 'EXPO'
        ? { $or: [{ transport: 'EXPO' }, { transport: { $exists: false } }] }
        : { transport };
    const docs = await PushTokenModel.find({
      user_id: { $in: userIds },
      ...transportFilter,
    })
      .select('token')
      .lean();
    return docs.map((doc) => doc.token);
  }

  async removeToken(token: string): Promise<void> {
    await PushTokenModel.deleteOne({ token });
  }
}

export class MemoryPushTokenRepository implements PushTokenPort {
  private readonly tokens = new Map<
    string,
    {
      userId: string;
      installationId: string;
      token: string;
      transport: PushTokenTransport;
      platform?: 'android' | 'ios' | undefined;
    }
  >();

  async hasInstallation(userId: string, installationId: string): Promise<boolean> {
    for (const record of this.tokens.values()) {
      if (record.userId === userId && record.installationId === installationId) return true;
    }
    return false;
  }

  async put(
    userId: string,
    installationId: string,
    token: string,
    meta?: PushTokenMetadata,
  ): Promise<void> {
    const transport: PushTokenTransport = meta?.transport ?? 'EXPO';
    const key = recordKey(installationId, transport);
    for (const [id, record] of this.tokens) {
      if (record.token === token && id !== key) this.tokens.delete(id);
    }
    this.tokens.set(key, {
      userId,
      installationId,
      token,
      transport,
      platform: meta?.platform,
    });
  }

  async remove(userId: string, installationId: string): Promise<void> {
    for (const [id, record] of this.tokens) {
      if (record.userId === userId && record.installationId === installationId) {
        this.tokens.delete(id);
      }
    }
  }

  async list(userIds: string[], transport: PushTokenTransport = 'EXPO'): Promise<string[]> {
    const selected = new Set(userIds);
    return [...this.tokens.values()]
      .filter((item) => selected.has(item.userId) && item.transport === transport)
      .map((item) => item.token);
  }

  async removeToken(token: string): Promise<void> {
    for (const [id, record] of this.tokens) {
      if (record.token === token) this.tokens.delete(id);
    }
  }
}
