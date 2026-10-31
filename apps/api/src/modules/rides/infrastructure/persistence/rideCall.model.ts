import mongoose, { Schema } from 'mongoose';
import { RIDE_CALL_STATES } from '@cabzone/contracts';

export interface RideCallDocument {
  _id: string;
  ride_id: string;
  caller_user_id: string;
  callee_user_id: string;
  caller_installation_id: string;
  callee_installation_id: string | null;
  client_request_id: string;
  room_name: string;
  caller_participant_id: string;
  callee_participant_id: string;
  joined_participant_ids?: string[];
  state: (typeof RIDE_CALL_STATES)[number];
  caller_role: 'RIDER' | 'DRIVER';
  ringing_until: Date;
  join_until: Date | null;
  connected_at: Date | null;
  ended_at: Date | null;
  end_reason: string | null;
  cleanup_pending: boolean;
  active_user_ids?: string[];
  version: number;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
}

const schema = new Schema<RideCallDocument>(
  {
    _id: { type: String, required: true },
    ride_id: { type: String, required: true, index: true },
    caller_user_id: { type: String, required: true },
    callee_user_id: { type: String, required: true },
    caller_installation_id: { type: String, required: true },
    callee_installation_id: { type: String, default: null },
    client_request_id: { type: String, required: true },
    room_name: { type: String, required: true },
    caller_participant_id: { type: String, required: true },
    callee_participant_id: { type: String, required: true },
    joined_participant_ids: { type: [String], default: [] },
    state: { type: String, enum: RIDE_CALL_STATES, required: true },
    caller_role: { type: String, enum: ['RIDER', 'DRIVER'], required: true },
    ringing_until: { type: Date, required: true },
    join_until: { type: Date, default: null },
    connected_at: { type: Date, default: null },
    ended_at: { type: Date, default: null },
    end_reason: { type: String, default: null },
    cleanup_pending: { type: Boolean, default: false },
    active_user_ids: { type: [String], default: undefined },
    version: { type: Number, required: true },
    created_at: { type: Date, required: true },
    updated_at: { type: Date, required: true },
    expires_at: { type: Date, required: true },
  },
  { collection: 'ride_calls', versionKey: false },
);

schema.index(
  { caller_user_id: 1, client_request_id: 1 },
  { unique: true, name: 'ride_call_request_once' },
);
schema.index(
  { ride_id: 1 },
  {
    unique: true,
    partialFilterExpression: { active_user_ids: { $exists: true } },
    name: 'one_active_call_per_ride',
  },
);
schema.index(
  { active_user_ids: 1 },
  {
    unique: true,
    partialFilterExpression: { active_user_ids: { $exists: true } },
    name: 'one_active_call_per_user',
  },
);
schema.index({ ringing_until: 1, state: 1 });
schema.index({ join_until: 1, state: 1 });
schema.index({ cleanup_pending: 1, updated_at: 1 });
schema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const RideCallModel =
  (mongoose.models.RideCall as mongoose.Model<RideCallDocument> | undefined) ??
  mongoose.model<RideCallDocument>('RideCall', schema);
