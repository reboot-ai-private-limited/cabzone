import type { DriverDocumentEntity, DriverDocumentRepositoryPort } from '../../domain/index.js';
import { DriverDocumentModel, type DriverDocumentDocument } from './driverDocument.model.js';

export class MongoDriverDocumentRepository implements DriverDocumentRepositoryPort {
  async findById(id: string): Promise<DriverDocumentEntity | null> {
    const doc = await DriverDocumentModel.findById(id).lean<DriverDocumentDocument | null>().exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async findByApplicationId(applicationId: string): Promise<DriverDocumentEntity[]> {
    const docs = await DriverDocumentModel.find({ application_id: applicationId })
      .lean<DriverDocumentDocument[]>()
      .exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findByDriverId(driverId: string): Promise<DriverDocumentEntity[]> {
    const docs = await DriverDocumentModel.find({ driver_id: driverId })
      .lean<DriverDocumentDocument[]>()
      .exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findVerifiedExpiringBefore(cutoff: Date): Promise<DriverDocumentEntity[]> {
    const docs = await DriverDocumentModel.find({
      verification_status: 'VERIFIED',
      expires_at: { $ne: null, $lte: cutoff },
    })
      .lean<DriverDocumentDocument[]>()
      .exec();
    return docs.map((d) => this.toEntity(d));
  }

  async create(document: DriverDocumentEntity): Promise<DriverDocumentEntity> {
    const created = await DriverDocumentModel.create({
      _id: document.id,
      driver_id: document.driverId,
      application_id: document.applicationId,
      vehicle_id: document.vehicleId ?? null,
      type: document.type,
      storage_key: document.storageKey,
      document_hash: document.documentHash,
      document_number_masked: document.documentNumberMasked,
      issued_at: document.issuedAt,
      expires_at: document.expiresAt,
      verification_status: document.verificationStatus,
      verified_at: document.verifiedAt,
      last_expiry_reminder_days: document.lastExpiryReminderDays ?? null,
    });
    return this.toEntity(created.toObject() as DriverDocumentDocument);
  }

  async update(document: DriverDocumentEntity): Promise<DriverDocumentEntity> {
    const updated = await DriverDocumentModel.findByIdAndUpdate(
      document.id,
      {
        vehicle_id: document.vehicleId ?? null,
        storage_key: document.storageKey,
        document_hash: document.documentHash,
        document_number_masked: document.documentNumberMasked,
        issued_at: document.issuedAt,
        expires_at: document.expiresAt,
        verification_status: document.verificationStatus,
        verified_at: document.verifiedAt,
        last_expiry_reminder_days: document.lastExpiryReminderDays ?? null,
      },
      { new: true },
    )
      .lean<DriverDocumentDocument | null>()
      .exec();

    if (!updated) throw new Error(`Document not found: ${document.id}`);
    return this.toEntity(updated);
  }

  private toEntity(doc: DriverDocumentDocument): DriverDocumentEntity {
    return {
      id: doc._id,
      driverId: doc.driver_id,
      applicationId: doc.application_id,
      vehicleId: doc.vehicle_id ?? null,
      type: doc.type,
      storageKey: doc.storage_key,
      documentHash: doc.document_hash,
      documentNumberMasked: doc.document_number_masked,
      issuedAt: doc.issued_at,
      expiresAt: doc.expires_at,
      verificationStatus: doc.verification_status,
      verifiedAt: doc.verified_at,
      lastExpiryReminderDays: doc.last_expiry_reminder_days ?? null,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
