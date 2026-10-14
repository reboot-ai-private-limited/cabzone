import type { DocumentType, DocumentVerificationStatus } from '@cabzone/contracts';

export interface DriverDocumentEntity {
  id: string;
  driverId: string;
  applicationId: string;
  type: DocumentType;
  storageKey: string;
  documentHash: string;
  documentNumberMasked: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  verificationStatus: DocumentVerificationStatus;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function isDocumentValid(doc: DriverDocumentEntity, now: Date = new Date()): boolean {
  if (doc.verificationStatus !== 'VERIFIED') return false;
  if (doc.type !== 'GOVERNMENT_ID' && doc.expiresAt === null) return false;
  if (doc.expiresAt !== null && doc.expiresAt <= now) return false;
  return true;
}
