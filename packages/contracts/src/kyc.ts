/**
 * Driver KYC Application & Document Contracts
 */

export const DRIVER_APPLICATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW_AUTO',
  'UNDER_REVIEW_ADMIN',
  'APPROVED',
  'REJECTED',
  'REAPPLIED',
] as const;
export type DriverApplicationStatus = (typeof DRIVER_APPLICATION_STATUSES)[number];

export const REJECTION_TYPES = ['FIXABLE', 'HARD_FRAUD'] as const;
export type RejectionType = (typeof REJECTION_TYPES)[number];

export const VERIFICATION_PROVIDERS = ['CASHFREE', 'SUREPASS'] as const;
export type VerificationProvider = (typeof VERIFICATION_PROVIDERS)[number];

export interface DriverApplicationDto {
  id: string;
  driverId: string;
  status: DriverApplicationStatus;
  rejectionType: RejectionType | null;
  rejectionReason: string | null;
  verificationProvider: VerificationProvider | null;
  verificationReference: string | null;
  verificationResult: Record<string, unknown> | null;
  reapplyCount: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewerAdminId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const DOCUMENT_TYPES = ['GOVERNMENT_ID', 'DRIVING_LICENSE', 'REGISTRATION_CERTIFICATE', 'INSURANCE', 'PERMIT'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

import type { DriverDto } from './identity.js';
import type { VehicleDto } from './vehicles.js';

export const DOCUMENT_VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'FAILED', 'EXPIRED'] as const;
export type DocumentVerificationStatus = (typeof DOCUMENT_VERIFICATION_STATUSES)[number];

export interface DriverDocumentDto {
  id: string;
  driverId: string;
  applicationId: string;
  type: DocumentType;
  storageKey: string;
  documentHash: string;
  documentNumberMasked: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  verificationStatus: DocumentVerificationStatus;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriverProfileDetailDto {
  driver: DriverDto | null;
  vehicle: VehicleDto | null;
  application: DriverApplicationDto | null;
  documents: DriverDocumentDto[];
}
