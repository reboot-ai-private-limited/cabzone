import { describe, expect, it } from 'vitest';
import {
  canDriverReapply,
  canSubmitApplication,
  createVehicleSchema,
  DriverApplicationModel,
  DriverDocumentModel,
  isDocumentValid,
  isVehicleApproved,
  reviewDriverApplicationSchema,
  uploadDriverDocumentMetadataSchema,
  VehicleModel,
  vehicleRegistrationSchema,
  type DriverApplicationEntity,
  type DriverDocumentEntity,
  type VehicleEntity,
} from '../src/modules/identity/index.js';

describe('Vehicle Domain Invariants', () => {
  const baseVehicle: VehicleEntity = {
    id: '018f0a00-0000-7000-8000-000000000001',
    driverId: '018f0a00-0000-7000-8000-000000000010',
    vehicleType: 'CAB',
    make: 'Maruti Suzuki',
    model: 'Dzire',
    registrationNumber: 'WB74AB1234',
    color: 'White',
    manufactureYear: 2022,
    verificationStatus: 'APPROVED',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('identifies approved vehicle', () => {
    expect(isVehicleApproved(baseVehicle)).toBe(true);
  });

  it('rejects pending, rejected, or suspended vehicle', () => {
    expect(isVehicleApproved({ ...baseVehicle, verificationStatus: 'PENDING' })).toBe(false);
    expect(isVehicleApproved({ ...baseVehicle, verificationStatus: 'REJECTED' })).toBe(false);
    expect(isVehicleApproved({ ...baseVehicle, verificationStatus: 'SUSPENDED' })).toBe(false);
  });
});

describe('Driver Application Domain Invariants', () => {
  const baseApp: DriverApplicationEntity = {
    id: '018f0a00-0000-7000-8000-000000000002',
    driverId: '018f0a00-0000-7000-8000-000000000010',
    status: 'DRAFT',
    rejectionType: null,
    rejectionReason: null,
    verificationProvider: null,
    verificationReference: null,
    verificationResult: null,
    reapplyCount: 0,
    submittedAt: null,
    reviewedAt: null,
    reviewerAdminId: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('allows submission only from DRAFT or REAPPLIED', () => {
    expect(canSubmitApplication(baseApp)).toBe(true);
    expect(canSubmitApplication({ ...baseApp, status: 'REAPPLIED' })).toBe(true);
    expect(canSubmitApplication({ ...baseApp, status: 'SUBMITTED' })).toBe(false);
    expect(canSubmitApplication({ ...baseApp, status: 'APPROVED' })).toBe(false);
  });

  it('allows reapplication for FIXABLE rejection', () => {
    const rejectedApp: DriverApplicationEntity = {
      ...baseApp,
      status: 'REJECTED',
      rejectionType: 'FIXABLE',
      rejectionReason: 'Blurry document image',
    };

    const res = canDriverReapply(rejectedApp);
    expect(res.allowed).toBe(true);
  });

  it('permanently blocks reapplication for HARD_FRAUD', () => {
    const fraudApp: DriverApplicationEntity = {
      ...baseApp,
      status: 'REJECTED',
      rejectionType: 'HARD_FRAUD',
      rejectionReason: 'Forged driving license detected',
    };

    const res = canDriverReapply(fraudApp);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('fraudulent');
  });

  it('blocks reapplication if application is not in REJECTED state', () => {
    const res = canDriverReapply(baseApp);
    expect(res.allowed).toBe(false);
  });
});

describe('Driver Document Domain Invariants', () => {
  const baseDoc: DriverDocumentEntity = {
    id: '018f0a00-0000-7000-8000-000000000003',
    driverId: '018f0a00-0000-7000-8000-000000000010',
    applicationId: '018f0a00-0000-7000-8000-000000000002',
    type: 'DRIVING_LICENSE',
    storageKey: 'kyc/driver-10/dl-front.jpg',
    documentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    documentNumberMasked: 'DL-XXXX-1234',
    issuedAt: new Date('2020-01-01'),
    expiresAt: new Date(Date.now() + 86400_000 * 365), // 1 year in future
    verificationStatus: 'VERIFIED',
    verifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('identifies valid verified non-expired document', () => {
    expect(isDocumentValid(baseDoc)).toBe(true);
  });

  it('rejects expired document', () => {
    const expiredDoc = {
      ...baseDoc,
      expiresAt: new Date(Date.now() - 1000), // 1 second ago
    };
    expect(isDocumentValid(expiredDoc)).toBe(false);
  });

  it('rejects document with PENDING or FAILED verification status', () => {
    expect(isDocumentValid({ ...baseDoc, verificationStatus: 'PENDING' })).toBe(false);
    expect(isDocumentValid({ ...baseDoc, verificationStatus: 'FAILED' })).toBe(false);
  });
});

describe('Vehicle & KYC Boundary Validations', () => {
  it('validates Indian vehicle registration numbers', () => {
    expect(vehicleRegistrationSchema.safeParse('WB74AB1234').success).toBe(true);
    expect(vehicleRegistrationSchema.safeParse('DL01A1234').success).toBe(true);
    expect(vehicleRegistrationSchema.safeParse('MH12DE1234').success).toBe(true);

    // Invalid formats
    expect(vehicleRegistrationSchema.safeParse('INVALID').success).toBe(false);
    expect(vehicleRegistrationSchema.safeParse('12345').success).toBe(false);
    expect(vehicleRegistrationSchema.safeParse('WBA1234').success).toBe(false);
  });

  it('validates createVehicle payload', () => {
    const valid = {
      driverId: '018f0a00-0000-7000-8000-000000000010',
      vehicleType: 'CAB',
      make: 'Maruti',
      model: 'WagonR',
      registrationNumber: 'WB74AB1234',
      manufactureYear: 2021,
    };
    expect(createVehicleSchema.safeParse(valid).success).toBe(true);

    // Year before 2000
    expect(createVehicleSchema.safeParse({ ...valid, manufactureYear: 1995 }).success).toBe(false);
  });

  it('validates reviewDriverApplication payload', () => {
    const valid = {
      status: 'REJECTED' as const,
      rejectionType: 'FIXABLE' as const,
      rejectionReason: 'Blurry photo',
      reviewerAdminId: '018f0a00-0000-7000-8000-000000000020',
    };
    expect(reviewDriverApplicationSchema.safeParse(valid).success).toBe(true);
  });

  it('validates uploadDriverDocumentMetadata payload with SHA-256 hash', () => {
    const valid = {
      driverId: '018f0a00-0000-7000-8000-000000000010',
      applicationId: '018f0a00-0000-7000-8000-000000000002',
      type: 'GOVERNMENT_ID',
      storageKey: 'kyc/docs/doc-123.jpg',
      documentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };
    expect(uploadDriverDocumentMetadataSchema.safeParse(valid).success).toBe(true);

    // Invalid hash length
    expect(
      uploadDriverDocumentMetadataSchema.safeParse({ ...valid, documentHash: 'short-hash' }).success,
    ).toBe(false);
  });
});

describe('Mongoose Persistence Models', () => {
  it('registers vehicle and KYC models with correct collection names', () => {
    expect(VehicleModel.collection.name).toBe('vehicles');
    expect(DriverApplicationModel.collection.name).toBe('driver_applications');
    expect(DriverDocumentModel.collection.name).toBe('driver_documents');
  });
});
