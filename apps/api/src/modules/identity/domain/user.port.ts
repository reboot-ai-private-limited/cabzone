import type { UserEntity } from './user.entity.js';

export interface UserRepositoryPort {
  findById(userId: string): Promise<UserEntity | null>;
  findByPhone(phoneE164: string): Promise<UserEntity | null>;
  create(user: UserEntity): Promise<UserEntity>;
  update(user: UserEntity): Promise<UserEntity>;
}
