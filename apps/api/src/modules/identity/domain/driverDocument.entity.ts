import type {
  DocumentType,
  DocumentVerificationStatus,
  DriverDocumentComplianceItemDto,
  DriverKycStatus,
  DriverStatus,
  KycComplianceSummaryDto,
  KycExpiryStatus,
  KycOverallComplianceStatus,
} from '@cabzone/contracts';
import type { DriverApplicationEntity } from './driverApplication.entity.js';
import { isVehicleApproved, type VehicleEntity } from './vehicle.entity.js';

export const REQUIRED_DRIVER_DOCUMENT_TYPES: readonly DocumentType[] = [
  'GOVERNMENT_ID',
  'DRIVING_LICENSE',
  'REGISTRATION_CERTIFICATE',
  'INSURANCE',
  'PERMIT',
] as const;

export const VEHICLE_SCOPED_DOCUMENT_TYPES: readonly DocumentType[] = [
  'REGISTRATION_CERTIFICATE',
  'INSURANCE',
  'PERMIT',
] as const;

export const KYC_EXPIRY_WARNING_DAYS = 30;
export const KYC_EXPIRY_URGENT_DAYS = 7;
const MS_PER_DAY = 86_400_000;

export interface DriverDocumentEntity {
  id: string;
  driverId: string;
  applicationId: string;
  vehicleId?: string | null;
  type: DocumentType;
  storageKey: string;
  documentHash: string;
  documentNumberMasked: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  verificationStatus: DocumentVerificationStatus;
  verifiedAt: Date | null;
  lastExpiryReminderDays?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export function isVehicleScopedDocumentType(type: DocumentType): boolean {
  return (VEHICLE_SCOPED_DOCUMENT_TYPES as readonly string[]).includes(type);
}

export function isDocumentValid(doc: DriverDocumentEntity, now: Date = new Date()): boolean {
  if (doc.verificationStatus !== 'VERIFIED') return false;
  if (doc.type !== 'GOVERNMENT_ID' && doc.expiresAt === null) return false;
  if (doc.expiresAt !== null && doc.expiresAt <= now) return false;
  return true;
}

export function isDocumentValidForVehicle(
  doc: DriverDocumentEntity,
  vehicleId: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!isDocumentValid(doc, now)) return false;
  if (isVehicleScopedDocumentType(doc.type) && doc.vehicleId != null && doc.vehicleId !== (vehicleId ?? null)) {
    return false;
  }
  return true;
}

export function computeDaysRemaining(expiresAt: Date, now: Date = new Date()): number {
  return Math.ceil((expiresAt.getTime() - now.getTime()) / MS_PER_DAY);
}

export function resolveExpiryReminderBucket(daysRemaining: number): 30 | 7 | 1 | 0 | null {
  if (daysRemaining <= 0) return 0;
  if (daysRemaining <= 1) return 1;
  if (daysRemaining <= KYC_EXPIRY_URGENT_DAYS) return 7;
  if (daysRemaining <= KYC_EXPIRY_WARNING_DAYS) return 30;
  return null;
}

export function shouldSendExpiryReminder(
  lastReminderDays: number | null | undefined,
  bucket: 30 | 7 | 1 | 0 | null,
): bucket is 30 | 7 | 1 | 0 {
  if (bucket === null) return false;
  if (lastReminderDays === null || lastReminderDays === undefined) return true;
  return bucket < lastReminderDays;
}

export function evaluateDriverKycCompliance(params: {
  driver: { status: DriverStatus; kycStatus: DriverKycStatus; currentVehicleId: string | null } | null;
  vehicle: VehicleEntity | null;
  application: DriverApplicationEntity | null;
  documents: DriverDocumentEntity[];
  now?: Date;
}): KycComplianceSummaryDto {
  const { driver, vehicle, application, documents, now = new Date() } = params;
  const currentVehicleId = driver?.currentVehicleId ?? null;
  const hasSubmittedRenewal = Boolean(
    application &&
      ['SUBMITTED', 'UNDER_REVIEW_AUTO', 'UNDER_REVIEW_ADMIN'].includes(application.status) &&
      (driver?.status === 'ACTIVE' ||
        documents.some((d) => d.verificationStatus === 'VERIFIED' || d.verificationStatus === 'EXPIRED')),
  );

  const items: DriverDocumentComplianceItemDto[] = REQUIRED_DRIVER_DOCUMENT_TYPES.map((type) => {
    const vehicleScoped = isVehicleScopedDocumentType(type);
    const matchingDocs = documents
      .filter(
        (doc) =>
          doc.type === type &&
          (!vehicleScoped || doc.vehicleId == null || doc.vehicleId === currentVehicleId),
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    const validDocs = matchingDocs
      .filter((doc) => isDocumentValidForVehicle(doc, currentVehicleId, now))
      .sort((a, b) => {
        const aExp = a.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bExp = b.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return bExp - aExp || b.updatedAt.getTime() - a.updatedAt.getTime();
      });

    const validDoc = validDocs[0];
    const hasPendingDoc = matchingDocs.some(
      (doc) =>
        doc.verificationStatus === 'PENDING' &&
        (application ? doc.applicationId === application.id : true),
    );
    const itemHasPendingRenewal =
      hasPendingDoc &&
      Boolean(
        driver?.status === 'ACTIVE' ||
          matchingDocs.some((d) => d.verificationStatus === 'VERIFIED' || d.verificationStatus === 'EXPIRED'),
      );

    if (validDoc) {
      if (validDoc.expiresAt === null) {
        return {
          type,
          documentId: validDoc.id,
          status: 'VALID',
          expiresAt: null,
          daysRemaining: null,
          urgent: false,
          hasPendingRenewal: itemHasPendingRenewal,
          vehicleId: validDoc.vehicleId ?? null,
        };
      }
      const daysRemaining = computeDaysRemaining(validDoc.expiresAt, now);
      const status: KycExpiryStatus =
        daysRemaining <= KYC_EXPIRY_WARNING_DAYS ? 'EXPIRING_SOON' : 'VALID';
      return {
        type,
        documentId: validDoc.id,
        status,
        expiresAt: validDoc.expiresAt.toISOString(),
        daysRemaining,
        urgent: daysRemaining <= KYC_EXPIRY_URGENT_DAYS,
        hasPendingRenewal: itemHasPendingRenewal,
        vehicleId: validDoc.vehicleId ?? null,
      };
    }

    const expiredDoc = matchingDocs.find(
      (doc) =>
        doc.verificationStatus === 'EXPIRED' ||
        (doc.verificationStatus === 'VERIFIED' && doc.expiresAt !== null && doc.expiresAt <= now),
    );

    if (expiredDoc) {
      const daysRemaining = expiredDoc.expiresAt
        ? Math.min(0, computeDaysRemaining(expiredDoc.expiresAt, now))
        : 0;
      return {
        type,
        documentId: expiredDoc.id,
        status: 'EXPIRED',
        expiresAt: expiredDoc.expiresAt ? expiredDoc.expiresAt.toISOString() : null,
        daysRemaining,
        urgent: true,
        hasPendingRenewal: itemHasPendingRenewal,
        vehicleId: expiredDoc.vehicleId ?? null,
      };
    }

    const latest = matchingDocs[0];
    return {
      type,
      documentId: latest?.id ?? null,
      status: 'MISSING',
      expiresAt: latest?.expiresAt ? latest.expiresAt.toISOString() : null,
      daysRemaining: null,
      urgent: false,
      hasPendingRenewal: itemHasPendingRenewal,
      vehicleId: latest?.vehicleId ?? null,
    };
  });

  const expiredTypes = items.filter((i) => i.status === 'EXPIRED').map((i) => i.type);
  const expiringSoonTypes = items.filter((i) => i.status === 'EXPIRING_SOON').map((i) => i.type);
  const hasMissing = items.some((i) => i.status === 'MISSING');
  const vehicleInvalid =
    !driver ||
    !driver.currentVehicleId ||
    (vehicle !== null && (vehicle.id !== driver.currentVehicleId || !isVehicleApproved(vehicle)));

  let overallStatus: KycOverallComplianceStatus;
  if (expiredTypes.length > 0 || driver?.kycStatus === 'EXPIRED') {
    overallStatus = 'EXPIRED';
  } else if (hasMissing || vehicleInvalid) {
    overallStatus = 'INCOMPLETE';
  } else if (expiringSoonTypes.length > 0) {
    overallStatus = 'EXPIRING_SOON';
  } else {
    overallStatus = 'COMPLIANT';
  }

  const canRenew = Boolean(
    driver &&
      driver.status !== 'SUSPENDED' &&
      driver.status !== 'REJECTED' &&
      application?.rejectionType !== 'HARD_FRAUD' &&
      !hasSubmittedRenewal &&
      (driver.status === 'ACTIVE' ||
        driver.kycStatus === 'EXPIRED' ||
        (application?.status === 'REJECTED' && application.reapplyCount < 3)),
  );

  return {
    overallStatus,
    canRenew,
    hasPendingRenewal: hasSubmittedRenewal,
    expiredTypes,
    expiringSoonTypes,
    items,
  };
}
