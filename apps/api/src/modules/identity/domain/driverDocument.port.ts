import type { DriverDocumentEntity } from './driverDocument.entity.js';

export interface DriverDocumentRepositoryPort {
  findById(id: string): Promise<DriverDocumentEntity | null>;
  findByApplicationId(applicationId: string): Promise<DriverDocumentEntity[]>;
  findByDriverId(driverId: string): Promise<DriverDocumentEntity[]>;
  findVerifiedExpiringBefore?(cutoff: Date): Promise<DriverDocumentEntity[]>;
  create(document: DriverDocumentEntity): Promise<DriverDocumentEntity>;
  update(document: DriverDocumentEntity): Promise<DriverDocumentEntity>;
}
