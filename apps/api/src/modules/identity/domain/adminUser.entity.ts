export type AdminRole = 'SUPER_ADMIN' | 'CITY_ADMIN' | 'SUPPORT_ADMIN' | 'FINANCE_ADMIN';
export type AdminStatus = 'ACTIVE' | 'SUSPENDED';

export interface AdminUserEntity {
  id: string;
  userId: string;
  role: AdminRole;
  cityZoneIds: string[];
  status: AdminStatus;
  createdAt: Date;
  updatedAt: Date;
}

export function canAdminManageZone(admin: AdminUserEntity, zoneId: string): boolean {
  if (admin.status !== 'ACTIVE') {
    return false;
  }
  if (admin.role === 'SUPER_ADMIN') {
    return true;
  }
  return admin.cityZoneIds.includes(zoneId);
}
