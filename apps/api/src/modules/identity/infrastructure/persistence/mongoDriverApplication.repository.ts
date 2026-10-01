import type {
  DriverApplicationEntity,
  DriverApplicationListFilter,
  DriverApplicationRepositoryPort,
} from '../../domain/index.js';
import { DriverApplicationModel, type DriverApplicationDocument } from './driverApplication.model.js';

export class MongoDriverApplicationRepository implements DriverApplicationRepositoryPort {
  async findById(id: string): Promise<DriverApplicationEntity | null> {
    const doc = await DriverApplicationModel.findById(id).lean<DriverApplicationDocument | null>().exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async findByDriverId(driverId: string): Promise<DriverApplicationEntity | null> {
    const doc = await DriverApplicationModel.findOne({ driver_id: driverId })
      .sort({ created_at: -1 })
      .lean<DriverApplicationDocument | null>()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async list(filter: DriverApplicationListFilter): Promise<DriverApplicationEntity[]> {
    const docs = await DriverApplicationModel.find(filter.status ? { status: filter.status } : {})
      .sort({ created_at: -1 })
      .skip(filter.offset)
      .limit(filter.limit)
      .lean<DriverApplicationDocument[]>()
      .exec();
    return docs.map((d) => this.toEntity(d));
  }

  async create(app: DriverApplicationEntity): Promise<DriverApplicationEntity> {
    const created = await DriverApplicationModel.create({
      _id: app.id,
      driver_id: app.driverId,
      status: app.status,
      rejection_type: app.rejectionType,
      rejection_reason: app.rejectionReason,
      verification_provider: app.verificationProvider,
      verification_reference: app.verificationReference,
      verification_result: app.verificationResult,
      reapply_count: app.reapplyCount,
      submitted_at: app.submittedAt,
      reviewed_at: app.reviewedAt,
      reviewer_admin_id: app.reviewerAdminId,
      version: app.version,
    });
    return this.toEntity(created.toObject() as DriverApplicationDocument);
  }

  async update(app: DriverApplicationEntity): Promise<DriverApplicationEntity> {
    const updated = await DriverApplicationModel.findByIdAndUpdate(
      app.id,
      {
        status: app.status,
        rejection_type: app.rejectionType,
        rejection_reason: app.rejectionReason,
        verification_provider: app.verificationProvider,
        verification_reference: app.verificationReference,
        verification_result: app.verificationResult,
        reapply_count: app.reapplyCount,
        submitted_at: app.submittedAt,
        reviewed_at: app.reviewedAt,
        reviewer_admin_id: app.reviewerAdminId,
        version: app.version + 1,
      },
      { new: true },
    )
      .lean<DriverApplicationDocument | null>()
      .exec();

    if (!updated) throw new Error(`Application not found: ${app.id}`);
    return this.toEntity(updated);
  }

  private toEntity(doc: DriverApplicationDocument): DriverApplicationEntity {
    return {
      id: doc._id,
      driverId: doc.driver_id,
      status: doc.status,
      rejectionType: doc.rejection_type,
      rejectionReason: doc.rejection_reason,
      verificationProvider: doc.verification_provider,
      verificationReference: doc.verification_reference,
      verificationResult: doc.verification_result,
      reapplyCount: doc.reapply_count,
      submittedAt: doc.submitted_at,
      reviewedAt: doc.reviewed_at,
      reviewerAdminId: doc.reviewer_admin_id,
      version: doc.version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
