import type { DriverApplicationStatus } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { DriverLicenseStoragePort } from '../../domain/driverLicenseStorage.port.js';
import type {
  DriverApplicationEntity,
  DriverApplicationRepositoryPort,
  DriverDocumentEntity,
  DriverDocumentRepositoryPort,
  DriverEntity,
  DriverRepositoryPort,
  UserRepositoryPort,
  VehicleEntity,
  VehicleRepositoryPort,
} from '../../domain/index.js';

export interface AdminDriverApplicationDeps {
  applicationRepo: DriverApplicationRepositoryPort;
  driverRepo: DriverRepositoryPort;
  userRepo: UserRepositoryPort;
  vehicleRepo: VehicleRepositoryPort;
  documentRepo: DriverDocumentRepositoryPort;
  licenseStorage?: DriverLicenseStoragePort | undefined;
}

export interface DriverApplicationSummary {
  application: DriverApplicationEntity;
  driver: DriverEntity | null;
  phoneE164: string | null;
  vehicle: VehicleEntity | null;
}

export interface DriverDocumentWithUrl extends DriverDocumentEntity {
  fileUrl: string | null;
}

export interface DriverApplicationDetail extends DriverApplicationSummary {
  documents: DriverDocumentWithUrl[];
}

function attachDocumentUrls(
  deps: AdminDriverApplicationDeps,
  documents: DriverDocumentEntity[],
): DriverDocumentWithUrl[] {
  return documents.map((doc) => ({
    ...doc,
    fileUrl:
      deps.licenseStorage?.resolveUrl?.(doc.storageKey) ??
      (doc.storageKey.startsWith('http://') ||
      doc.storageKey.startsWith('https://') ||
      doc.storageKey.startsWith('data:')
        ? doc.storageKey
        : null),
  }));
}

async function summarize(
  deps: AdminDriverApplicationDeps,
  application: DriverApplicationEntity,
): Promise<DriverApplicationSummary> {
  const driver = await deps.driverRepo.findById(application.driverId);
  const [user, vehicle] = await Promise.all([
    driver ? deps.userRepo.findById(driver.userId) : null,
    driver?.currentVehicleId ? deps.vehicleRepo.findById(driver.currentVehicleId) : null,
  ]);
  return { application, driver, phoneE164: user?.phoneE164 ?? null, vehicle };
}

export class ListDriverApplicationsUseCase {
  constructor(private readonly deps: AdminDriverApplicationDeps) {}

  async execute(filter: {
    status?: DriverApplicationStatus | undefined;
    limit: number;
    offset: number;
  }): Promise<DriverApplicationSummary[]> {
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
    return { ...summary, documents: attachDocumentUrls(this.deps, documents) };
  }
}

export class UpdateDriverStatusUseCase {
  constructor(private readonly deps: AdminDriverApplicationDeps) {}

  async execute(input: {
    id: string;
    status: 'ACTIVE' | 'SUSPENDED';
  }): Promise<DriverApplicationDetail> {
    const application =
      (await this.deps.applicationRepo.findById(input.id)) ??
      (await this.deps.applicationRepo.findByDriverId(input.id));
    if (!application) throw AppError.notFound('Driver application not found.');

    const driver = await this.deps.driverRepo.findById(application.driverId);
    if (!driver) throw AppError.notFound('Driver profile not found.');

    await this.deps.driverRepo.update({
      ...driver,
      status: input.status,
      operationalStatus:
        input.status === 'SUSPENDED' && driver.operationalStatus === 'ONLINE'
          ? 'OFFLINE'
          : driver.operationalStatus,
      updatedAt: new Date(),
    });

    const [summary, documents] = await Promise.all([
      summarize(this.deps, application),
      this.deps.documentRepo.findByApplicationId(application.id),
    ]);
    return { ...summary, documents: attachDocumentUrls(this.deps, documents) };
  }
}
