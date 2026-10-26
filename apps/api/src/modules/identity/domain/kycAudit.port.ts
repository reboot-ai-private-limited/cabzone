export const KYC_AUDIT_ACTIONS = [
  'DOCUMENT_PREVIEWED',
  'APPLICATION_APPROVED',
  'APPLICATION_REJECTED',
  'DRIVER_STATUS_UPDATED',
  'DOCUMENT_EXPIRED',
] as const;

export type KycAuditAction = (typeof KYC_AUDIT_ACTIONS)[number];

export interface KycAuditLogEntry {
  id: string;
  actorUserId: string;
  actorRole: string;
  action: KycAuditAction;
  driverId: string;
  applicationId: string | null;
  documentId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface KycAuditRepositoryPort {
  record(entry: KycAuditLogEntry): Promise<void>;
  listByDriverId?(driverId: string): Promise<KycAuditLogEntry[]>;
}
