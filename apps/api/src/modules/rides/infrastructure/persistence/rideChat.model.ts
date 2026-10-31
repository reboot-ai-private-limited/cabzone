import mongoose, { Schema } from 'mongoose';
import type { RideChatMessage } from '../../domain/rideChat.port.js';

const schema = new Schema<RideChatMessage>({
  id: { type: String, required: true, unique: true },
  rideId: { type: String, required: true },
  senderUserId: { type: String, required: true },
  senderRole: { type: String, enum: ['RIDER', 'DRIVER'], required: true },
  clientMessageId: { type: String, required: true },
  sequence: { type: Number, required: true },
  text: { type: String, required: true },
  createdAt: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { collection: 'ride_messages', versionKey: false });
schema.index({ rideId: 1, sequence: 1 }, { unique: true });
schema.index({ rideId: 1, senderUserId: 1, clientMessageId: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RideChatModel = (mongoose.models.RideChat as mongoose.Model<RideChatMessage> | undefined)
  ?? mongoose.model<RideChatMessage>('RideChat', schema);
