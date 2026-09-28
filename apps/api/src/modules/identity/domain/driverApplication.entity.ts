import type {
  DriverApplicationStatus,
  RejectionType,
  VerificationProvider,
} from '@Cabzone/contracts';

export interface DriverApplicationEntity {
  id: string;
  driverId: string;
  status: DriverApplicationStatus;
  rejectionType: RejectionType | null;
  rejectionReason: string | null;
  verificationProvider: VerificationProvider | null;
  verificationReference: string | null;
  verificationResult: Record<string, unknown> | null;
  reapplyCount: number;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewerAdminId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export function canSubmitApplication(app: DriverApplicationEntity): boolean {
  return app.status === 'DRAFT' || app.status === 'REAPPLIED';
}

export function canDriverReapply(
  app: DriverApplicationEntity,
  maxReapplyAttempts: number = 3,
): { allowed: boolean; reason?: string } {
  if (app.status !== 'REJECTED') {
    return { allowed: false, reason: `Cannot reapply while application status is ${app.status}` };
  }
  if (app.rejectionType === 'HARD_FRAUD') {
    return { allowed: false, reason: 'Permanent rejection due to fraudulent documentation' };
  }
  if (app.reapplyCount >= maxReapplyAttempts) {
    return { allowed: false, reason: `Maximum reapplication limit (${maxReapplyAttempts}) exceeded` };
  }
  return { allowed: true };
}
