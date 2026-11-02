import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AdminDocumentPreviewDto, DriverApplicationStatus } from '@cabzone/contracts';
import { newUuid } from '../../../../shared/ids.js';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { ZoneRepositoryPort } from '../../../zone/zone.public.js';
import {
  detectDocumentMimeType,
  isPrivateKycStorageKey,
  type DocumentMimeType,
} from '../driverLicenseFile.js';
import type { DriverLicenseStoragePort } from '../../domain/driverLicenseStorage.port.js';
import type {
  DriverApplicationEntity,
  DriverApplicationRepositoryPort,
  DriverDocumentEntity,
  DriverDocumentRepositoryPort,
  DriverEntity,
  DriverRepositoryPort,
  KycAuditRepositoryPort,
  UserRepositoryPort,
  VehicleEntity,
  VehicleRepositoryPort,
} from '../../domain/index.js';

const PREVIEW_TTL_MS = 5 * 60_000;

export interface AdminDriverApplicationDeps {
  applicationRepo: DriverApplicationRepositoryPort;
  driverRepo: DriverRepositoryPort;
  userRepo?: UserRepositoryPort | undefined;
  vehicleRepo: VehicleRepositoryPort;
  documentRepo: DriverDocumentRepositoryPort;
  licenseStorage?: DriverLicenseStoragePort | undefined;
  auditRepo?: KycAuditRepositoryPort | undefined;
  zoneRepo?: ZoneRepositoryPort | undefined;
  previewSigningSecret?: string | undefined;
  removeDriverPresence?: ((driverId: string) => Promise<void>) | undefined;
}

export interface AdminDriverProfileView {
  id: string;
  userId: string;
  name?: string | null | undefined;
  phoneE164?: string | null | undefined;
  profilePhotoUrl?: string | null | undefined;
  gender?: string | null | undefined;
  dateOfBirth?: string | null | undefined;
  experience?: string | null | undefined;
  hasEmergencyContact: boolean;
  alternatePhone?: string | null | undefined;
  emergencyContact?: string | null | undefined;
  address?: string | null | undefined;
  dlNumber?: string | null | undefined;
  dlExpiry?: string | null | undefined;
  status: DriverEntity['status'];
  kycStatus: DriverEntity['kycStatus'];
  operationalStatus: DriverEntity['operationalStatus'];
  ratingAverage: number | null;
  ratingCount: number;
  trustScore: number | null;
  currentVehicleId: string | null;
  walletId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DriverApplicationSummary {
  application: DriverApplicationEntity;
  driver: AdminDriverProfileView | null;
  phoneE164: string | null;
  vehicle: VehicleEntity | null;
}

export interface DriverDocumentWithUrl extends DriverDocumentEntity {
  documentNumber: string | null;
  fileUrl: string | null;
  hasFile: boolean;
}

export interface DriverApplicationDetail extends DriverApplicationSummary {
  documents: DriverDocumentWithUrl[];
}

function toAdminDriverProfile(
  driver: DriverEntity,
  phoneE164?: string | null,
): AdminDriverProfileView {
  return {
    id: driver.id,
    userId: driver.userId,
    name: driver.name,
    phoneE164: phoneE164 ?? null,
    profilePhotoUrl: driver.profilePhotoUrl,
    gender: driver.gender,
    dateOfBirth: driver.dateOfBirth,
    experience: driver.experience,
    hasEmergencyContact: Boolean(driver.emergencyContact?.trim()),
    alternatePhone: driver.alternatePhone,
    emergencyContact: driver.emergencyContact,
    address: driver.address,
    dlNumber: driver.dlNumber,
    dlExpiry: driver.dlExpiry,
    status: driver.status,
    kycStatus: driver.kycStatus,
    operationalStatus: driver.operationalStatus,
    ratingAverage: driver.ratingAverage,
    ratingCount: driver.ratingCount,
    trustScore: driver.trustScore,
    currentVehicleId: driver.currentVehicleId,
    walletId: driver.walletId,
    version: driver.version,
    createdAt: driver.createdAt,
    updatedAt: driver.updatedAt,
  };
}

export async function resolveDriverCityZoneId(
  driver: { address?: string | null | undefined } | null,
  zoneRepo?: ZoneRepositoryPort,
): Promise<string | null> {
  const rawAddress = driver?.address?.trim().toLowerCase();
  if (!rawAddress || !zoneRepo) return null;
  const cityZones = await zoneRepo.list({ zoneType: 'CITY' });
  const primaryCity = rawAddress.split(',')[0]?.trim() ?? rawAddress;
  const matched =
    cityZones.find((z) => z.name.trim().toLowerCase() === primaryCity) ??
    cityZones.find((z) => rawAddress.includes(z.name.trim().toLowerCase()));
  return matched?.id ?? null;
}

/** Admins see the original document numbers; legacy starred values fall back to the full profile numbers. */
function resolveDocumentNumber(
  doc: DriverDocumentEntity,
  summary: DriverApplicationSummary,
): string | null {
  const stored = doc.documentNumberMasked;
  const isStarred = !stored || /[*xX]{2,}/.test(stored);
  if (!isStarred) return stored;
  if (doc.type === 'DRIVING_LICENSE' && summary.driver?.dlNumber) return summary.driver.dlNumber;
  if (doc.type === 'REGISTRATION_CERTIFICATE' && summary.vehicle?.registrationNumber) {
    return summary.vehicle.registrationNumber;
  }
  return stored;
}

function attachDocumentPrivacyMetadata(
  documents: DriverDocumentEntity[],
  summary: DriverApplicationSummary,
): DriverDocumentWithUrl[] {
  return documents.map((doc) => ({
    ...doc,
    documentNumber: resolveDocumentNumber(doc, summary),
    fileUrl: null,
    hasFile: isPrivateKycStorageKey(doc.storageKey),
  }));
}

function inferMimeTypeFromKey(storageKey: string): DocumentMimeType {
  if (storageKey.endsWith('.pdf')) return 'application/pdf';
  if (storageKey.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

function computePreviewSignature(
  secret: string,
  documentId: string,
  storageKey: string,
  expiresAtMs: number,
): string {
  return createHmac('sha256', secret)
    .update(`kyc-doc-preview:v1:${documentId}:${storageKey}:${expiresAtMs}`)
    .digest('base64url');
}

async function summarize(
  deps: AdminDriverApplicationDeps,
  application: DriverApplicationEntity,
): Promise<DriverApplicationSummary> {
  const driver = await deps.driverRepo.findById(application.driverId);
  const [user, vehicle] = await Promise.all([
    driver && deps.userRepo ? deps.userRepo.findById(driver.userId) : null,
    driver?.currentVehicleId ? deps.vehicleRepo.findById(driver.currentVehicleId) : null,
  ]);
  const phoneE164 = user?.phoneE164 ?? null;
  return {
    application,
    driver: driver ? toAdminDriverProfile(driver, phoneE164) : null,
    phoneE164,
    vehicle,
  };
}

export class ListDriverApplicationsUseCase {
  constructor(private readonly deps: AdminDriverApplicationDeps) {}

  async execute(filter: {
    status?: DriverApplicationStatus | undefined;
    limit: number;
    offset: number;
    allowedCityZoneIds?: string[] | undefined;
  }): Promise<DriverApplicationSummary[]> {
    if (filter.allowedCityZoneIds !== undefined) {
      if (filter.allowedCityZoneIds.length === 0 || !this.deps.zoneRepo) {
        return [];
      }
      const batch = await this.deps.applicationRepo.list({
        status: filter.status,
        limit: Math.max(filter.offset + filter.limit, 200),
        offset: 0,
      });
      const summaries = await Promise.all(batch.map((a) => summarize(this.deps, a)));
      const filtered: DriverApplicationSummary[] = [];
      for (const item of summaries) {
        const cityId = await resolveDriverCityZoneId(item.driver, this.deps.zoneRepo);
        if (cityId && filter.allowedCityZoneIds.includes(cityId)) {
          filtered.push(item);
        }
      }
      return filtered.slice(filter.offset, filter.offset + filter.limit);
    }

    const applications = await this.deps.applicationRepo.list(filter);
    return Promise.all(applications.map((a) => summarize(this.deps, a)));
  }
}

export class GetDriverApplicationDetailUseCase {
  constructor(private readonly deps: AdminDriverApplicationDeps) {}

  async execute(applicationId: string): Promise<DriverApplicationDetail> {
    const application =
      (await this.deps.applicationRepo.findById(applicationId)) ??
      (await this.deps.applicationRepo.findByDriverId(applicationId));
    if (!application) throw AppError.notFound('Driver application not found.');
    const [summary, documents] = await Promise.all([
      summarize(this.deps, application),
      this.deps.documentRepo.findByApplicationId(application.id),
    ]);
    return { ...summary, documents: attachDocumentPrivacyMetadata(documents, summary) };
  }
}


export interface UpdateDriverProfileByAdminInput {
  id: string;
  name?: string | null | undefined;
  phoneE164?: string | null | undefined;
  alternatePhone?: string | null | undefined;
  emergencyContact?: string | null | undefined;
  address?: string | null | undefined;
  dlNumber?: string | null | undefined;
  dlExpiry?: string | null | undefined;
  status?: 'ACTIVE' | 'SUSPENDED' | undefined;
  vehicle?: {
    vehicleType?: any | undefined;
    make?: string | undefined;
    model?: string | undefined;
    registrationNumber?: string | undefined;
  } | undefined;
  actorUserId?: string | undefined;
  actorRole?: string | undefined;
}

export class UpdateDriverProfileByAdminUseCase {
  constructor(private readonly deps: AdminDriverApplicationDeps) {}

  async execute(input: UpdateDriverProfileByAdminInput): Promise<DriverApplicationDetail> {
    const application =
      (await this.deps.applicationRepo.findById(input.id)) ??
      (await this.deps.applicationRepo.findByDriverId(input.id));
    if (!application) throw AppError.notFound('Driver application not found.');

    const driver = await this.deps.driverRepo.findById(application.driverId);
    if (!driver) throw AppError.notFound('Driver profile not found.');

    const now = new Date();

    // 1. Validate everything before writing anything.
    const nextStatus = input.status ?? driver.status;
    if (nextStatus === 'ACTIVE' && driver.status !== 'ACTIVE' && application.status !== 'APPROVED') {
      throw AppError.conflict('Only drivers with an approved application can be activated.');
    }

    let userToUpdate: Awaited<ReturnType<UserRepositoryPort['findById']>> = null;
    if (this.deps.userRepo && input.phoneE164) {
      const user = await this.deps.userRepo.findById(driver.userId);
      if (user && user.phoneE164 !== input.phoneE164) {
        const existing = await this.deps.userRepo.findByPhone(input.phoneE164);
        if (existing && existing.id !== user.id) {
          throw AppError.conflict('Phone number is already registered to another user.');
        }
        userToUpdate = user;
      }
    }

    const vehicleToUpdate =
      input.vehicle && driver.currentVehicleId
        ? await this.deps.vehicleRepo.findById(driver.currentVehicleId)
        : null;

    // 2. Operational status
    const nextOperationalStatus =
      nextStatus === 'SUSPENDED' && driver.operationalStatus === 'ONLINE'
        ? 'OFFLINE'
        : driver.operationalStatus;

    if (nextStatus === 'SUSPENDED') {
      await this.deps.removeDriverPresence?.(driver.id);
    }

    // 3. Driver entity update
    const updatedDriver: DriverEntity = {
      ...driver,
      name: input.name !== undefined ? input.name : driver.name,
      alternatePhone:
        input.alternatePhone !== undefined ? input.alternatePhone : driver.alternatePhone,
      emergencyContact:
        input.emergencyContact !== undefined ? input.emergencyContact : driver.emergencyContact,
      address: input.address !== undefined ? input.address : driver.address,
      dlNumber: input.dlNumber !== undefined ? input.dlNumber : driver.dlNumber,
      dlExpiry: input.dlExpiry !== undefined ? input.dlExpiry : driver.dlExpiry,
      status: nextStatus,
      operationalStatus: nextOperationalStatus,
      updatedAt: now,
    };
    await this.deps.driverRepo.update(updatedDriver);

    // 4. Dependent updates
    if (userToUpdate && input.phoneE164) {
      await this.deps.userRepo!.update({ ...userToUpdate, phoneE164: input.phoneE164, updatedAt: now });
    }
    if (input.vehicle && vehicleToUpdate) {
      const vehicle = vehicleToUpdate;
      await this.deps.vehicleRepo.update({
        ...vehicle,
        make: input.vehicle.make !== undefined ? input.vehicle.make : vehicle.make,
        model: input.vehicle.model !== undefined ? input.vehicle.model : vehicle.model,
        registrationNumber:
          input.vehicle.registrationNumber !== undefined
            ? input.vehicle.registrationNumber
            : vehicle.registrationNumber,
        vehicleType:
          input.vehicle.vehicleType !== undefined ? input.vehicle.vehicleType : vehicle.vehicleType,
        updatedAt: now,
      });
    }

    // 5. Audit log
    if (this.deps.auditRepo && input.actorUserId) {
      await this.deps.auditRepo.record({
        id: newUuid(),
        actorUserId: input.actorUserId,
        actorRole: input.actorRole ?? 'ADMIN',
        action: 'DRIVER_STATUS_UPDATED',
        driverId: driver.id,
        applicationId: application.id,
        documentId: null,
        metadata: {
          previousStatus: driver.status,
          nextStatus,
          updatedFields: Object.keys(input).filter((k) => (input as any)[k] !== undefined),
        },
        createdAt: now,
      });
    }

    const [summary, documents] = await Promise.all([
      summarize(this.deps, application),
      this.deps.documentRepo.findByApplicationId(application.id),
    ]);
    return { ...summary, documents: attachDocumentPrivacyMetadata(documents, summary) };
  }
}

export class UpdateDriverStatusUseCase {
  constructor(private readonly deps: AdminDriverApplicationDeps) {}

  async execute(input: {
    id: string;
    status: 'ACTIVE' | 'SUSPENDED';
    actorUserId?: string | undefined;
    actorRole?: string | undefined;
  }): Promise<DriverApplicationDetail> {
    const application =
      (await this.deps.applicationRepo.findById(input.id)) ??
      (await this.deps.applicationRepo.findByDriverId(input.id));
    if (!application) throw AppError.notFound('Driver application not found.');

    const driver = await this.deps.driverRepo.findById(application.driverId);
    if (!driver) throw AppError.notFound('Driver profile not found.');

    const now = new Date();
    await this.deps.driverRepo.update({
      ...driver,
      status: input.status,
      operationalStatus:
        input.status === 'SUSPENDED' && driver.operationalStatus === 'ONLINE'
          ? 'OFFLINE'
          : driver.operationalStatus,
      updatedAt: now,
    });

    if (input.status === 'SUSPENDED') {
      await this.deps.removeDriverPresence?.(driver.id);
    }

    if (this.deps.auditRepo && input.actorUserId) {
      await this.deps.auditRepo.record({
        id: newUuid(),
        actorUserId: input.actorUserId,
        actorRole: input.actorRole ?? 'ADMIN',
        action: 'DRIVER_STATUS_UPDATED',
        driverId: driver.id,
        applicationId: application.id,
        documentId: null,
        metadata: { previousStatus: driver.status, nextStatus: input.status },
        createdAt: now,
      });
    }

    const [summary, documents] = await Promise.all([
      summarize(this.deps, application),
      this.deps.documentRepo.findByApplicationId(application.id),
    ]);
    return { ...summary, documents: attachDocumentPrivacyMetadata(documents, summary) };
  }
}

export class CreateAdminDocumentPreviewUseCase {
  constructor(private readonly deps: AdminDriverApplicationDeps) {}

  async execute(input: {
    applicationOrDriverId: string;
    documentId: string;
    actorUserId: string;
    actorRole: string;
    now?: Date | undefined;
  }): Promise<AdminDocumentPreviewDto> {
    const secret = this.deps.previewSigningSecret;
    if (!secret) throw AppError.internal();

    const application =
      (await this.deps.applicationRepo.findById(input.applicationOrDriverId)) ??
      (await this.deps.applicationRepo.findByDriverId(input.applicationOrDriverId));
    if (!application) throw AppError.notFound('Driver application not found.');

    const document = await this.deps.documentRepo.findById(input.documentId);
    if (!document || document.driverId !== application.driverId) {
      throw AppError.notFound('Driver document not found for this application.');
    }

    if (!isPrivateKycStorageKey(document.storageKey)) {
      throw AppError.notFound('Document file is not stored in private KYC storage.');
    }

    const now = input.now ?? new Date();
    const expiresAtMs = now.getTime() + PREVIEW_TTL_MS;
    const sig = computePreviewSignature(secret, document.id, document.storageKey, expiresAtMs);
    const expiresAt = new Date(expiresAtMs).toISOString();

    if (this.deps.auditRepo) {
      await this.deps.auditRepo.record({
        id: newUuid(),
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        action: 'DOCUMENT_PREVIEWED',
        driverId: document.driverId,
        applicationId: application.id,
        documentId: document.id,
        metadata: {
          documentType: document.type,
          expiresAt,
        },
        createdAt: now,
      });
    }

    return {
      documentId: document.id,
      url: `/api/v1/admin/driver-documents/${encodeURIComponent(document.id)}/content?exp=${expiresAtMs}&sig=${encodeURIComponent(sig)}`,
      mimeType: inferMimeTypeFromKey(document.storageKey),
      expiresAt,
    };
  }
}

export class StreamAdminDocumentContentUseCase {
  constructor(private readonly deps: AdminDriverApplicationDeps) {}

  async execute(input: {
    documentId: string;
    expRaw: string;
    sig: string;
    now?: Date | undefined;
  }): Promise<{
    bytes: Buffer;
    mimeType: DocumentMimeType;
    filename: string;
  }> {
    const secret = this.deps.previewSigningSecret;
    if (!secret || !this.deps.licenseStorage?.read) {
      throw AppError.internal();
    }

    const expiresAtMs = Number(input.expRaw);
    const now = input.now ?? new Date();
    if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= now.getTime()) {
      throw AppError.forbidden('DOCUMENT_PREVIEW_EXPIRED: Request a new document preview.');
    }

    const document = await this.deps.documentRepo.findById(input.documentId);
    if (!document || !isPrivateKycStorageKey(document.storageKey)) {
      throw AppError.notFound('Driver document not found.');
    }

    const expectedSig = computePreviewSignature(
      secret,
      document.id,
      document.storageKey,
      expiresAtMs,
    );
    const actualBuf = Buffer.from(input.sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
      throw AppError.forbidden('DOCUMENT_PREVIEW_INVALID: Invalid preview signature.');
    }

    const bytes = await this.deps.licenseStorage.read(document.storageKey);
    const detectedMime = detectDocumentMimeType(bytes);
    if (!detectedMime) {
      throw new AppError({
        statusCode: 502,
        code: 'INTERNAL',
        message: 'Stored document failed format integrity verification.',
      });
    }

    const ext =
      detectedMime === 'application/pdf' ? 'pdf' : detectedMime === 'image/png' ? 'png' : 'jpg';

    return {
      bytes,
      mimeType: detectedMime,
      filename: `${document.type.toLowerCase()}.${ext}`,
    };
  }
}
