import mongoose, { Schema } from 'mongoose';

const coverageRequestSchema = new Schema(
  {
    _id: { type: String, required: true },
    point: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    rider_id: { type: String, default: null, index: true },
    created_at: { type: Date, default: Date.now, index: true },
  },
  {
    collection: 'coverage_requests',
    versionKey: false,
    _id: false,
  },
);

coverageRequestSchema.index({ point: '2dsphere' });

export const CoverageRequestModel = mongoose.model('CoverageRequest', coverageRequestSchema);
