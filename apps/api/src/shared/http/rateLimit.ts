import { createHmac } from 'node:crypto';
import mongoose, { Schema } from 'mongoose';
import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { asyncHandler } from './asyncHandler.js';
import { buildErrorBody } from './response.util.js';

interface RateCounter { _id: string; count: number; expiresAt: Date }
const schema = new Schema<RateCounter>({ _id: String, count: Number, expiresAt: Date }, { collection: 'rate_limits', versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const RateModel = mongoose.models.RateCounter as mongoose.Model<RateCounter> | undefined ?? mongoose.model<RateCounter>('RateCounter', schema);

export class MongoRateLimitStore {
  async consume(key: string, limit: number, windowMs: number): Promise<number> {
    const now = new Date();
    const expired = { $lte: [{ $ifNull: ['$expiresAt', now] }, now] };
    const counter = await RateModel.findOneAndUpdate({ _id: key }, [{ $set: {
      count: { $cond: [expired, 1, { $add: ['$count', 1] }] },
      expiresAt: { $cond: [expired, new Date(now.getTime() + windowMs), '$expiresAt'] },
    } }], { upsert: true, new: true }).lean().exec();
    return counter.count <= limit ? 0 : Math.max(1, Math.ceil((counter.expiresAt.getTime() - now.getTime()) / 1000));
  }
}

export function makeRateLimit(label: string, limit: number, windowMs: number): RequestHandler {
  const store = new MongoRateLimitStore();
  return asyncHandler(async (req, res, next) => {
    const key = createHmac('sha256', env.OTP_PEPPER).update(`${label}:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`).digest('hex');
    const retryAfter = await store.consume(key, limit, windowMs);
    if (retryAfter) {
      res.setHeader('Retry-After', retryAfter);
      res.status(429).json(buildErrorBody(req, { statusCode: 429, code: 'RATE_LIMITED', message: 'Too many requests. Please retry later.', publicDetails: { retryAfterSeconds: retryAfter } }));
      return;
    }
    next();
  });
}
