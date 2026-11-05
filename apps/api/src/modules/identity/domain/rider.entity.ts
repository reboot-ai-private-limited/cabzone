import type { TrustScoreBreakdownDto, TrustTier } from '@cabzone/contracts';

export interface EmergencyContact {
  name: string;
  phoneE164: string;
}

export interface RiderEntity {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  emergencyContact: EmergencyContact | null;
  preferredLanguage: string | null;
  ratingAverage: number | null;
  ratingCount: number;
  trustScore?: number | null | undefined;
  trustTier?: TrustTier | null | undefined;
  trustBreakdown?: TrustScoreBreakdownDto | null | undefined;
  trustUpdatedAt?: Date | null | undefined;
  /** Sum of revealed star ratings. The average is derived from this, so it cannot drift. */
  ratingSum?: number | undefined;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
