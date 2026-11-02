import type {
  AdminDocumentPreviewDto,
  DocumentType,
  DocumentVerificationStatus,
  DriverApplicationStatus,
  RejectionType,
  VehicleCategory,
} from '@cabzone/contracts';
import { API_BASE_URL, request } from '../client.js';

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
    phoneE164?: string | null | undefined;
    profilePhotoUrl?: string | null | undefined;
    gender?: string | null | undefined;
    dateOfBirth?: string | null | undefined;
    experience?: string | null | undefined;
    alternatePhone?: string | null | undefined;
    emergencyContact?: string | null | undefined;
    hasEmergencyContact?: boolean | undefined;
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
  alternatePhone?: string | null;
  emergencyContact?: string | null;
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
  vehicleId?: string | null | undefined;
  storageKey: string;
  hasFile?: boolean | undefined;
  fileUrl?: string | null | undefined;
  documentNumberMasked: string | null;
  documentNumber?: string | null;
  expiresAt: string | null;
  verificationStatus: DocumentVerificationStatus;
}

export interface DriverApplicationDetailDto extends DriverApplicationSummaryDto {
  documents: DriverDocumentAdminDto[];
}


export interface UpdateDriverProfileBody {
  name?: string | null;
  phoneE164?: string | null;
  alternatePhone?: string | null;
  emergencyContact?: string | null;
  address?: string | null;
  dlNumber?: string | null;
  dlExpiry?: string | null;
  status?: 'ACTIVE' | 'SUSPENDED';
  vehicle?: {
    vehicleType?: VehicleCategory;
    make?: string;
    model?: string;
    registrationNumber?: string;
  };
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

const PRIVATE_STORAGE_KEY_PATTERN = /^driver-kyc\/[A-Za-z0-9_-]+\.(pdf|jpg|png)$/;
const SIGNED_DOCUMENT_PATH_PATTERN = /^\/api\/v1\/admin\/driver-documents\/[^/]+\/content$/;

export function hasDocumentPreviewFile(doc: Pick<DriverDocumentAdminDto, 'hasFile' | 'storageKey'>): boolean {
  if (typeof doc.hasFile === 'boolean') {
    return doc.hasFile;
  }
  return PRIVATE_STORAGE_KEY_PATTERN.test(doc.storageKey.trim());
}

/**
 * Resolves a backend-signed preview path against the configured API origin.
 * Rejects `data:`, `javascript:`, raw storage keys, and cross-origin URLs so
 * untrusted strings stored in legacy/seeded rows can never execute or exfiltrate.
 */
export function resolvePreviewContentUrl(
  previewUrl: string | null | undefined,
  apiBaseUrl: string = API_BASE_URL,
): string | null {
  if (!previewUrl) return null;
  const trimmed = previewUrl.trim();
  if (!trimmed) return null;

  let base: URL;
  try {
    base = new URL(apiBaseUrl);
  } catch {
    return null;
  }

  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    return null;
  }

  try {
    let resolved: URL;
    if (trimmed.startsWith('/api/')) {
      const rootHref = base.href.replace(/\/api\/?$/, '');
      resolved = new URL(rootHref + trimmed);
    } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      resolved = new URL(trimmed);
    } else {
      return null;
    }

    if (resolved.origin !== base.origin) {
      return null;
    }
    const basePrefix = base.pathname.replace(/\/api\/?$/, '');
    const relativePath =
      basePrefix && resolved.pathname.startsWith(basePrefix)
        ? resolved.pathname.slice(basePrefix.length)
        : resolved.pathname;

    if (!SIGNED_DOCUMENT_PATH_PATTERN.test(relativePath)) {
      return null;
    }
    if (!resolved.searchParams.get('exp') || !resolved.searchParams.get('sig')) {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

export function resolveSafeProfilePhotoUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isPdfPreview(
  mimeType: string | null | undefined,
  storageKey: string,
): boolean {
  if (mimeType) {
    return mimeType.toLowerCase() === 'application/pdf';
  }
  return storageKey.toLowerCase().endsWith('.pdf');
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

  previewDocument: (
    applicationId: string,
    documentId: string,
    token?: string,
    signal?: AbortSignal,
  ) =>
    request<AdminDocumentPreviewDto>(
      `/v1/admin/driver-applications/${applicationId}/documents/${documentId}/preview`,
      {
        method: 'POST',
        token,
        signal,
      },
    ),

  review: (id: string, body: ReviewApplicationBody, token?: string) =>
    request<unknown>(`/v1/admin/driver-applications/${id}/review`, {
      method: 'POST',
      body,
      token,
    }),

  updateDriverProfile: (
    id: string,
    body: UpdateDriverProfileBody,
    token?: string,
  ) =>
    request<DriverApplicationDetailDto>(`/v1/admin/driver-applications/${id}`, {
      method: 'PATCH',
      body,
      token,
    }),

  updateStatus: (
    id: string,
    body: { status: 'ACTIVE' | 'SUSPENDED'; reason?: string | null },
    token?: string,
  ) =>
    request<DriverApplicationDetailDto>(`/v1/admin/driver-applications/${id}/status`, {
      method: 'PATCH',
      body,
      token,
    }),
};
