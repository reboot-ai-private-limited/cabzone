import type { AuthRole } from '@cabzone/contracts';
import type { AdminUserRepositoryPort } from './adminUser.port.js';
import type { DriverRepositoryPort } from './driver.port.js';
import type { RiderRepositoryPort } from './rider.port.js';

export interface ResolveUserRoleDeps {
  userId: string;
  adminRepo?: AdminUserRepositoryPort | undefined;
  driverRepo?: DriverRepositoryPort | undefined;
  riderRepo?: RiderRepositoryPort | undefined;
}

export async function resolveUserRole(deps: ResolveUserRoleDeps): Promise<AuthRole> {
  if (deps.adminRepo) {
    const admin = await deps.adminRepo.findByUserId(deps.userId);
    if (admin && admin.status === 'ACTIVE') {
      return admin.role;
    }
  }

  if (deps.driverRepo) {
    const driver = await deps.driverRepo.findByUserId(deps.userId);
    if (driver) {
      return 'DRIVER';
    }
  }

  if (deps.riderRepo) {
    const rider = await deps.riderRepo.findByUserId(deps.userId);
    if (rider) {
      return 'RIDER';
    }
  }

  return 'RIDER';
}
