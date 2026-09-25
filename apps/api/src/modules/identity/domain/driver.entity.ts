export type DriverStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
export type DriverKycStatus = 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'FAILED';
export type DriverOperationalStatus = 'OFFLINE' | 'ONLINE' | 'BUSY';

export interface DriverEntity {
  id: string;
  userId: string;
  status: DriverStatus;
  kycStatus: DriverKycStatus;
  operationalStatus: DriverOperationalStatus;
  ratingAverage: number | null;
  ratingCount: number;
  trustScore: number | null;
  currentVehicleId: string | null;
  walletId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DriverEligibilityResult {
  eligible: boolean;
  reason?: string;
}

export function canDriverGoOnline(driver: DriverEntity): DriverEligibilityResult {
  if (driver.status !== 'ACTIVE') {
    return { eligible: false, reason: `Driver account is ${driver.status}` };
  }
  if (driver.kycStatus !== 'VERIFIED') {
    return { eligible: false, reason: `KYC verification is ${driver.kycStatus}` };
  }
  if (!driver.currentVehicleId) {
    return { eligible: false, reason: 'No vehicle currently assigned' };
  }
  return { eligible: true };
}
