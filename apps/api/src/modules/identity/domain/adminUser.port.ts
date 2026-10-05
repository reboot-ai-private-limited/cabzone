import type { AdminRole, AdminStatus, AdminUserEntity } from './adminUser.entity.js';

export interface AdminUserListFilter {
  search?: string | undefined;
  role?: AdminRole | undefined;
  status?: AdminStatus | undefined;
  zoneId?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface AdminUserWithUser extends AdminUserEntity {
  phoneE164: string;
}

export interface AdminUserRepositoryPort {
  findByUserId(userId: string): Promise<AdminUserEntity | null>;
  findById(id: string): Promise<AdminUserEntity | null>;
  save(admin: AdminUserEntity): Promise<AdminUserEntity>;
  update(
    id: string,
    updates: Partial<Pick<AdminUserEntity, 'name' | 'email' | 'role' | 'cityZoneIds' | 'status' | 'passwordHash'>>
  ): Promise<AdminUserEntity | null>;
  list(filter?: AdminUserListFilter): Promise<{ admins: AdminUserWithUser[]; total: number }>;
}
