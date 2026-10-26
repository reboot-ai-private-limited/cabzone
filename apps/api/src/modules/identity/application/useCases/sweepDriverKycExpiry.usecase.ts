import type { DocumentType } from '@cabzone/contracts';
import { newUuid } from '../../../../shared/ids.js';
import {
  KYC_EXPIRY_WARNING_DAYS,
  canDriverGoOnline,
  computeDaysRemaining,
  isDocumentValidForVehicle,
  isVehicleScopedDocumentType,
  resolveExpiryReminderBucket,
  shouldSendExpiryReminder,
  type DriverDocumentEntity,
  type DriverDocumentRepositoryPort,
  type DriverRepositoryPort,
  type KycAuditRepositoryPort,
  type VehicleRepositoryPort,
} from '../../domain/index.js';

const MS_PER_DAY = 86_400_000;

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  GOVERNMENT_ID: 'Government ID',
  DRIVING_LICENSE: 'Driving Licence',
  REGISTRATION_CERTIFICATE: 'Registration Certificate (RC)',
  INSURANCE: 'Vehicle Insurance',
  PERMIT: 'Commercial Permit',
};

export interface DriverKycExpiryNotification {
  userId: string;
  driverId: string;
  title: string;
  body: string;
  event: 'driver.kyc.expiring' | 'driver.kyc.expired';
  payload: Record<string, unknown>;
}

export interface SweepDriverKycExpiryDeps {
  documentRepo: DriverDocumentRepositoryPort;
  driverRepo: DriverRepositoryPort;
  vehicleRepo: VehicleRepositoryPort;
  auditRepo?: KycAuditRepositoryPort | undefined;
  hasActiveRide?: ((driverId: string) => Promise<boolean>) | undefined;
  removeDriverPresence?: ((driverId: string) => Promise<void>) | undefined;
  notifyDriver?: ((notification: DriverKycExpiryNotification) => Promise<void>) | undefined;
}

export interface SweepDriverKycExpiryResult {
  expiredDocuments: number;
  expiredDrivers: number;
  remindersSent: number;
}

export class SweepDriverKycExpiryUseCase {
  constructor(private readonly deps: SweepDriverKycExpiryDeps) {}

  async execute(now: Date = new Date()): Promise<SweepDriverKycExpiryResult> {
    if (!this.deps.documentRepo.findVerifiedExpiringBefore) {
      return { expiredDocuments: 0, expiredDrivers: 0, remindersSent: 0 };
    }

    const warningCutoff = new Date(now.getTime() + KYC_EXPIRY_WARNING_DAYS * MS_PER_DAY);
    const candidates = await this.deps.documentRepo.findVerifiedExpiringBefore(warningCutoff);
    if (candidates.length === 0) {
      return { expiredDocuments: 0, expiredDrivers: 0, remindersSent: 0 };
    }

    const driverIds = new Set(candidates.map((doc) => doc.driverId));
    let expiredDocuments = 0;
    let expiredDrivers = 0;
    let remindersSent = 0;

    for (const driverId of driverIds) {
      const driver = await this.deps.driverRepo.findById(driverId);
      if (!driver) continue;

      const [allDocs, vehicle] = await Promise.all([
        this.deps.documentRepo.findByDriverId(driverId),
        driver.currentVehicleId ? this.deps.vehicleRepo.findById(driver.currentVehicleId) : null,
      ]);

      const updatedDocs: DriverDocumentEntity[] = [];
      const pendingNotifications: DriverKycExpiryNotification[] = [];

      for (const doc of allDocs) {
        if (doc.verificationStatus !== 'VERIFIED' || doc.expiresAt === null) {
          updatedDocs.push(doc);
          continue;
        }

        const hasNewerUnexpiringReplacement = allDocs.some(
          (other) =>
            other.id !== doc.id &&
            other.type === doc.type &&
            isDocumentValidForVehicle(other, driver.currentVehicleId, now) &&
            (other.expiresAt === null ||
              computeDaysRemaining(other.expiresAt, now) > KYC_EXPIRY_WARNING_DAYS),
        );

        if (doc.expiresAt <= now) {
          const shouldNotifyExpired =
            !hasNewerUnexpiringReplacement &&
            shouldSendExpiryReminder(doc.lastExpiryReminderDays, 0);

          const saved = await this.deps.documentRepo.update({
            ...doc,
            verificationStatus: 'EXPIRED',
            lastExpiryReminderDays: 0,
            updatedAt: now,
          });
          updatedDocs.push(saved);
          expiredDocuments += 1;

          if (this.deps.auditRepo) {
            await this.deps.auditRepo.record({
              id: newUuid(),
              actorUserId: 'SYSTEM',
              actorRole: 'SYSTEM',
              action: 'DOCUMENT_EXPIRED',
              driverId: driver.id,
              applicationId: doc.applicationId,
              documentId: doc.id,
              metadata: {
                documentType: doc.type,
                expiresAt: doc.expiresAt.toISOString(),
              },
              createdAt: now,
            });
          }

          if (shouldNotifyExpired) {
            const label = DOCUMENT_LABELS[doc.type];
            pendingNotifications.push({
              userId: driver.userId,
              driverId: driver.id,
              title: `${label} expired`,
              body: `Your ${label} has expired. Upload a renewed copy in Compliance Documents to go back online.`,
              event: 'driver.kyc.expired',
              payload: {
                documentId: doc.id,
                documentType: doc.type,
                expiresAt: doc.expiresAt.toISOString(),
                daysRemaining: 0,
              },
            });
          }
          continue;
        }

        if (
          doc.expiresAt <= warningCutoff &&
          !hasNewerUnexpiringReplacement &&
          (!isVehicleScopedDocumentType(doc.type) ||
            doc.vehicleId == null ||
            doc.vehicleId === driver.currentVehicleId)
        ) {
          const daysRemaining = computeDaysRemaining(doc.expiresAt, now);
          const bucket = resolveExpiryReminderBucket(daysRemaining);
          if (shouldSendExpiryReminder(doc.lastExpiryReminderDays, bucket) && bucket > 0) {
            const saved = await this.deps.documentRepo.update({
              ...doc,
              lastExpiryReminderDays: bucket,
              updatedAt: now,
            });
            updatedDocs.push(saved);

            const label = DOCUMENT_LABELS[doc.type];
            pendingNotifications.push({
              userId: driver.userId,
              driverId: driver.id,
              title:
                daysRemaining <= 1
                  ? `${label} expires tomorrow`
                  : `${label} expires in ${daysRemaining} days`,
              body: `Upload your renewed ${label} in Compliance Documents before expiry to avoid going offline.`,
              event: 'driver.kyc.expiring',
              payload: {
                documentId: doc.id,
                documentType: doc.type,
                expiresAt: doc.expiresAt.toISOString(),
                daysRemaining,
                bucket,
              },
            });
            continue;
          }
        }

        updatedDocs.push(doc);
      }

      if (driver.status === 'ACTIVE' && driver.kycStatus === 'VERIFIED') {
        const eligibility = canDriverGoOnline(driver, {
          vehicle,
          documents: updatedDocs,
          now,
        });
        if (!eligibility.eligible) {
          await this.deps.removeDriverPresence?.(driver.id);
          const activeRide =
            (await this.deps.hasActiveRide?.(driver.id)) ?? driver.operationalStatus === 'BUSY';

          await this.deps.driverRepo.update({
            ...driver,
            kycStatus: 'EXPIRED',
            operationalStatus:
              !activeRide && driver.operationalStatus === 'ONLINE'
                ? 'OFFLINE'
                : driver.operationalStatus,
            updatedAt: now,
          });
          expiredDrivers += 1;
        }
      }

      if (this.deps.notifyDriver) {
        for (const notification of pendingNotifications) {
          try {
            await this.deps.notifyDriver(notification);
            remindersSent += 1;
          } catch {
            // Best-effort notification delivery; do not abort remaining driver sweeps.
          }
        }
      }
    }

    return { expiredDocuments, expiredDrivers, remindersSent };
  }
}
