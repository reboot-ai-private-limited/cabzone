import type {
  DocumentType,
  DocumentVerificationStatus,
  DriverApplicationStatus,
  RejectionType,
  VehicleCategory,
} from '@cabzone/contracts';
import { request } from '../client.js';

export interface DriverApplicationSummaryDto {
  application: {
    id: string;
    driverId: string;
    status: DriverApplicationStatus;
    rejectionType: RejectionType | null;
    rejectionReason: string | null;
    reapplyCount: number;
    submittedAt: string | null;
    reviewedAt: string | null;
    createdAt: string;
  };
  driver: {
    id: string;
    name?: string | null | undefined;
    alternatePhone?: string | null | undefined;
    gender?: string | null | undefined;
    dateOfBirth?: string | null | undefined;
    experience?: string | null | undefined;
    emergencyContact?: string | null | undefined;
    address?: string | null | undefined;
    dlNumber?: string | null | undefined;
    dlExpiry?: string | null | undefined;
    status: string;
    kycStatus: string;
    ratingAverage: number | null;
    ratingCount: number;
    trustScore?: number | null | undefined;
  } | null;
  phoneE164: string | null;
  vehicle: {
    id: string;
    vehicleType: VehicleCategory;
    make: string;
    model: string;
    registrationNumber: string;
    verificationStatus: string;
  } | null;
}

export interface DriverDocumentAdminDto {
  id: string;
  type: DocumentType;
  storageKey: string;
  documentNumberMasked: string | null;
  expiresAt: string | null;
  verificationStatus: DocumentVerificationStatus;
}

export interface DriverApplicationDetailDto extends DriverApplicationSummaryDto {
  documents: DriverDocumentAdminDto[];
}

export interface ReviewApplicationBody {
  status: 'APPROVED' | 'REJECTED';
  rejectionType?: RejectionType | null;
  rejectionReason?: string | null;
}

export interface ListDriverApplicationsQuery {
  status?: DriverApplicationStatus | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export const driversApi = {
  listApplications: (
    query: ListDriverApplicationsQuery,
    token?: string,
    signal?: AbortSignal,
  ) =>
    request<DriverApplicationSummaryDto[]>('/v1/admin/driver-applications', {
      method: 'GET',
      query: { status: query.status, limit: query.limit, offset: query.offset },
      token,
      signal,
    }),

  getApplication: (id: string, token?: string, signal?: AbortSignal) =>
    request<DriverApplicationDetailDto>(`/v1/admin/driver-applications/${id}`, {
      method: 'GET',
      token,
      signal,
    }),

  review: (id: string, body: ReviewApplicationBody, token?: string) =>
    request<unknown>(`/v1/admin/driver-applications/${id}/review`, {
      method: 'POST',
      body,
      token,
    }),
};
