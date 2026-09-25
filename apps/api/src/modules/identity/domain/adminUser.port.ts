import type { AdminUserEntity } from './adminUser.entity.js';

export interface AdminUserRepositoryPort {
  findByUserId(userId: string): Promise<AdminUserEntity | null>;
}
